import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { getDocument, handleDocuments, readDocumentContent } from "../services/documents";
import type { DocumentRef, DocumentSummary } from "../lib/documents/types";
import { createDatabase, databaseFetch, seed, reference, otherTrip, conversation, generation } from "./chat-fixture";

let db: PGlite;
let stored: Map<string, Buffer>;
let removalFails: boolean;
let onRead: (() => Promise<void>) | undefined;
const pdf = Buffer.from("%PDF-1.7\nPrivate booking\n%%EOF");
const originalFetch = globalThis.fetch;
const environment = Object.fromEntries(["SUPABASE_URL", "SUPABASE_SECRET_KEY"].map(key => [key, process.env[key]]));
before(async () => { db = await createDatabase(); });
after(async () => { await db.close(); });
beforeEach(async () => {
  await seed(db); stored = new Map(); removalFails = false; onRead = undefined;
  Object.assign(process.env, { SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_test" });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "db.example");
    if (url.pathname.startsWith("/storage/v1/object/upload/sign/")) return Response.json({ url: url.pathname.replace("/storage/v1", "") + "?token=limited" });
    if (url.pathname.startsWith("/storage/v1/object/authenticated/")) {
      const id = url.pathname.split("/").at(-1)!;
      const bytes = stored.get(id);
      await onRead?.();
      return bytes ? new Response(new Uint8Array(bytes)) : Response.json({ error: "missing" }, { status: 404 });
    }
    if (url.pathname === "/storage/v1/object/trip-attachments" && init?.method === "DELETE") {
      if (removalFails) return Response.json({ error: "Storage unavailable" }, { status: 503 });
      const { prefixes } = JSON.parse(String(init.body));
      for (const path of prefixes) stored.delete(path.split("/").at(-1));
      return Response.json([]);
    }
    return databaseFetch(db, url, init);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
function request(method: string, body?: unknown, suffix = "", trip = reference) {
  return new Request(`http://localhost/api/trips/${trip}/documents${suffix}`, {
    method, headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function reserve(trip = reference, id: string = randomUUID(), source = "library") {
  const response = await handleDocuments(request("POST", { id, name: "booking.pdf", mediaType: "application/pdf", size: pdf.length, source }, "", trip), trip);
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).document as DocumentSummary;
}
async function ready(trip = reference) {
  const document = await reserve(trip);
  stored.set(document.id, pdf);
  const response = await handleDocuments(request("POST"), trip, document.id, "finalize");
  assert.equal(response.status, 200, await response.clone().text());
  return await response.json() as DocumentSummary;
}
async function begin(ids: string[], expected: string | null = null, chat = conversation) {
  return (await db.query<{ value: { responseId: string; documents: DocumentRef[] } }>("select public.chat_begin_turn($1,$2,$3,$4,'Use my documents',false,$5,$6) as value", [reference, chat, expected, randomUUID(), generation, ids])).rows[0].value;
}
async function finish(id: string, chat = conversation) {
  await db.query("select public.chat_write_reply($1,$2,$3,$4,'Saved reply','complete')", [reference, chat, id, generation]);
}

test("library stores unbound files, scopes listing and never exposes Storage paths", async () => {
  const document = await ready(); await ready(otherTrip);
  const response = await handleDocuments(request("GET"), reference);
  const records: DocumentSummary[] = await response.json();
  assert.deepEqual(records.map(item => item.id), [document.id]);
  assert.deepEqual(records[0].usages, []);
  assert.equal(records[0].originalName, "booking.pdf");
  assert.doesNotMatch(JSON.stringify(records), /trip_reference|trip-attachments|sb_secret|path/);
  assert.equal((await handleDocuments(request("GET"), otherTrip, document.id)).status, 404);
  assert.equal((await handleDocuments(request("GET"), randomUUID())).status, 404);
});

test("rename is versioned, preserves original identity and allows recovery from another entrypoint", async () => {
  const document = await ready();
  const renamed = await handleDocuments(request("PATCH", { name: "Train ticket.pdf", revision: document.revision }), reference, document.id);
  assert.equal(renamed.status, 200);
  const current = await renamed.json() as DocumentSummary;
  assert.equal(current.originalName, "booking.pdf"); assert.equal(current.name, "Train ticket.pdf");
  assert.equal(current.revision, document.revision + 1);
  assert.equal((await handleDocuments(request("PATCH", { name: "Stale.pdf", revision: document.revision }), reference, document.id)).status, 409);
  assert.equal((await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id)).status, 409);
  assert.equal((await reserve(reference, document.id, "chat")).name, "Train ticket.pdf");
  assert.deepEqual((await readDocumentContent(reference, document.id)).bytes, pdf);
});

test("preview and download use verified bytes with private response headers", async () => {
  const document = await ready();
  const inline = await handleDocuments(request("GET", undefined, `/${document.id}/content?inline=1`), reference, document.id, "content");
  assert.equal(inline.headers.get("cache-control"), "no-store");
  assert.equal(inline.headers.get("x-content-type-options"), "nosniff");
  assert.match(inline.headers.get("content-disposition")!, /^inline;/);
  assert.equal(await inline.text(), pdf.toString());
  const download = await handleDocuments(request("GET"), reference, document.id, "content");
  assert.match(download.headers.get("content-disposition")!, /^attachment;/);
});

test("one document can be used repeatedly and across conversations without duplicating originals", async () => {
  const document = await ready();
  const first = await begin([document.id]); await finish(first.responseId);
  const second = await begin([document.id], first.responseId); await finish(second.responseId);
  assert.equal(second.documents.length, 1);
  const next = randomUUID(); await db.query("select public.chat_snapshot($1,null,$2)", [reference, next]);
  assert.equal((await begin([document.id], null, next)).documents.length, 1);
  assert.equal((await getDocument(reference, document.id)).usages.length, 3);
  assert.equal(stored.size, 1);
  await db.query("delete from public.conversations where id = $1", [conversation]);
  assert.equal((await getDocument(reference, document.id)).status, "ready");
  assert.equal((await getDocument(reference, document.id)).usages.length, 1);
});

test("selection removal retains message history and document while respecting active generation", async () => {
  const document = await ready();
  const turn = await begin([document.id]);
  await assert.rejects(db.query("select public.chat_document_remove($1,$2,$3)", [reference, conversation, document.id]), /CHAT_BUSY/);
  await finish(turn.responseId);
  await db.query("select public.chat_document_remove($1,$2,$3)", [reference, conversation, document.id]);
  const snapshot = (await db.query<{ value: { documents: DocumentRef[]; messages: unknown[] } }>("select public.chat_snapshot($1,$2) as value", [reference, conversation])).rows[0].value;
  assert.equal(snapshot.documents.length, 0); assert.equal(snapshot.messages.length, 2);
  assert.equal((await getDocument(reference, document.id)).usages.length, 1);
  assert.equal((await begin([], turn.responseId)).documents.length, 0);
});

test("deletion revokes access and selections, preserves history and blocks resurrection", async () => {
  const document = await ready();
  const turn = await begin([document.id]); await finish(turn.responseId);
  const deleted = await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id);
  assert.equal(deleted.status, 202); assert.equal((await deleted.json()).status, "deleting");
  assert.equal(stored.has(document.id), false);
  assert.equal((await handleDocuments(request("GET"), reference, document.id, "content")).status, 410);
  assert.equal((await handleDocuments(request("POST"), reference, document.id, "finalize")).status, 410);
  assert.equal((await handleDocuments(request("PATCH", { name: "Restore", revision: document.revision + 1 }), reference, document.id)).status, 410);
  assert.equal((await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id)).status, 202);
  assert.equal((await getDocument(reference, document.id)).usages.length, 1);
  await assert.rejects(begin([document.id], turn.responseId), /ATTACHMENT_INVALID/);
  assert.equal((await begin([], turn.responseId)).documents.length, 0);
});

test("manual deletion retries failures and removes late uploads after signed grants expire", async () => {
  const document = await ready(); removalFails = true;
  assert.equal((await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id)).status, 202);
  assert.equal(stored.has(document.id), true);
  assert.equal((await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id)).status, 202);
  removalFails = false;
  assert.equal((await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id)).status, 202);
  assert.equal(stored.has(document.id), false);
  assert.equal((await getDocument(reference, document.id)).status, "deleting");
  stored.set(document.id, pdf); // A previously granted upload arrives late.
  await db.query("update public.attachments set signed_until = now() - interval '1 second' where id = $1", [document.id]);
  assert.equal((await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id)).status, 200);
  assert.equal(stored.has(document.id), false);
  assert.equal((await getDocument(reference, document.id)).status, "deleted");
  assert.deepEqual(await (await handleDocuments(request("GET"), reference)).json(), []);
});


