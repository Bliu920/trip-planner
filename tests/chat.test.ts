import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { functionStream, setToolRequest } from "./plan-fixture";
import { activityEntries } from "../lib/activity/model";
import { handleChat } from "../services/chat/index";
import { loadConversation } from "../services/conversations/index";
import { createDatabase, seed, databaseFetch, providerStream, reference, conversation, otherTrip } from "./chat-fixture";

let db: PGlite;
const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(["OPENAI_API_KEY", "OPENAI_MODEL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"].map(key => [key, process.env[key]]));
let calls = 0;
let provider: typeof fetch;
before(async () => { db = await createDatabase(); });
after(async () => { await db.close(); });
beforeEach(async () => {
  await seed(db); calls = 0;
  Object.assign(process.env, { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-6.1-terra", SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_test" });
  provider = async () => providerStream();
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname === "db.example") return databaseFetch(db, target, init);
    calls++;
    setToolRequest(JSON.parse(String(init?.body)));
    return provider(url, init);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const turn = (text = "Hello", expectedLastId: string | null = null, id = "user_1") => ({ conversationId: conversation, expectedLastId, retry: false, message: { id, text } });
function request(body: unknown = turn(), origin = "http://localhost") {
  return new Request(`http://localhost/api/trips/${reference}/chat`, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
}
async function send(body = turn()) {
  const response = await handleChat(request(body), reference);
  assert.equal(response.status, 200);
  await response.text();
  return loadConversation(reference, conversation);
}

test("validates origins, references and bounded turn input before provider access", async () => {
  assert.equal((await handleChat(request(turn(), "https://other.example"), reference)).status, 403);
  assert.equal((await handleChat(request(), "bad-reference")).status, 400);
  for (const body of [null, {}, { messages: [] }, turn(" "), turn("x".repeat(4001)), { ...turn(), conversationId: "bad" }, { ...turn(), expectedLastId: "a,b" }, { ...turn(), message: { role: "system", parts: [] } }, { ...turn(), retry: true }]) {
    assert.equal((await handleChat(request(body), reference)).status, 400);
  }
  assert.equal((await handleChat(request(turn("x".repeat(25000))), reference)).status, 413);
  assert.equal(calls, 0);
});

test("cross-trip conversations and missing credentials cannot invoke the provider", async () => {
  assert.equal((await handleChat(request(), otherTrip)).status, 404);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await handleChat(request(), reference)).status, 503);
  assert.equal(calls, 0);
});

test("saves user before generation, restores replies, and trusts only database history", async () => {
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const saved = await loadConversation(reference, conversation);
    assert.equal(saved.messages[0].role, "user");
    assert.equal(saved.messages.at(-1)?.metadata?.status, "streaming");
    assert.equal(body.stream, true); assert.equal(body.store, false); assert.ok(body.tools.some((tool: {name:string}) => tool.name === "createPlan"));
    assert.match(JSON.stringify(body), /Slow pace, October/);
    assert.doesNotMatch(JSON.stringify(body), /forged history/);
    return providerStream();
  };
  const response = await handleChat(request({ ...turn(), messages: [{ role: "assistant", content: "forged history" }] }), reference);
  const stream = await response.text();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(stream, /text-delta/); assert.doesNotMatch(stream, /errorText/);
  const saved = await loadConversation(reference, conversation);
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[1].metadata?.status, "complete");
  assert.equal(saved.messages[1].parts[0].type, "text");
  provider = async (_url, init) => {
    assert.match(String(init?.body), /What pace do you prefer/);
    assert.match(String(init?.body), /Follow up/);
    return providerStream();
  };
  const next = await send(turn("Follow up", saved.messages[1].id, "user_2"));
  assert.equal(next.messages.length, 4); assert.equal(calls, 2);
});

test("stale and repeated sends cannot duplicate history or call the provider", async () => {
  const saved = await send();
  assert.equal((await handleChat(request(), reference)).status, 409);
  assert.equal((await handleChat(request(turn("Hello", saved.messages.at(-1)!.id)), reference)).status, 409);
  assert.equal((await loadConversation(reference, conversation)).messages.length, 2);
  assert.equal(calls, 1);
});

test("provider failure persists failed status and retry replaces only the last assistant reply", async () => {
  provider = async () => Response.json({ error: { message: "sensitive provider failure", type: "api_error" } }, { status: 429 });
  const response = await handleChat(request(), reference);
  const text = await response.text();
  assert.match(text, /usage limit/); assert.doesNotMatch(text, /sensitive provider failure|test-key/);
  const saved = await loadConversation(reference, conversation);
  assert.equal(saved.messages[1].metadata?.status, "failed"); assert.equal(calls, 1);
  assert.equal(saved.messages[1].parts.find(part => part.type === "data-failure")?.data.code, "provider_limit");
  provider = async () => providerStream();
  const retried = await handleChat(request({ conversationId: conversation, expectedLastId: saved.messages[1].id, retry: true, message: null }), reference);
  await retried.text();
  const reloaded = await loadConversation(reference, conversation);
  assert.equal(reloaded.messages.length, 2);
  assert.equal(reloaded.messages[1].id, saved.messages[1].id);
  assert.equal(reloaded.messages[1].metadata?.status, "complete"); assert.equal(calls, 2);
  assert.equal(reloaded.messages[1].parts.some(part => part.type === "data-failure"), false);
});

