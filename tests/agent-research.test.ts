import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { researchWeb } from "../services/agent/research";
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
    assert.equal(body.max_tool_calls, 4);
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
