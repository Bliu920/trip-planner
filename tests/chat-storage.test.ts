import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, seed, databaseFetch, reference, conversation, generation, providerStream } from "./chat-fixture";
import { beginTurn, loadConversation, saveReply } from "../services/assistant/conversation-store";
import { chatRpc, ConversationError } from "../services/assistant/conversation-store/database";
import { progressStore } from "../services/assistant/conversation-store";
import { handleChat } from "../services/assistant";
let db: PGlite;
const originalFetch = globalThis.fetch;
const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "OPENAI_API_KEY", "OPENAI_MODEL", "AGENT_WEB_SEARCH"];
const previous = keys.map(key => process.env[key]);
before(async () => { db = await createDatabase(); });
after(() => db.close());
beforeEach(async () => {
  await seed(db);
  Object.assign(process.env, { SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_fixture", OPENAI_API_KEY: "fixture", OPENAI_MODEL: "gpt-6-luna", AGENT_WEB_SEARCH: "false" });
  globalThis.fetch = async (url, init) => { assert.equal(new URL(String(url)).hostname, "db.example"); return databaseFetch(db, new URL(String(url)), init); };
});
afterEach(() => { globalThis.fetch = originalFetch; keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); });
const start = () => beginTurn(reference, { conversationId: conversation, expectedLastId: null, retry: false, message: { id: "storage-user", text: "Hello" } }, generation);

test("chat RPC errors retain safe HTTP and database facts without retaining response prose", async () => {
  globalThis.fetch = async () => Response.json({ code: "P0001", message: "CHAT_INVALID", detail: "private text" }, { status: 400 });
  await assert.rejects(chatRpc("chat_record_activity", {}), error => error instanceof ConversationError && error.diagnostic.code === "CHAT_INVALID" && error.diagnostic.httpStatus === 400 && error.diagnostic.databaseCode === "P0001" && !JSON.stringify(error).includes("private text"));
  globalThis.fetch = async () => { throw new TypeError("private network text"); };
  await assert.rejects(chatRpc("chat_write_reply", {}), error => error instanceof ConversationError && error.diagnostic.code === "CHAT_NETWORK_ERROR" && error.diagnostic.operation === "chat_write_reply");
});
test("a lost terminal reply response verifies exact persisted content without repeating the write", async () => {
  const turn = await start(); let writes = 0;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    const result = await databaseFetch(db, target, init);
    if (target.pathname.endsWith("/chat_write_reply")) { writes++; if (writes === 1) throw new TypeError("Lost response"); }
    return result;
  };
  await saveReply(reference, conversation, turn.responseId, generation, "Exact saved reply", "complete");
  assert.equal(writes, 1); assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "complete");
});
test("a lost failure-reply response verifies JSONB key ordering and cannot resurrect an old generation", async () => {
  const turn = await start(); let writes = 0;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url)), result = await databaseFetch(db, target, init);
    if (target.pathname.endsWith("/chat_write_reply_result")) { writes++; if (writes === 1) throw new TypeError("Lost response"); }
    return result;
  };
  await saveReply(reference, conversation, turn.responseId, generation, "Interrupted", "failed", { code: "provider_error", steps: 2, elapsedMs: 4, finishReason: "error", termination: undefined });
  assert.equal(writes, 1);
  await beginTurn(reference, { conversationId: conversation, expectedLastId: turn.responseId, retry: true, message: null }, randomUUID());
  await assert.rejects(saveReply(reference, conversation, turn.responseId, generation, "Late", "complete"), error => error instanceof ConversationError && error.diagnostic.code === "CHAT_REPLACED");
});
test("activity retries the identical idempotent entry after a lost response", async () => {
  const turn = await start(); let writes = 0;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url)), result = await databaseFetch(db, target, init);
    if (target.pathname.endsWith("/chat_record_activity")) { writes++; if (writes === 1) throw new TypeError("Lost response"); }
    return result;
  };
  await progressStore(reference, conversation, turn.responseId, generation)({ id: `${generation}:run`, attempt: generation, kind: "run", title: "Work on your trip", status: "running", detail: "", sources: [], documents: [] });
  assert.equal(writes, 2); assert.equal((await db.query("select * from public.message_activity")).rows.length, 1);
});
test("auxiliary activity-finish outage is diagnosed without falsely failing a completed reply", async t => {
  const warnings: string[] = []; t.mock.method(console, "warn", (...args: unknown[]) => warnings.push(args.map(String).join(" ")));
  let failures = 0;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname !== "db.example") { assert.equal(target.hostname, "api.openai.com"); return providerStream(); }
    if (target.pathname.endsWith("/chat_record_activity")) {
      const entry = JSON.parse(String(init?.body)).p_entry;
      if (entry.kind === "run" && entry.status === "complete") { failures++; return Response.json({ message: "private service diagnostic" }, { status: 503 }); }
    }
    return databaseFetch(db, target, init);
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, { method: "POST", headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "storage-user", text: "Hello" } }) }), reference);
  await response.text();
  const reply = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(failures, 2); assert.equal(reply.metadata?.status, "complete"); assert.ok(!reply.parts.some(part => part.type === "data-failure"));
  assert.match(warnings.join("\n"), /chat_persistence_error.*activity_finish.*CHAT_HTTP_503/); assert.doesNotMatch(warnings.join("\n"), /private service diagnostic|sb_secret_fixture/);
});