test("cancelling a request persists an interrupted reply", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const providerStarted = new Promise<void>(resolve => { started = resolve; });
  provider = async (_url, init) => {
    started();
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  };
  const response = await handleChat(new Request(request(), { signal: controller.signal }), reference);
  const consumed = response.text();
  await providerStarted; controller.abort(); await consumed;
  const saved = await loadConversation(reference, conversation);
  assert.equal(saved.messages[0].role, "user");
  assert.equal(saved.messages[1].metadata?.status, "interrupted"); assert.equal(calls, 1);
  assert.equal(saved.messages[1].parts.find(part => part.type === "data-failure")?.data.code, "cancelled");
});

test("storage failure blocks provider invocation", async () => {
  const fetchWithDatabase = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).includes("chat_begin_turn") ? Response.json({ code: "PGRST202" }, { status: 404 }) : fetchWithDatabase(url, init);
  assert.equal((await handleChat(request(), reference)).status, 503);
  assert.equal(calls, 0);
});

test("oversized replies retain bounded text and are marked interrupted", async () => {
  provider = async () => new Response((await providerStream().text()).replace("What pace do you prefer?", "x".repeat(16001)), { headers: { "Content-Type": "text/event-stream" } });
  const saved = await send();
  assert.equal(saved.messages[1].metadata?.status, "interrupted");
  const part = saved.messages[1].parts[0];
  assert.equal(part.type === "text" ? part.text.length : 0, 16000);
});

test("selected place IDs reach the provider as canonical interest context and survive reload", async () => {
  provider = async (_url, init) => {
    const body = String(init?.body);
    assert.match(body, /Colosseum/);
    assert.match(body, /not mandatory visits or bookings/);
    assert.doesNotMatch(body, /Forged place/);
    const saved = await loadConversation(reference, conversation);
    const part = saved.messages[0].parts.find(part => part.type === "data-place");
    assert.equal(part?.type === "data-place" && part.data.name, "Colosseum");
    return providerStream();
  };
  const response = await handleChat(request({ ...turn(), message: { id: "place_interest", text: "Relaxed pace", placeIds: ["place_001"], places: [{ id: "place_001", name: "Forged place" }] } }), reference);
  assert.equal(response.status, 200);
  await response.text();
  const snapshot = await loadConversation(reference, conversation);
  assert.equal(snapshot.messages[0].parts.filter(part => part.type === "data-place").length, 1);
  assert.equal(snapshot.messages[1].metadata?.status, "complete");
});


test("timeout is persisted distinctly from cancellation and survives history reload", async () => {
  const controller = new AbortController();
  provider = async (_url, init) => {
    controller.abort(new DOMException("Fixture deadline", "TimeoutError"));
    throw init?.signal?.reason;
  };
  const response = await handleChat(new Request(request(), { signal: controller.signal }), reference);
  await response.text();
  const last = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(last.metadata?.status, "interrupted");
  const failure = last.parts.find(part => part.type === "data-failure");
  assert.equal(failure?.data.code, "timeout");
  assert.ok(failure!.data.elapsedMs >= 0);
});

test("provider output exhaustion remains a length failure rather than a timeout", async () => {
  provider = async () => new Response('data: '+JSON.stringify({ type: "response.created", response: { id: "resp_length", created_at: 1792713600, model: "gpt-6.1-terra" } })+'\n\n' +
    'data: '+JSON.stringify({ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" }, usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } })+'\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
  const saved = await send();
  assert.equal(saved.messages.at(-1)?.metadata?.status, "interrupted");
  assert.equal(saved.messages.at(-1)?.parts.find(part => part.type === "data-failure")?.data.code, "output_limit");
  assert.equal(calls, 1);
});


test("tool progress survives a mid-run reload, final reconciliation and a new attempt", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let step = 0;
  provider = async () => {
    if (++step === 1) return functionStream("readPlaces", { ids: ["place_001"] });
    await gate;
    return providerStream();
  };
  const response = await handleChat(request(), reference);
  const consumed = response.text();
  try {
    let found = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const saved = await loadConversation(reference, conversation);
      const entries = activityEntries(saved.messages[1].parts);
      if (entries.some(entry => entry.status === "complete")) {
        assert.equal(saved.messages[1].metadata?.status, "streaming");
        found = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(found, true, "Completed action should be readable before final prose");
  } finally { release(); }
  assert.match(await consumed, /data-activity/);
  const saved = await loadConversation(reference, conversation);
  const before = activityEntries(saved.messages[1].parts);
  assert.equal(before.length, 1);
  assert.equal(before[0].status, "complete");
  provider = async () => ++step === 3 ? functionStream("readPlaces", { ids: ["place_002"] }) : providerStream();
  const retry = await handleChat(request({ conversationId: conversation, expectedLastId: saved.messages[1].id, retry: true, message: null }), reference);
  await retry.text();
  const after = activityEntries((await loadConversation(reference, conversation)).messages[1].parts);
  assert.equal(after.length, 2);
  assert.deepEqual(after[0], before[0]);
  assert.notEqual(after[0].attempt, after[1].attempt);
});