test("finalization and content reads cannot revive or return a concurrently deleted document", async () => {
  const document = await reserve(); stored.set(document.id, pdf);
  onRead = async () => {
    await db.query("select public.document_mutate($1,$2,'delete',$3)", [reference, document.id, document.revision]);
  };
  assert.equal((await handleDocuments(request("POST"), reference, document.id, "finalize")).status, 410);
  onRead = undefined;
  const saved = await ready();
  onRead = async () => {
    await db.query("select public.document_mutate($1,$2,'delete',$3)", [reference, saved.id, saved.revision]);
  };
  await assert.rejects(readDocumentContent(reference, saved.id), /deleted/);
});

test("quotas include unfinished deletion until a manual retry completes it", async () => {
  const document = await ready();
  for (let i = 1; i < 30; i++) await reserve();
  await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id);
  const extra = { id: randomUUID(), name: "booking.pdf", mediaType: "application/pdf", size: pdf.length, source: "library" };
  assert.equal((await handleDocuments(request("POST", extra), reference)).status, 400);
  await db.query("update public.attachments set signed_until = now() - interval '1 second' where id = $1", [document.id]);
  assert.equal((await handleDocuments(request("DELETE", { revision: document.revision }), reference, document.id)).status, 200);
  assert.equal((await handleDocuments(request("POST", extra), reference)).status, 200);
});

