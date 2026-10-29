import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { FILE_FORMATS, FILE_ACCEPT, decodeText, uploadFormat, fileMetadataError, fileBytesError, createdTextFormat } from "../lib/file-types";
import { policySql } from "../scripts/file-types";
import { handleDocuments, handleDocumentText, readTextDocument, readDocumentContent, prepareDocument, publishDocument, getDocument } from "../services/documents";
import { resolveDocuments } from "../services/chat/documents";
import { beginTurn } from "../services/conversations";
import { openSession } from "../services/workspace";
import type { DocumentSummary } from "../lib/documents/types";
import { createDatabase, databaseFetch, seed, reference, otherTrip, conversation, generation } from "./chat-fixture";

let db: PGlite;
let stored: Map<string, Buffer>;
let onRead: (() => Promise<void>) | undefined;
const originalFetch = globalThis.fetch;
const environment = Object.fromEntries(["SUPABASE_URL", "SUPABASE_SECRET_KEY"].map(key => [key, process.env[key]]));
before(async () => { db = await createDatabase(); });
after(() => db.close());
beforeEach(async () => {
  await seed(db); stored = new Map(); onRead = undefined;
  Object.assign(process.env, { SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_test" });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "db.example", "No live service calls");
    const root = "/storage/v1/object/";
    if (url.pathname.startsWith(root + "upload/sign/")) return Response.json({ url: url.pathname.replace("/storage/v1", "") + "?token=limited" });
    if (url.pathname.startsWith(root + "authenticated/")) {
      const bytes = stored.get(url.pathname.slice((root + "authenticated/trip-attachments/").length));
      await onRead?.();
      return bytes ? new Response(new Uint8Array(bytes)) : Response.json({}, { status: 404 });
    }
    if (url.pathname === root + "trip-attachments" && init?.method === "DELETE") {
      for (const path of JSON.parse(String(init.body)).prefixes) stored.delete(path);
      return Response.json([]);
    }
    if (url.pathname.startsWith(root + "trip-attachments/") && init?.method === "POST") {
      const path = url.pathname.slice((root + "trip-attachments/").length);
      assert.equal(stored.has(path), false);
      stored.set(path, Buffer.from(String(init.body)));
      return Response.json({});
    }
    return databaseFetch(db, url, init);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/trips/fixture/documents", { method, headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function upload(name: string, mime: string, bytes: Buffer) {
  const id = randomUUID();
  const response = await handleDocuments(request("POST", { id, name, mediaType: mime, size: bytes.length, source: "library" }), reference);
  assert.equal(response.status, 200, await response.clone().text());
  stored.set(`${reference}/${id}`, bytes);
  return { id, response: await handleDocuments(request("POST"), reference, id, "finalize") };
}
async function create(name: string, markdown = "", kind = "working") {
  return handleDocumentText(request("POST", { id: randomUUID(), name, markdown, kind, expectedRevision: 0 }), reference);
}

test("registry, generated SQL, database checks and bucket MIME policy agree", async () => {
  const result = await db.query<{ policy: unknown }>("select library_file_types() as policy");
  assert.deepEqual(result.rows[0].policy, FILE_FORMATS);
  const migration = await readFile(new URL("../supabase/migrations/20261028114425_supported_files.sql", import.meta.url), "utf8");
  assert.ok(migration.includes(policySql()), "Regenerate the SQL policy when changing formats");
  const bucket = await db.query<{ allowed_mime_types: string[] }>("select allowed_mime_types from storage.buckets where id='trip-attachments'");
  assert.deepEqual(bucket.rows[0].allowed_mime_types.sort(), FILE_FORMATS.map(f => f.mime).sort());
  for (const format of FILE_FORMATS) {
    assert.ok(FILE_ACCEPT.includes(format.mime));
    for (const extension of format.extensions) assert.equal(uploadFormat(`File${extension.toUpperCase()}`, "")?.id, format.id);
    assert.ok(fileMetadataError(`File${format.extensions[0]}`, format.mime, format.maxBytes + 1));
    if (format.minBytes) assert.ok(fileMetadataError(`File${format.extensions[0]}`, format.mime, 0));
  }
});

test("extension and browser MIME must agree; UTF-8 text is lossless and binary masquerades fail", () => {
  for (const name of ["file.exe", "file.docx", "file.xls", "file.svg", "file.html", "file", "file.txt.exe"]) assert.equal(uploadFormat(name, "text/plain"), undefined);
  assert.equal(uploadFormat("data.csv", "application/vnd.ms-excel")?.mime, "text/csv");
  assert.equal(uploadFormat("data.csv", "application/octet-stream")?.mime, "text/csv");
  assert.equal(uploadFormat("data.csv", "image/png"), undefined);
  assert.equal(createdTextFormat("report.docx", "working"), undefined);
  assert.equal(createdTextFormat("Notes", "working")?.mime, "text/markdown");
  const csv = '\ufeffcity,note\r\nRoma,"café, tomorrow"\r\n';
  assert.equal(decodeText(Buffer.from(csv)), csv);
  assert.ok(fileBytesError("text/plain", Buffer.from([0xc3, 0x28])));
  assert.ok(fileBytesError("text/markdown", Buffer.from("binary\0data")));
  assert.equal(fileBytesError("text/plain", Buffer.alloc(0)), null);
  assert.ok(fileBytesError("application/pdf", Buffer.from("fake pdf")));
});

test("uploaded text starts with a version, edits preserve identity and original, deletion cleans every path", async () => {
  for (const [name, mime] of [["notes.md", "text/plain"], ["notes.txt", ""], ["data.csv", "application/vnd.ms-excel"]]) {
    const raw = 'name,value\r\n"café, Roma",1\r\n';
    const { id, response } = await upload(name, mime, Buffer.from(raw));
    assert.equal(response.status, 200, await response.clone().text());
    const initial = await response.json() as DocumentSummary;
    assert.equal(initial.contentRevision, 1);
    assert.equal((await readTextDocument(reference, id)).markdown, raw);
    assert.equal((await handleDocuments(request("POST"), reference, id, "finalize")).status, 200);
    const result = await handleDocumentText(request("PUT", { name, kind: "upload", markdown: "", expectedRevision: initial.revision }), reference, id);
    assert.equal(result.status, 200, await result.clone().text());
    const edited = await result.json() as DocumentSummary;
    assert.equal(edited.id, id); assert.equal(edited.kind, "upload"); assert.equal(edited.contentRevision, 2); assert.equal(edited.size, 0);
    assert.equal((await readTextDocument(reference, id)).markdown, "");
    assert.equal((await readTextDocument(reference, id, 1)).markdown, raw);
    assert.equal((await readDocumentContent(reference, id)).bytes.length, 0);
    await assert.rejects(readTextDocument(otherTrip, id), /found/);
    const stale = await handleDocumentText(request("PUT", { name, kind: "upload", markdown: "stale", expectedRevision: initial.revision }), reference, id);
    assert.equal(stale.status, 409);
    const disguised = await handleDocuments(request("PATCH", { name: "disguised.pdf", revision: edited.revision }), reference, id);
    assert.equal(disguised.status, 400);
    await db.query("update attachments set signed_until=now()-interval '1 minute' where id=$1", [id]);
    await handleDocuments(request("DELETE", { revision: edited.revision }), reference, id);
    assert.equal((await getDocument(reference, id)).status, "deleted");
    assert.equal([...stored.keys()].some(path => path.includes(id)), false);
  }
});

test("unsupported or corrupt uploads never become ready and PDF stays read-only", async () => {
  for (const [name, mime, bytes] of [["bad.txt", "text/plain", Buffer.from([0xff])], ["bad.csv", "text/csv", Buffer.from("x\0y")], ["bad.pdf", "application/pdf", Buffer.from("pretend PDF")]] as const) {
    const { id, response } = await upload(name, mime, bytes);
    assert.equal(response.status, 400);
    assert.equal((await getDocument(reference, id)).status, "pending");
    await assert.rejects(readDocumentContent(reference, id));
  }
  const denied = await handleDocuments(request("POST", { id: randomUUID(), name: "unsafe.svg", mediaType: "image/svg+xml", size: 10, source: "library" }), reference);
  assert.equal(denied.status, 400);
  const { id, response } = await upload("ticket.pdf", "application/pdf", Buffer.from("%PDF-1.7\n%%EOF"));
  assert.equal(response.status, 200);
  const saved = await response.json();
  await assert.rejects(readTextDocument(reference, id), /not an editable/);
  const edited = await handleDocumentText(request("PUT", { name: "ticket.pdf", kind: "upload", expectedRevision: saved.revision, markdown: "replace" }), reference, id);
  assert.equal(edited.status, 400);
});

test("text creation rejects unsupported formats, oversized multibyte content and misleading type names", async () => {
  for (const name of ["a.pdf", "a.png", "a.docx", "a.html", "a.exe"]) assert.equal((await create(name, "hello")).status, 400);
  assert.equal((await create("a.csv", "hello", "planning_context")).status, 400);
  assert.equal((await create("a.txt", "hello", "upload")).status, 400);
  assert.equal((await create("a.txt", "é".repeat(140000))).status, 400);
  assert.equal((await create("a.txt", "\ud800")).status, 400);
  for (const name of ["empty.md", "empty.txt", "empty.csv"]) {
    const saved = await create(name); assert.equal(saved.status, 200, await saved.clone().text());
    const doc = await saved.json(); assert.equal(doc.size, 0); assert.equal((await readTextDocument(reference, doc.id)).markdown, "");
  }
});

test("AI queries dispatch from authoritative metadata and staging rejects unsupported writes immediately", async () => {
  const { id, response } = await upload("data.csv", "", Buffer.from("name,value\nRome,10"));
  const file = await response.json();
  const messages = await resolveDocuments(reference, [{ role: "user", content: "Read it" }], [{ ...file, mediaType: "application/pdf" }]);
  assert.ok(JSON.stringify(messages).includes("Rome,10"));
  assert.equal(JSON.stringify(messages).includes('"type":"file"'), false);
  const turn = await beginTurn(reference, { conversationId: conversation, expectedLastId: null, retry: false, message: { id: "library-types", text: "Edit my file" } }, generation);
  const agent = await openSession(reference, conversation, turn.responseId, generation, new AbortController().signal);
  assert.equal((await agent.readDocument(id, null) as { markdown: string }).markdown, "name,value\nRome,10");
  await assert.rejects(agent.stageDocument({ id: randomUUID(), name: "unsafe.html", markdown: "hello", kind: "working", expectedRevision: 0 }), /read-only|Create/);
  assert.equal(stored.size, 1, "Invalid stages must not write objects");
  const literal = "# Same\nfirst\n\n# Same\nsecond\n\n```csv\na,b\n1,2\n```\n";
  const markdownResponse = await create("literal.md", literal);
  const markdownFile = await markdownResponse.json();
  assert.equal((await agent.readDocument(markdownFile.id, null) as { markdown: string }).markdown, literal, "Headings and fences are ordinary file content");

  await agent.stageDocument({ id, name: file.name, markdown: "name,value\nRome,20", kind: "upload", expectedRevision: file.revision });
  assert.equal((await readTextDocument(reference, id)).markdown, "name,value\nRome,10", "Staging is not publishing");
});

test("concurrent edits cannot pair old bytes with current metadata or silently overwrite a winning edit", async () => {
  const created = await create("notes.txt", "before"); const file = await created.json();
  const edit = { id: file.id, name: file.name, kind: "working" as const, expectedRevision: file.revision, markdown: "after" };
  const first = await prepareDocument(reference, edit, "user");
  const second = await prepareDocument(reference, { ...edit, markdown: "stale" }, "agent");
  onRead = async () => { onRead = undefined; await publishDocument(reference, first); };
  await assert.rejects(readTextDocument(reference, file.id), /changed while loading/);
  await assert.rejects(publishDocument(reference, second), /changed/);
  assert.equal((await readTextDocument(reference, file.id)).markdown, "after");
});

test("database rejects unsupported creations and formats independently of application checks", async () => {
  for (const name of ["bad.docx", "bad.pdf", "bad.svg"]) {
    await assert.rejects(db.query("select document_stage($1,$2,$3,$4,'working',0,10,$5,'agent')", [reference, randomUUID(), randomUUID(), name, "a".repeat(64)]), /DOCUMENT_INVALID/);
  }
  await assert.rejects(db.query("select attachment_reserve($1,$2,'spoof.txt','image/png',10,'library')", [reference, randomUUID()]), /DOCUMENT_INVALID/);
  await assert.rejects(db.query("select attachment_reserve($1,$2,'huge.txt','text/plain',262145,'library')", [reference, randomUUID()]), /supported_file/);
  await db.exec("set role anon");
  await assert.rejects(db.query("select library_file_types()"), /permission/);
  await db.exec("reset role");
});

test("downloads and AI reads reject corrupted versions, including edited uploads", async () => {
  const { id, response } = await upload("notes.txt", "text/plain", Buffer.from("hello"));
  assert.equal(response.status, 200);
  stored.set(`${reference}/${id}`, Buffer.from("other"));
  await assert.rejects(readTextDocument(reference, id), /match/);
  await assert.rejects(readDocumentContent(reference, id), /match/);
});
