import { handleConversationDocument } from "../services/assistant/request";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { resolveDocuments } from "../services/assistant/agent/context/messages";
import { createDatabase, databaseFetch, seed, reference, otherTrip, conversation } from "./chat-fixture";
import type { DocumentRef } from "../lib/documents/types";

let db: PGlite;
let reads: string[];
let stored: Map<string, Buffer>;
const pdf = Buffer.from("%PDF-1.7\nPrivate source content\n%%EOF");
const originalFetch = globalThis.fetch;
const previousEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
before(async () => { db = await createDatabase(); });
after(async () => { await db.close(); });
beforeEach(async () => {
  await seed(db); reads = []; stored = new Map();
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(target.hostname, "db.example", "Tests must never call a real provider");
    if (target.pathname.startsWith("/storage/v1/object/authenticated/")) {
      const id = target.pathname.split("/").at(-1)!; reads.push(id);
      return stored.has(id) ? new Response(new Uint8Array(stored.get(id)!)) : Response.json({ error: "missing" }, { status: 404 });
    }
    return databaseFetch(db, target, init);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
async function ready(trip = reference): Promise<DocumentRef> {
  const document = { id: randomUUID(), name: "ticket.pdf", mediaType: "application/pdf", size: pdf.length };
  await db.query("select public.attachment_reserve($1,$2,$3,$4,$5,'library')", [trip, document.id, document.name, document.mediaType, document.size]);
  await db.query("select public.document_mutate($1,$2,'finalize')", [trip, document.id]);
  stored.set(document.id, pdf);
  return document;
}

test("chat supplies selected originals once while retaining historical references", async () => {
  const document = await ready();
  const messages = await resolveDocuments(reference, [
    { role: "user", content: "Read this", attachments: [document] },
    { role: "assistant", content: "Earlier interpretation" },
    { role: "user", content: "Use it again", attachments: [document] },
  ], [document, document]);
  assert.deepEqual(reads, [document.id]);
  assert.equal(messages[0].role, "user");
  assert.match(String(messages[0].content), /Historical document references/);
  const content = messages[2].content;
  assert.ok(Array.isArray(content));
  const files = content.filter(part => part.type === "file");
  assert.equal(files.length, 1);
  assert.deepEqual(files[0].data, pdf);
});

test("inactive or deleted historical references never trigger original reads", async () => {
  const document = await ready();
  await db.query("select public.document_mutate($1,$2,'delete',2)", [reference, document.id]);
  const messages = await resolveDocuments(reference, [{ role: "user", content: "Continue without it", attachments: [document] }], []);
  assert.deepEqual(reads, []);
  assert.match(String(messages[0].content), /References alone do not provide original file contents/);
});

test("selected unreadable and foreign documents fail explicitly instead of silently dropping content", async () => {
  const missing = await ready(); stored.delete(missing.id);
  await assert.rejects(resolveDocuments(reference, [{ role: "user", content: "Read this" }], [missing]), /Could not read or save/);
  const foreign = await ready(otherTrip);
  await assert.rejects(resolveDocuments(reference, [{ role: "user", content: "Read this" }], [foreign]), /could not be found/);
  assert.equal(reads.includes(foreign.id), false);
});

test("context limit is enforced before file reads", async () => {
  const documents = Array.from({ length: 7 }, () => ({ id: randomUUID(), name: "file.pdf", mediaType: "application/pdf", size: pdf.length }));
  await assert.rejects(resolveDocuments(reference, [{ role: "user", content: "Read" }], documents), /no more than six/);
  assert.deepEqual(reads, []);
});

test("conversation selection endpoint validates origin and trip ownership", async () => {
  const document = await ready();
  const url = `http://localhost/api/trips/${reference}/conversations/${conversation}/documents/${document.id}`;
  assert.equal((await handleConversationDocument(new Request(url, { method: "DELETE", headers: { origin: "https://foreign.example" } }), reference, conversation, document.id)).status, 403);
  assert.equal((await handleConversationDocument(new Request(url, { method: "DELETE" }), otherTrip, conversation, document.id)).status, 404);
  assert.equal((await handleConversationDocument(new Request(url, { method: "DELETE" }), reference, conversation, document.id)).status, 200);
  assert.equal(stored.has(document.id), true);
});
