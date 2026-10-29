import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { handleAttachments } from "../services/attachments";
import { handleChat } from "../services/chat";
import { loadConversation } from "../services/conversations";
import { uploadFiles } from "../lib/attachments/client";
import { fileError, MAX_FILE_BYTES } from "../lib/attachments/types";
import { createDatabase, seed, databaseFetch, providerStream, reference, otherTrip, conversation } from "./chat-fixture";

let db: PGlite;
const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY"].map(key => [key, process.env[key]]));
const pdf = Buffer.from("%PDF-1.7\nSynthetic trip notes for testing only\n%%EOF");
let stored: Map<string, Buffer>;
let providerCalls: number;
let provider: typeof fetch;
let signedCalls: number;
before(async () => { db = await createDatabase(); });
after(async () => { await db.close(); });
beforeEach(async () => {
  await seed(db); stored = new Map(); providerCalls = 0; signedCalls = 0;
  Object.assign(process.env, { OPENAI_API_KEY: "test-key", SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_test" });
  provider = async () => providerStream();
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname !== "db.example") { providerCalls++; return provider(url, init); }
    if (target.pathname.startsWith("/storage/v1/object/upload/sign/")) {
      signedCalls++;
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("x-upsert"), null);
      return Response.json({ url: target.pathname.replace("/storage/v1", "") + "?token=test-token" });
    }
    if (target.pathname.startsWith("/storage/v1/object/authenticated/")) {
      const id = target.pathname.split("/").at(-1)!;
      return stored.has(id) ? new Response(new Uint8Array(stored.get(id)!)) : Response.json({ error: "missing" }, { status: 404 });
    }
    return databaseFetch(db, target, init);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
function request(method: string, body?: unknown, suffix = "", origin = "http://localhost") {
  return new Request(`http://localhost/api/trips/${reference}/attachments${suffix}`, { method, headers: { origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
function metadata(id = randomUUID(), type = "application/pdf", size = pdf.length, source = "chat") {
  return { id, name: type === "image/png" ? "trip.png" : type === "image/jpeg" ? "trip.jpg" : "trip.pdf", mediaType: type, size, source };
}
async function ready(trip = reference, source = "chat", bytes = pdf, type = "application/pdf") {
  const meta = metadata(randomUUID(), type, bytes.length, source);
  const response = await handleAttachments(request("POST", meta), trip);
  assert.equal(response.status, 200, await response.clone().text());
  stored.set(meta.id, bytes);
  assert.equal((await handleAttachments(request("PATCH"), trip, meta.id)).status, 200);
  return meta;
}
async function send(ids: string[], expectedLastId: string | null = null, retry = false) {
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, { method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ conversationId: conversation, expectedLastId, retry, message: retry ? null : { id: randomUUID(), text: "Read these notes", attachmentIds: ids } }) }), reference);
  await response.text();
  return response;
}

test("upload validation rejects unsafe metadata, origins and unknown trips before signing", async () => {
  for (const body of [null, {}, metadata(randomUUID(), "text/html"), metadata(randomUUID(), "application/pdf", MAX_FILE_BYTES + 1), { ...metadata(), name: "bad\nname.pdf" }, { ...metadata(), id: "../other" }]) {
    assert.equal((await handleAttachments(request("POST", body), reference)).status, 400);
  }
  assert.equal((await handleAttachments(request("POST", metadata(), "", "https://other.example"), reference)).status, 403);
  assert.equal((await handleAttachments(request("POST", metadata()), randomUUID())).status, 404);
  assert.equal((await handleAttachments(request("POST", { ...metadata(), padding: "x".repeat(2100) }), reference)).status, 413);
  assert.equal(signedCalls, 0);
  assert.equal(fileError({ name: "empty.pdf", type: "application/pdf", size: 0 }), "PDF files must be at least 1 byte and no larger than 5 MB.");
});

test("private upload intents are idempotent, server scoped, and verify bytes before readiness", async () => {
  const meta = metadata();
  const first = await (await handleAttachments(request("POST", { ...meta, path: "other-trip/private" }), reference)).json();
  assert.equal(new URL(first.uploadUrl).pathname, `/storage/v1/object/upload/sign/trip-attachments/${reference}/${meta.id}`);
  assert.doesNotMatch(JSON.stringify(first), /sb_secret/);
  assert.equal((await handleAttachments(request("POST", meta), reference)).status, 200);
  assert.equal((await db.query("select * from public.attachments")).rows.length, 1);
  assert.equal((await handleAttachments(request("POST", meta), otherTrip)).status, 409);
  stored.set(meta.id, Buffer.alloc(pdf.length, 65));
  assert.equal((await handleAttachments(request("PATCH"), reference, meta.id)).status, 400);
  assert.equal((await handleAttachments(request("GET"), reference, meta.id)).status, 409);
  stored.set(meta.id, pdf);
  assert.equal((await handleAttachments(request("PATCH"), reference, meta.id)).status, 200);
  const retried = await (await handleAttachments(request("POST", meta), reference)).json();
  assert.equal(retried.ready, true); assert.equal(retried.uploadUrl, undefined);
  assert.equal((await handleAttachments(request("GET"), otherTrip, meta.id)).status, 404);
  const download = await handleAttachments(request("GET"), reference, meta.id);
  assert.equal(await download.text(), pdf.toString());
  assert.equal(download.headers.get("cache-control"), "no-store");
  assert.match(download.headers.get("content-disposition")!, /^attachment;/);
});

test("starter files resolve requested ready trip documents, including reused files", async () => {
  const first = await ready(reference, "starter");
  await ready(reference, "starter");
  const response = await handleAttachments(request("GET", undefined, `?ids=${first.id}`), reference);
  assert.deepEqual((await response.json()).map((file: { id: string }) => file.id), [first.id]);
  assert.equal((await handleAttachments(request("GET", undefined, `?ids=${randomUUID()}`), reference)).status, 409);
  await send([first.id]);
  assert.equal((await handleAttachments(request("GET", undefined, `?ids=${first.id}`), reference)).status, 200);
});

test("attachment association rejects cross-trip, pending and duplicate IDs while allowing reuse", async () => {
  const foreign = await ready(otherTrip);
  const pending = metadata(); await handleAttachments(request("POST", pending), reference);
  for (const ids of [[foreign.id], [pending.id], [randomUUID()], [pending.id, pending.id], ["https://untrusted.example/file.pdf"]]) assert.equal((await send(ids)).status, 400);
  assert.equal((await loadConversation(reference, conversation)).messages.length, 0);
  assert.equal(providerCalls, 0);
  const file = await ready(); await send([file.id]);
  const snapshot = await loadConversation(reference, conversation);
  assert.equal(snapshot.messages[0].parts[1].type, "data-attachment");
  assert.equal((await send([file.id], snapshot.messages[1].id)).status, 200);
  assert.equal((await loadConversation(reference, conversation)).messages.length, 4);
});

test("provider receives private PDF and image bytes on initial and follow-up turns", async () => {
  const file = await ready();
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
  const picture = await ready(reference, "chat", png, "image/png");
  provider = async (_url, init) => {
    const body = String(init?.body);
    assert.match(body, /input_file/); assert.match(body, /input_image/);
    assert.ok(body.includes(pdf.toString("base64"))); assert.ok(body.includes(png.toString("base64")));
    assert.doesNotMatch(body, /test-token|sb_secret|https:\/\/db.example/);
    return providerStream();
  };
  assert.equal((await send([file.id, picture.id])).status, 200);
  const saved = await loadConversation(reference, conversation);
  assert.equal((await send([], saved.messages[1].id)).status, 200);
  assert.equal(providerCalls, 2);
});

test("reading failures preserve the message and files and can retry without uploading again", async () => {
  const file = await ready(); stored.delete(file.id);
  assert.equal((await send([file.id])).status, 503);
  const saved = await loadConversation(reference, conversation);
  assert.equal(saved.messages.length, 2); assert.equal(saved.messages[1].metadata?.status, "failed");
  assert.equal(providerCalls, 0);
  stored.set(file.id, pdf);
  assert.equal((await send([], saved.messages[1].id, true)).status, 200);
  assert.equal((await loadConversation(reference, conversation)).messages.length, 2);
});

test("database enforces file quotas and denies anonymous file access", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from public.attachments"), /permission denied/);
    await assert.rejects(db.query("select public.attachment_reserve($1,$2,'x.pdf','application/pdf',10,'chat')", [reference, randomUUID()]), /permission denied/);
    await db.exec("reset role");
  }
  let last: string | null = null;
  for (let turn = 0; turn < 2; turn++) {
    const files = await Promise.all([ready(), ready(), ready()]);
    assert.equal((await send(files.map(file => file.id), last)).status, 200);
    last = (await loadConversation(reference, conversation)).messages.at(-1)!.id;
  }
  assert.equal((await send([(await ready()).id], last)).status, 400);
  for (let i = 7; i < 30; i++) await handleAttachments(request("POST", metadata()), reference);
  assert.equal((await handleAttachments(request("POST", metadata()), reference)).status, 400);
  const bucket = (await db.query<{ public: boolean; file_size_limit: number }>("select * from storage.buckets")).rows[0];
  assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), MAX_FILE_BYTES);
});

test("client retries reuse upload IDs and reconcile an interrupted direct upload", async () => {
  const file = { id: randomUUID(), file: new File([pdf], "trip.pdf", { type: "application/pdf" }) };
  const attachment = { id: file.id, name: file.file.name, size: file.file.size, mediaType: file.file.type };
  let uploaded = false; let finalized = false; let puts = 0; const ids: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/finalize")) {
      assert.equal(init?.method, "POST"); assert.equal(uploaded, true); finalized = true; return Response.json(attachment);
    }
    if (init?.method === "POST") { ids.push(JSON.parse(String(init.body)).id); return Response.json({ document: attachment, ready: finalized, uploadUrl: "https://db.example/signed?token=limited" }); }
    assert.equal(init?.method, "PUT"); puts++; uploaded = true; throw new Error("connection dropped after storage accepted bytes");
  };
  assert.deepEqual(await uploadFiles(reference, [file], "chat", () => {}), [attachment]);
  assert.deepEqual(await uploadFiles(reference, [file], "chat", () => {}), [attachment]);
  assert.deepEqual(ids, [file.id, file.id]); assert.equal(puts, 1);
});
