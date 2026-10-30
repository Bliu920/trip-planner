import { offlineDraftCalls } from "./authoring-fixture";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { handleChat } from "../services/assistant";
import { MAX_AGENT_STEPS } from "../services/assistant/agent";
import { savedReplyFallback } from "../services/assistant/agent/context/completion";
import type { AgentEnvironment } from "../services/assistant/agent/contracts";
import { loadConversation } from "../services/assistant/conversation-store";
import { createDatabase, seed, databaseFetch, reference, conversation } from "./chat-fixture";
import { functionStream } from "./plan-fixture";

const oldFetch = globalThis.fetch;
const keys = ["OPENAI_API_KEY", "OPENAI_MODEL", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "AGENT_WEB_SEARCH", "AGENT_DURABLE_DRAFTS"];
const oldEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let db: PGlite;
let calls = 0;
let commitOnLastStep = false;

before(async () => { db = await createDatabase(); });
after(async () => { await db.close(); });
beforeEach(async () => {
  await seed(db);
  calls = 0;
  commitOnLastStep = false;
  Object.assign(process.env, { OPENAI_API_KEY: "fixture", OPENAI_MODEL: "gpt-6-luna", SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_fixture", AGENT_WEB_SEARCH: "false", AGENT_DURABLE_DRAFTS: "false" });
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).hostname === "db.example") return databaseFetch(db, new URL(String(url)), init);
    calls++;
    assert.ok(calls <= MAX_AGENT_STEPS, "Closing fallback must not add a provider call.");
    const draft = offlineDraftCalls()[calls - 1];
    if (draft) return functionStream(...draft);
    if (calls === MAX_AGENT_STEPS && commitOnLastStep) return functionStream("commit", { summary: "Saved on final allowed step", handledInputIds: [] });
    return functionStream("readGuide", { id: "budget-research" });
  };
});
afterEach(() => {
  globalThis.fetch = oldFetch;
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function send() {
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "final-step-user", text: "Plan three days in Rome." } }),
  }), reference);
  assert.equal(response.status, 200);
  const stream = await response.text();
  return { stream, reply: (await loadConversation(reference, conversation)).messages.at(-1)! };
}

test("final allowed commit yields a persisted acknowledgment while preserving the actual step-limit cause", async () => {
  commitOnLastStep = true;
  const { stream, reply } = await send();
  assert.equal(calls, MAX_AGENT_STEPS);
  const text = reply.parts.filter(part => part.type === "text").map(part => part.text).join("");
  assert.match(text, /Your trip changes are saved/);
  assert.match(text, /Some costs still need an estimate/);
  assert.match(text, /A detailed written summary was not completed/);
  assert.match(stream, /Your trip changes are saved/);
  assert.equal(reply.metadata?.status, "interrupted");
  assert.equal(reply.parts.find(part => part.type === "data-action")?.data.state, "saved");
  const failure = reply.parts.find(part => part.type === "data-failure")?.data;
  assert.equal(failure?.code, "step_limit");
  assert.equal(failure?.steps, MAX_AGENT_STEPS);
  assert.equal((await db.query("select * from planning_commits")).rows.length, 1);
});

test("unpublished working content never receives the saved acknowledgment", async () => {
  const { reply } = await send();
  assert.equal(calls, MAX_AGENT_STEPS);
  assert.equal(reply.parts.filter(part => part.type === "text").map(part => part.text).join(""), "");
  assert.notEqual(reply.parts.find(part => part.type === "data-action")?.data.state, "saved");
  assert.equal(reply.parts.find(part => part.type === "data-failure")?.data.code, "step_limit");
  assert.equal((await db.query("select * from planning_commits")).rows.length, 0);
});

test("saved fallback requires this operation's receipt and preserves exact budget scope and warnings", () => {
  const environment = (receiptId: string) => ({ operationId: "current", artifacts: { manifest: () => ({ lastVerifiedFinalSave: { operation_id: receiptId }, budget: { displayTotal: "Estimated total: €362 to €649 per person", limitWarning: "The upper estimate exceeds your limit by €49.", totals: { unknown: 0 } } }) } }) as unknown as AgentEnvironment;
  assert.equal(savedReplyFallback(environment("other")), null);
  const text = savedReplyFallback(environment("current"))!;
  assert.match(text, /Estimated total: €362 to €649 per person/);
  assert.match(text, /exceeds your limit by €49/);
  assert.doesNotMatch(text, /Some costs still need/);
});