test("metadata operations reject unauthorized access", async () => {
  const document = await ready();
  const foreignOrigin = new Request(`http://localhost/api/trips/${reference}/documents`, { headers: { origin: "https://other.example" } });
  assert.equal((await handleDocuments(foreignOrigin, reference)).status, 403);
  assert.equal((await handleDocuments(request("PATCH", { name: "x", revision: document.revision }), otherTrip, document.id)).status, 404);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const table of ["message_documents", "conversation_documents"]) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
    await assert.rejects(db.query("select public.document_list($1)", [reference]), /permission denied/);
    await db.exec("reset role");
  }
  await assert.rejects(db.query("delete from public.trips where reference = $1", [reference]), /foreign key constraint/);
});

test("migration preserves legacy IDs, paths and historical message associations", async () => {
  const legacy = await createDatabase(false);
  try {
    await seed(legacy);
    const id = randomUUID();
    await legacy.query("select public.attachment_reserve($1,$2,'old.pdf','application/pdf',10,'chat')", [reference, id]);
    await legacy.query("update public.attachments set status = 'ready' where id = $1", [id]);
    await legacy.query("select public.chat_begin_turn($1,$2,null,'legacy-user','Use this file',false,$3,$4)", [reference, conversation, generation, [id]]);
    await legacy.exec(await readFile(new URL("../supabase/migrations/20261026110643_documents.sql", import.meta.url), "utf8"));
    const record = (await legacy.query<{ id: string; path: string; original_name: string }>("select * from public.attachments where id = $1", [id])).rows[0];
    assert.equal(record.id, id); assert.equal(record.path, `${reference}/${id}`); assert.equal(record.original_name, "old.pdf");
    assert.equal((await legacy.query("select * from public.message_documents where document_id = $1", [id])).rows.length, 1);
    assert.equal((await legacy.query("select * from public.conversation_documents where document_id = $1", [id])).rows.length, 1);
    await legacy.query("delete from public.conversations where id = $1", [conversation]);
    assert.equal((await legacy.query("select * from public.attachments where id = $1", [id])).rows.length, 1);
  } finally { await legacy.close(); }
});

test("retirement removes maintenance functions and columns without expiring files", async () => {
  const incomplete = await reserve();
  const saved = await ready();
  await db.query("update public.attachments set last_activity_at = now() - interval '25 hours'");
  const functions = await db.query<{ batch: unknown; abandoned: unknown }>("select to_regprocedure('public.document_cleanup_batch(integer)') as batch, to_regprocedure('public.document_abandoned(uuid)') as abandoned");
  assert.deepEqual(functions.rows[0], { batch: null, abandoned: null });
  const columns = await db.query("select column_name from information_schema.columns where table_schema='public' and ((table_name='attachments' and column_name='cleanup_at') or (table_name='document_writes' and column_name='cleaned'))");
  assert.equal(columns.rows.length, 0);
  assert.equal((await getDocument(reference, incomplete.id)).status, "pending");
  assert.equal((await getDocument(reference, saved.id)).status, "ready");
});