test("an auxiliary history outage cannot mask an exact provider-credit failure", async t => {
  t.mock.method(console, "warn", () => {});
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname !== "db.example") return Response.json({ error: { code: "credit_balance_exhausted", type: "insufficient_quota" } }, { status: 429 });
    if (target.pathname.endsWith("/chat_record_activity")) {
      const entry = JSON.parse(String(init?.body)).p_entry;
      if (entry.kind === "run" && entry.status === "failed") return Response.json({}, { status: 503 });
    }
    return databaseFetch(db, target, init);
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, { method: "POST", headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "storage-user", text: "Hello" } }) }), reference);
  await response.text();
  const failure = (await loadConversation(reference, conversation)).messages.at(-1)!.parts.find(part => part.type === "data-failure");
  assert.equal(failure?.data.code, "provider_limit"); assert.equal(failure?.data.providerReason, "credits_exhausted");
});

const chatRequest = () => new Request(`http://localhost/api/trips/${reference}/chat`, {
  method: "POST", headers: { origin: "http://localhost", "Content-Type": "application/json" },
  body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "storage-user", text: "Hello" } }),
});

test("progress startup failure finalizes once without invoking Agent", async t => {
  t.mock.method(console, "warn", () => {}); t.mock.method(console, "error", () => {});
  let providerCalls = 0, terminalWrites = 0;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname !== "db.example") { providerCalls++; return providerStream(); }
    if (target.pathname.endsWith("/chat_record_activity")) return Response.json({}, { status: 503 });
    if (target.pathname.endsWith("/chat_write_reply_result")) terminalWrites++;
    return databaseFetch(db, target, init);
  };
  let completion: Promise<void> | undefined;
  const response = await handleChat(chatRequest(), reference, work => { completion = work; });
  await response.text(); await completion;
  const reply = (await loadConversation(reference, conversation)).messages.at(-1)!;
  const report = reply.parts.find(part => part.type === "data-failure")?.data;
  assert.equal(providerCalls, 0); assert.equal(terminalWrites, 1);
  assert.equal(reply.metadata?.status, "failed");
  assert.equal(report?.code, "storage_error"); assert.equal(report?.termination?.stage, "activity"); assert.equal(report?.steps, 0);
});

test("queued heartbeat completes before the single terminal reply write", async t => {
  let tick: (() => void) | undefined;
  const cleared: unknown[] = [];
  const timer = { unref() {} } as unknown as NodeJS.Timeout;
  t.mock.method(globalThis, "setInterval", (callback: () => void) => { tick = callback; return timer; });
  t.mock.method(globalThis, "clearInterval", (value: unknown) => { cleared.push(value); });
  let release!: () => void, pending!: () => void;
  const heartbeatGate = new Promise<void>(resolve => { release = resolve; });
  const heartbeatStarted = new Promise<void>(resolve => { pending = resolve; });
  let streamingWrites = 0, terminalWrites = 0;
  const order: string[] = [];
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname !== "db.example") {
      assert.ok(tick, "heartbeat starts before provider work"); tick();
      await heartbeatStarted;
      return providerStream();
    }
    if (target.pathname.endsWith("/chat_write_reply")) {
      const body = JSON.parse(String(init?.body));
      if (body.p_status === "streaming" && ++streamingWrites === 2) { pending(); await heartbeatGate; order.push("heartbeat"); }
      if (body.p_status === "complete") { terminalWrites++; order.push("terminal"); }
    }
    return databaseFetch(db, target, init);
  };
  let completion: Promise<void> | undefined;
  const response = await handleChat(chatRequest(), reference, work => { completion = work; });
  const consumed = response.text();
  await heartbeatStarted;
  assert.equal(terminalWrites, 0);
  release(); await consumed; await completion;
  assert.deepEqual(order, ["heartbeat", "terminal"]);
  assert.equal(terminalWrites, 1); assert.ok(cleared.includes(timer));
  assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "complete");
});

test("stream construction failure records its boundary without an Agent result", async t => {
  t.mock.method(console, "warn", () => {});
  const { prepareTurn, replyLifecycle } = await import("../services/assistant/turn");
  const { replyStream } = await import("../services/assistant/stream");
  const { trip } = await import("./chat-fixture");
  const prepared = await prepareTurn(trip, { conversationId: conversation, expectedLastId: null, retry: false, message: { id: "storage-user", text: "Hello" } }, generation, new AbortController().signal, Date.now());
  const lifecycle = replyLifecycle(prepared);
  // Invalid transport header initialization fails before SDK execution.
  const originalResponse = globalThis.Response;
  class BrokenResponse extends originalResponse { constructor() { super(); throw new TypeError("Stream response setup failed"); } }
  t.mock.method(globalThis, "Response", BrokenResponse);
  // Restore Response before persistence uses the database transport.
  const originalSetup = lifecycle.onSetupError;
  lifecycle.onSetupError = async error => { t.mock.restoreAll(); await originalSetup(error); };
  await assert.rejects(replyStream(prepared.turn.responseId, { ...lifecycle, execute: () => {} }, () => {}), /Stream response setup failed/);
  const report = (await loadConversation(reference, conversation)).messages.at(-1)!.parts.find(part => part.type === "data-failure")?.data;
  assert.equal(report?.code, "provider_error"); assert.equal(report?.steps, 0); assert.equal(report?.termination?.stage, "open_stream");
});
