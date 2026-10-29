import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { generateProjectTitle } from "../services/project-titles";
import { handleTrip } from "../services/trips";

const originalFetch = globalThis.fetch;
const envKeys = ["OPENAI_API_KEY", "OPENAI_TITLE_MODEL", "OPENAI_MODEL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});
function configure() {
  process.env.OPENAI_API_KEY = "test-title-key";
  delete process.env.OPENAI_TITLE_MODEL;
  process.env.SUPABASE_URL = "https://database.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
}
function response(text = "A relaxed Florence getaway", incomplete = false) {
  return Response.json({
    id: "resp_title", object: "response", created_at: 1792713600,
    status: incomplete ? "incomplete" : "completed", model: "gpt-6-luna", error: null,
    incomplete_details: incomplete ? { reason: "max_output_tokens" } : null,
    output: [{ id: "msg_title", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }],
    usage: { input_tokens: 160, output_tokens: 8, total_tokens: 168, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  });
}
function request(body: unknown, method = "POST", signal?: AbortSignal) {
  return new Request("http://localhost/api/trips", { method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("uses one isolated cheap Responses call with no tools or storage", async () => {
  configure(); process.env.OPENAI_MODEL = "unrelated-planner-model";
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.store, false);
    assert.equal(body.reasoning.effort, "none");
    assert.equal(body.text.verbosity, "low");
    assert.equal(body.max_output_tokens, 128);
    assert.ok(!body.tools?.length);
    assert.ok(init?.signal);
    assert.match(JSON.stringify(body.input), /A relaxed Florence trip/);
    return response();
  };
  assert.equal(await generateProjectTitle(" A relaxed Florence trip "), "A relaxed Florence getaway");
  assert.equal(calls, 1);
});

test("invalid prompts, obsolete overrides and missing credentials never reach the provider", async () => {
  configure();
  globalThis.fetch = async () => { assert.fail("Unexpected network call"); };
  for (const prompt of ["", "  ", "x".repeat(4001)]) await assert.rejects(generateProjectTitle(prompt), /prompt/);
  for (const model of ["gpt-4o-mini", "gpt-5.4-nano", "gpt-5.1", "gpt-6.1-terra"]) {
    process.env.OPENAI_TITLE_MODEL = model;
    await assert.rejects(generateProjectTitle("Rome"), /Unsupported OPENAI_TITLE_MODEL/);
  }
  delete process.env.OPENAI_TITLE_MODEL; delete process.env.OPENAI_API_KEY;
  await assert.rejects(generateProjectTitle("Rome"), /OPENAI_API_KEY/);
});

test("rejects empty, oversized, multiline and incomplete titles", async () => {
  configure();
  for (const text of ["", "x".repeat(61), "First title\nSecond title", "# Florence", "https://example.com", "Rome\u2014art trip"]) {
    globalThis.fetch = async () => response(text);
    await assert.rejects(generateProjectTitle("Rome"), /invalid|No text/);
  }
  globalThis.fetch = async () => response("A partial title", true);
  await assert.rejects(generateProjectTitle("Rome"), /did not complete/);
  globalThis.fetch = async () => response(' "Florence at our pace" ');
  assert.equal(await generateProjectTitle("Florence"), "Florence at our pace");
});

test("caller cancellation stops generation before a request", async () => {
  configure();
  globalThis.fetch = async () => { assert.fail("Unexpected network call"); };
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generateProjectTitle("Rome", controller.signal), { name: "AbortError" });
});

test("prompt creation stores the generated name and original brief together", async () => {
  configure();
  const prompt = "I want a quiet Florence holiday with galleries and slow mornings.";
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    if (String(url).includes("api.openai.com")) return response();
    const body = JSON.parse(String(init?.body));
    assert.equal(init?.method, "POST");
    assert.equal(body.name, "A relaxed Florence getaway");
    assert.equal(body.notes, prompt);
    assert.equal(body.prompt, undefined);
    return Response.json([body]);
  };
  const result = await handleTrip(request({ prompt }));
  assert.equal(result.status, 201);
  assert.equal((await result.json()).name, "A relaxed Florence getaway");
  assert.equal(calls, 2);
});

test("provider failure uses an editable default without retries or raw prompt titles", async t => {
  configure(); t.mock.method(console, "warn", () => {});
  let providerCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.openai.com")) {
      providerCalls++;
      return Response.json({ error: { message: "private provider diagnostic" } }, { status: 429 });
    }
    return Response.json([JSON.parse(String(init?.body))]);
  };
  const result = await handleTrip(request({ prompt: "A very personal trip description" }));
  assert.equal(result.status, 201);
  assert.equal((await result.json()).name, "Italy trip");
  assert.equal(providerCalls, 1);
});

test("manual names and renames bypass generation", async () => {
  configure();
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "database.example");
    return Response.json([JSON.parse(String(init?.body))]);
  };
  const create = await handleTrip(request({ name: "My own name" }));
  assert.equal((await create.json()).name, "My own name");
  const rename = await handleTrip(request({ name: "Our Rome holiday" }, "PATCH"), "12fd9d92-d38d-4a5e-93c1-09747c76a964");
  assert.equal((await rename.json()).name, "Our Rome holiday");
});

test("invalid creation prompts and prompt-based renames are rejected before any calls", async () => {
  configure();
  globalThis.fetch = async () => { assert.fail("Unexpected network call"); };
  for (const body of [{ prompt: "" }, { prompt: 5 }, { prompt: "x".repeat(4001) }, { prompt: "Rome", name: "Rome" }, { prompt: "Rome", notes: "Extra" }]) {
    assert.equal((await handleTrip(request(body))).status, 400);
  }
  assert.equal((await handleTrip(request({ prompt: "Rome" }, "PATCH"), "12fd9d92-d38d-4a5e-93c1-09747c76a964")).status, 400);
});

test("cancelled creation never writes a fallback project", async () => {
  configure();
  globalThis.fetch = async () => { assert.fail("Unexpected network call"); };
  const controller = new AbortController(); controller.abort();
  assert.equal((await handleTrip(request({ prompt: "Rome" }, "POST", controller.signal))).status, 408);
});
