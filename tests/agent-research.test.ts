import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { researchWeb, citedResearchSources } from "../services/assistant/agent/tools/research";
import { researchResponse } from "./plan-fixture";
const oldFetch = globalThis.fetch;
const oldKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  globalThis.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = oldKey;
});

test("research returns readable cited facts in one bounded stateless request", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.reasoning?.effort, "low", "Fact research keeps the cheaper effort setting.");
    assert.equal(body.max_tool_calls, 2);
    assert.equal(body.tool_choice, "required");
    assert.equal(body.tools.length, 1);
    assert.equal(body.tools[0].type, "web_search");
    return researchResponse();
  };
  const report = await researchWeb("Research representative Rome room rates", "gpt-6.1-terra", new AbortController().signal);
  assert.equal(requests, 1);
  assert.match(report.summary, /EUR 80 per person-night/);
  assert.equal(report.sources[0].url, "https://example.com/test-rate");
  assert.equal(report.searched, true);
  assert.equal(report.incomplete, false);
  assert.ok(Number.isFinite(Date.parse(report.checkedAt)));
});

test("empty research does not turn links into price facts", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  globalThis.fetch = async () => researchResponse("");
  const report = await researchWeb("Room prices", "gpt-6.1-terra", new AbortController().signal);
  assert.equal(report.incomplete, true);
  assert.match(report.summary, /Do not infer prices/);
});

test("research obeys cancellation without a provider request", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Must not fetch"); };
  const signal = AbortSignal.abort();
  await assert.rejects(researchWeb("Room prices", "gpt-6.1-terra", signal), /abort/i);
  assert.equal(requests, 0);
});

test("a slow research request returns an honest incomplete result before the trip deadline", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    const signal = init!.signal!;
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const report = await researchWeb("A deliberately slow fixture", "gpt-6-luna", new AbortController().signal, undefined, 5);
    assert.equal(report.incomplete, true);
    assert.equal(report.searched, false);
    assert.deepEqual(report.sources, []);
    assert.match(report.summary, /time limit/);
  } finally { clearTimeout(keepAlive); }
});

test("a verified publication closes with current facts and no stale failure transcript", async () => {
  const { runAgent } = await import("../services/assistant/agent");
  process.env.OPENAI_API_KEY = "fixture";
  let requests = 0;
  const { providerStream } = await import("./chat-fixture");
  globalThis.fetch = async (_url, init) => {
    requests++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.tool_choice, "none");
    assert.match(JSON.stringify(body), /These changes ARE SAVED/);
    assert.match(JSON.stringify(body), /Estimated total: €882 to €1,048 for the group/);
    assert.doesNotMatch(JSON.stringify(body.input), /OLD_UNSAVED_FAILURE/);
    return providerStream();
  };
  const environment = {
    operationId: "saved-turn", context: { priorAction: "OLD_UNSAVED_FAILURE" },
    artifacts: { manifest: () => ({ lastVerifiedFinalSave: { operation_id: "saved-turn", revision: 8, summary: "Afternoon freed." }, plan: { days: [] }, budget: { displayTotal: "Estimated total: €882 to €1,048 for the group" } }) },
  } as unknown as import("../services/assistant/agent/contracts").AgentEnvironment;
  const result = await runAgent([{ role: "user", content: "Keep the afternoon free." }, { role: "assistant", content: "OLD_UNSAVED_FAILURE" }], environment, new AbortController().signal, { onChunk: async () => {}, onSnapshot: () => {} });
  assert.equal(result.failure, undefined);
  assert.equal(requests, 1);
});


test("research projection retains every directly cited source and leaves the complete index intact", () => {
  const sources = Array.from({ length: 100 }, (_, i) => ({ url: `https://example.com/page-${i}/`, title: `Source ${i}` }));
  const summary = `Quoted facts: ${sources[3].url} and ${sources[90].url}`;
  assert.deepEqual(citedResearchSources(summary, sources), [sources[3], sources[90]]);
  assert.equal(sources.length, 100);
  assert.equal(citedResearchSources("An incomplete report without direct links", sources).length, 24);
});
