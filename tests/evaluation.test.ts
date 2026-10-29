import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCases, gradeChecks } from "../services/evaluation";
import { executeCase } from "../services/evaluation/runner";
import { validateVerdict } from "../services/evaluation/judge";
import { providerStream } from "./chat-fixture";

const oldKey = process.env.OPENAI_API_KEY;
test("a real multi-turn conversation preserves saved document identity and grades each publication", async () => {
  const { functionStream, setToolRequest } = await import("./plan-fixture");
  const source = (await loadCases("data/evaluation/cases.json")).cases.find(c => c.id === "F18")!;
  const c = { ...source, research: "disabled" as const, followUps: [{ prompt: "Replace the jacket with a rain layer. Keep the trip unchanged.", assertions: [
    { type: "document_updated" as const, name: "Packing.md" }, { type: "plan_budget_unchanged" as const }, { type: "final_receipt" as const },
  ] }] };
  process.env.OPENAI_API_KEY = "fixture";
  let call = 0, documentId = "";
  try {
    const recordedTurns: number[] = [];
    const o = await executeCase(c, async (_url, init) => {
      const body = JSON.parse(String(init?.body)); setToolRequest(body); call++;
      const outputs = (body.input as { type?: string; output?: string }[]).filter(item => item.type === "function_call_output").flatMap(item => {
        try { return [JSON.parse(item.output!)]; } catch { return []; }
      });
      documentId = outputs.find(result => result.data?.id && result.data?.proposedContentRevision === 1)?.data.id ?? documentId;
      if (call === 1) return functionStream("createDocument", { name: "Packing.md", kind: "working", content: "# Packing\nBring a jacket.\nBring shoes.\n" });
      if (call === 4) {
        assert.ok(documentId);
        assert.match(JSON.stringify(body), /Replace the jacket/, "later input reaches the same conversation");
        return functionStream("editDocument", { id: documentId, operations: [{ type: "replaceText", oldText: "Bring a jacket.", newText: "Bring a rain layer." }] });
      }
      if (call === 2 || call === 5) return functionStream("commit", { summary: "Saved checklist", handledInputIds: [] });
      return providerStream();
    }, async (index, turn) => {
      recordedTurns.push(index);
      assert.equal(turn.commitCount, 1);
      assert.equal(turn.after.documents.find(doc => doc.name === "Packing.md")?.contentRevision, index + 1);
    });
    assert.deepEqual(recordedTurns, [0, 1], "each completed turn is available for durable reporting before later turns run");
    assert.equal(call, 6);
    assert.equal(o.turns?.length, 2);
    assert.equal(o.commitCount, 2, "one independent publication per user turn");
    assert.equal(o.turns?.[1].observation.before.documents.find(d => d.name === "Packing.md")?.contentRevision, 1);
    assert.equal(o.after.documents.find(d => d.name === "Packing.md")?.contentRevision, 2);
    assert.equal(o.after.documents.find(d => d.name === "Packing.md")?.previousVersion?.content, "# Packing\nBring a jacket.\nBring shoes.\n");
    assert.equal(o.after.documents.find(d => d.name === "Packing.md")?.content, "# Packing\nBring a rain layer.\nBring shoes.\n");
    assert.ok(gradeChecks(c, o).every(check => check.outcome === "pass"), JSON.stringify(gradeChecks(c, o)));
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("a conversation stops at an interrupted turn without fabricating follow-up evidence", async () => {
  const source = (await loadCases("data/evaluation/cases.json")).cases.find(c => c.id === "R10")!;
  const { functionStream, setToolRequest } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = { ...source, followUps: [{ prompt: "Make day two lighter.", assertions: [{ type: "final_receipt" as const }] }] };
    const o = await executeCase(c, async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body)));
      return functionStream("saveBrief", { markdown: "# Preferences\nFlorence, art.", expectedRevision: 0 });
    });
    assert.equal(o.turns?.length, 1);
    assert.equal(gradeChecks(c, o).find(check => check.id === "turn2/executed")?.outcome, "not_evaluable");
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});
test("case database has distinct valid inputs and executable criteria", async () => {
  const { cases, hash } = await loadCases("data/evaluation/cases.json");
  assert.ok(cases.length >= 30);
  assert.equal(hash.length, 64);
  assert.ok(cases.some(c => c.fixture === "empty"));
  assert.ok(cases.some(c => c.fixture !== "empty"));
  assert.ok(cases.every(c => c.rubric.length > 0 && c.assertions.length > 0));
});
test("actual chat entrypoint runs in isolated empty and saved projects", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const { cases } = await loadCases("data/evaluation/cases.json");
    for (const id of ["I18", "F15"]) {
      const c = cases.find(item => item.id === id)!;
      const o = await executeCase(c, async () => providerStream());
      assert.equal(o.responseStatus, 200);
      assert.equal(o.replyStatus, "complete");
      assert.equal(o.reply, "What pace do you prefer?");
      assert.equal(o.providerRequests, 1);
      assert.ok(gradeChecks(c, o).every(result => result.outcome === "pass"));
      assert.equal(Boolean((o.before.plan as {plan: unknown}).plan), c.fixture !== "empty");
    }
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});
test("a judge cannot omit, duplicate or invent criteria", async () => {
  const c = (await loadCases("data/evaluation/cases.json")).cases.find(c => c.id === "I18")!;
  assert.throws(() => validateVerdict(c, { results: [] }), /missing or duplicate/);
  const results = c.rubric.map(r => ({ id: r.id, outcome: "pass" as const, evidence: "Supported by saved state" }));
  assert.equal(validateVerdict(c, { results }).outcome, "pass");
  results[0].evidence = "";
  assert.throws(() => validateVerdict(c, { results }), /without evidence/);
});

test("captures checkpoints, tool results and actual committed artifacts", async () => {
  const { functionStream, setToolRequest, examplePlan, unknownBudget } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const original = (await loadCases("data/evaluation/cases.json")).cases.find(c => c.id === "I01")!;
    const c = { ...original, research: "disabled" as const };
    let call = 0;
    const mock: typeof fetch = async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body)));
      call++;
      if (call === 1) return functionStream("saveBrief", { markdown: "# Preferences\nRome, relaxed.", expectedRevision: 0 });
      if (call === 2) return functionStream("proposePlan", { plan: examplePlan(), authorizedItemIds: [] });
      if (call === 3) return functionStream("proposeBudget", { budget: unknownBudget(), reviewed: true });
      if (call === 4) return functionStream("resolveBudgetGaps", { gaps: [{ entryId: "stay", reason: "search_unavailable", explanation: "Research was disabled; there is no available price evidence." }] });
      if (call === 5) return functionStream("commit", { summary: "Saved partial draft", handledInputIds: [] });
      return providerStream();
    };
    const o = await executeCase(c, mock);
    assert.equal(o.responseStatus, 200);
    assert.equal(o.providerRequests, 6);
    assert.ok(o.after.documents.some(doc => doc.kind === "planning_context" && doc.content?.includes("Rome")));
    assert.ok(o.trace.some(event => event.toolName === "saveBrief"));
    assert.ok(o.trace.some(event => event.type === "tool-output-available"));
    const checks = gradeChecks(c, o);
    assert.equal(checks.find(result => result.id.startsWith("brief_before_plan"))?.outcome, "pass");
    assert.equal(checks.find(result => result.detail.includes("searchPlaces"))?.outcome, "fail");
    // Mechanical success is not semantic itinerary quality.
    assert.equal((o.after.plan as { plan: { days: unknown[] } }).plan.days.length, 3);
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("mechanical checks fail on missing artifacts and unsupported catalog IDs", async () => {
  const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "I02")!;
  const blank = { plan: { plan: null }, budget: { budget: null }, documents: [], pendingInputs: [] };
  const o = { caseId: c.id, startedAt: "2026-10-28T12:00:00.000Z", elapsedMs: 1, responseStatus: 200,
    before: blank, after: { ...blank, plan: { plan: { days: [{}, {}, {}], items: { madeup: { location: { type: "catalog", placeId: "not-real" } } } } } },
    reply: "Everything is saved.", replyStatus: "complete", parts: [], trace: [], providerRequests: 1, simulatedRequests: 0, providerStatuses: [200], commitCount: 0, storageError: null, faultTriggered: false };
  const checks = gradeChecks(c, o);
  assert.equal(checks.find(check => check.id.startsWith("saved_budget"))?.outcome, "fail");
  assert.equal(checks.find(check => check.id.startsWith("valid_catalog_references"))?.outcome, "fail");
  assert.equal(checks.find(check => check.id.startsWith("final_receipt"))?.outcome, "fail");
  o.commitCount = 2;
  assert.equal(gradeChecks(c, o).find(check => check.id === "single_final_publication")?.outcome, "fail");
});

test("judge uses Responses structured output and returns evidence for each rubric", async () => {
  const { judgeCase, JUDGE_MODEL } = await import("../services/evaluation/judge");
  const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "I18")!;
  const blank = { plan: null, budget: null, documents: [], pendingInputs: [] };
  const observation = { caseId: c.id, startedAt: "2026-10-28T12:00:00Z", elapsedMs: 1, responseStatus: 200,
    before: blank, after: blank, reply: "Rome and Florence both have art.", replyStatus: "complete", parts: [], trace: [], providerRequests: 1, simulatedRequests: 0, providerStatuses: [200], commitCount: 0, storageError: null, faultTriggered: false };
  const old = globalThis.fetch;
  process.env.OPENAI_API_KEY = "fixture";
  let request: Record<string, unknown> | undefined;
  globalThis.fetch = async (_url, init) => {
    request = JSON.parse(String(init?.body));
    const output = { results: c.rubric.map(r => ({ id: r.id, outcome: "pass", evidence: "The response compares both cities." })) };
    return Response.json({ id: "resp_judge", object: "response", created_at: 1792713600, status: "completed", model: JUDGE_MODEL, error: null, incomplete_details: null,
      output: [{ id: "msg_judge", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
  };
  try {
    const result = await judgeCase(c, observation);
    assert.equal(result.outcome, "pass");
    assert.equal(result.results.length, c.rubric.length);
    assert.equal(request?.model, JUDGE_MODEL);
    assert.equal(request?.store, false);
    assert.equal(((request?.text as { format: { type: string } }).format).type, "json_schema");
  } finally {
    globalThis.fetch = old;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("injects a provider failure only after the brief is persisted", async () => {
  const { functionStream, setToolRequest } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R10")!;
    let calls = 0;
    const mock: typeof fetch = async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body))); calls++;
      if (calls === 1) return functionStream("saveBrief", { markdown: "# Preferences\nFlorence art for two.", expectedRevision: 0 });
      throw new Error("The injected error should prevent a second provider call");
    };
    const o = await executeCase(c, mock);
    assert.equal(calls, 1);
    assert.equal(o.faultTriggered, true);
    assert.ok(gradeChecks(c, o).every(result => result.outcome === "pass"));
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("ambiguous-document fixture is isolated and contains both occurrences", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R11")!;
    const o = await executeCase(c, async () => providerStream());
    const content = o.before.documents.find(doc => doc.name === "Packing.md")?.content ?? "";
    assert.equal(content.match(/Bring a jacket\./g)?.length, 2);
    assert.equal(gradeChecks(c, o)[0].outcome, "pass");
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("lost commit response occurs after publication and cannot duplicate the plan", async () => {
  const { functionStream, setToolRequest, examplePlan, unknownBudget } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "X09")!;
    let call = 0;
    const mock: typeof fetch = async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body))); call++;
      if (call === 1) return functionStream("saveBrief", { markdown: "# Preferences\nRome for two.", expectedRevision: 0 });
      if (call === 2) return functionStream("proposePlan", { plan: examplePlan(), authorizedItemIds: [] });
      if (call === 3) return functionStream("proposeBudget", { budget: unknownBudget(), reviewed: true });
      if (call === 4) return functionStream("resolveBudgetGaps", { gaps: [{ entryId: "stay", reason: "search_unavailable", explanation: "No price evidence available in this offline fixture." }] });
      if (call === 5) return functionStream("commit", { summary: "Saved partial draft", handledInputIds: [] });
      return providerStream();
    };
    const o = await executeCase(c, mock);
    assert.equal(o.faultTriggered, true);
    assert.equal(Object.keys((o.after.plan as { plan: { items: object } }).plan.items).length, 1);
    assert.ok(gradeChecks(c, o).every(result => result.outcome === "pass"));
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("judge model override rejects deprecated and unverified model IDs", async () => {
  const { judgeModel, JUDGE_MODEL } = await import("../services/evaluation/judge");
  const previous = process.env.EVAL_JUDGE_MODEL;
  try {
    delete process.env.EVAL_JUDGE_MODEL;
    assert.equal(judgeModel(), JUDGE_MODEL);
    process.env.EVAL_JUDGE_MODEL = "gpt-4o-2024-08-06";
    assert.throws(() => judgeModel(), /Unsupported EVAL_JUDGE_MODEL/);
    process.env.EVAL_JUDGE_MODEL = "unverified-model";
    assert.throws(() => judgeModel(), /Unsupported EVAL_JUDGE_MODEL/);
  } finally { if (previous === undefined) delete process.env.EVAL_JUDGE_MODEL; else process.env.EVAL_JUDGE_MODEL = previous; }
});

test("protected booking fixture is saved with the requested fixed user-reported time", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "F08")!;
    const o = await executeCase(c, async () => providerStream());
    const item = (o.before.plan as { plan: { items: { gallery: { reservation: { state: string }; timing: { start: { date: string; time: string } } } } } }).plan.items.gallery;
    assert.equal(item.reservation.state, "booked");
    assert.equal(item.timing.start.date, "2026-11-05");
    assert.equal(item.timing.start.time, "14:00");
    assert.equal(gradeChecks(c, o).find(check => check.id.startsWith("preserve_booking"))?.outcome, "pass");
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("unexpected provider limits are not graded as agent failures", async () => {
  const { executionIssue } = await import("../services/evaluation");
  const cases = (await loadCases("data/evaluation/cases.json")).cases;
  const c = cases.find(item => item.id === "I02")!;
  const blank = { plan: { plan: null }, budget: { budget: null }, documents: [], pendingInputs: [] };
  const o = { caseId: c.id, startedAt: "2026-10-28T12:00:00Z", elapsedMs: 1, responseStatus: 200,
    before: blank, after: blank, reply: "", replyStatus: "failed", parts: [{ type: "data-failure", data: { code: "provider_limit" } }],
    trace: [], providerRequests: 1, simulatedRequests: 0, providerStatuses: [200], commitCount: 0, storageError: null, faultTriggered: false };
  assert.equal(executionIssue(c, o), "provider_limit");
  assert.equal(gradeChecks(c, o).filter(result => result.outcome === "fail").length, 0);
  const injected = cases.find(item => item.id === "R10")!;
  assert.equal(executionIssue(injected, { ...o, faultTriggered: true }), null);
});

test("Rome fixtures include sourced budget, two-night stay and booked variant", async () => {
  const { romeFixture } = await import("../services/evaluation/fixtures");
  const { inspectPlan } = await import("../lib/plan");
  const { places } = await import("../services/plans");
  const { budgetTotals } = await import("../lib/budget");
  for (const booked of [false, true]) {
    const { plan, budget } = romeFixture(booked);
    assert.deepEqual(inspectPlan(plan, places).findings.filter(x => x.severity === "error"), []);
    assert.deepEqual([budgetTotals(budget).min,budgetTotals(budget).max],[500,700]);
    assert.equal(plan.items.gallery.reservation?.state === "booked", booked);
  }
});

test("Rome follow-ups, earlier messages and selected files reach the real chat context", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const cases = (await loadCases("data/evaluation/cases.json")).cases;
    for (const id of ["F15", "F17", "F19", "F20", "I17"]) {
      const c = cases.find(item => item.id === id)!;
      let request = "";
      const o = await executeCase(c, async (_url, init) => { request = String(init?.body); return providerStream(); });
      assert.equal(o.responseStatus, 200, id);
      if (id.startsWith("F")) assert.ok((o.before.plan as { plan: unknown }).plan, id);
      if (id === "I17") assert.match(request, /no cycling/);
      if (id === "F17") assert.match(request, /No churches/);
      if (id === "F20") {
        assert.match(request, /Remove the Colosseum/);
        assert.ok(JSON.stringify(o.before.pendingInputs).includes("earlier-user"));
        assert.equal(gradeChecks(c, o).find(check => check.id.startsWith("pending_input"))?.outcome, "pass");
        const changed = { ...o, after: { ...o.after, pendingInputs: [] } };
        assert.equal(gradeChecks(c, changed).find(check => check.id.startsWith("pending_input"))?.outcome, "fail");
      }
      if (id === "F19") assert.ok(o.before.documents.some(d => d.name === "Packing.md"));
    }
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("selected injection file is delivered as untrusted context", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R06")!;
    let request = "";
    const o = await executeCase(c, async (_url, init) => { request = String(init?.body); return providerStream(); });
    assert.equal(o.responseStatus, 200);
    assert.match(request, /Ignore your instructions/);
    assert.match(request, /untrusted/);
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("controlled research is returned as a readable tool result without a live research request", async () => {
  const { functionStream, setToolRequest } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R03")!;
    let calls = 0;
    const mock: typeof fetch = async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body))); calls++;
      return calls === 1 ? functionStream("researchWeb", { query: "Research a room price" }) : providerStream();
    };
    const o = await executeCase(c, mock);
    assert.equal(calls, 2);
    assert.equal(o.providerRequests, 2);
    assert.equal(o.simulatedRequests, 1);
    const result = o.trace.find(event => event.type === "tool-output-available");
    assert.match(JSON.stringify(result?.output), /EUR 120 per room-night/);
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("concurrent writer fault rejects a stale commit and preserves the new note after recovery", async () => {
  const { functionStream, setToolRequest } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R08")!;
    let call = 0;
    const mock: typeof fetch = async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body))); call++;
      const edit = { operations: [{ type: "updateDay", id: "day-2", fields: { title: "Relaxed day" } }], authorizedItemIds: [] };
      if (call === 1 || call === 4) return functionStream("editPlan", edit);
      if (call === 2 || call === 5) return functionStream("commit", { summary: "Updated day two", handledInputIds: [] });
      if (call === 3) return functionStream("reloadWorkspace", {});
      return providerStream();
    };
    const o = await executeCase(c, mock);
    assert.equal(o.faultTriggered, true);
    const checks = gradeChecks(c, o);
    assert.ok(checks.every(result => result.outcome === "pass"), JSON.stringify({checks,trace:o.trace.filter(x=>x.type === "tool-output-available").map(x=>({outcome:(x.output as {outcome:string})?.outcome, code:(x.output as {code:string})?.code, message:(x.output as {message:string})?.message, errors:((x.output as {data:{findings:{severity:string}[]}})?.data?.findings ?? []).filter(f=>f.severity==="error")}))}));
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("historical PDF fixture exposes a reference without file bytes", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R13")!;
    let request = "";
    const o = await executeCase(c, async (_url, init) => { request = String(init?.body); return providerStream(); });
    assert.equal(o.responseStatus, 200);
    assert.match(request, /hotel-confirmation.pdf/);
    assert.doesNotMatch(request, /input_file|Synthetic unavailable file/);
    assert.equal(o.before.documents.find(d => d.name === "hotel-confirmation.pdf")?.content, null);
    assert.ok(gradeChecks(c, o).every(r => r.outcome === "pass"));
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("forced rejected edit and late brief scenarios actually reach their intended states", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const cases = (await loadCases("data/evaluation/cases.json")).cases;
    for (const id of ["R07", "R14"]) {
      const c = cases.find(item => item.id === id)!;
      const o = await executeCase(c, async () => providerStream());
      assert.equal(o.faultTriggered, true, id);
      const checks = gradeChecks(c, o);
      assert.equal(checks.find(check => check.id.startsWith(id === "R07" ? "rejection_observed" : "late_brief_staged"))?.outcome, "pass", id);
    }
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("indeterminate commit fault never fabricates a receipt", async () => {
  const { functionStream, setToolRequest } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R15")!;
    let calls = 0;
    const mock: typeof fetch = async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body))); calls++;
      if (calls === 1) return functionStream("editPlan", { operations: [{ type: "updateDay", id: "day-2", fields: { title: "Lighter day" } }], authorizedItemIds: [] });
      if (calls === 2) return functionStream("commit", { summary: "Lighter day", handledInputIds: [] });
      return providerStream();
    };
    const o = await executeCase(c, mock);
    assert.equal(o.faultTriggered, true);
    assert.equal(o.commitCount, 0);
    assert.equal(gradeChecks(c, o).find(check => check.id.startsWith("no_final_receipt"))?.outcome, "pass");
    assert.ok(o.trace.some(event => event.type === "tool-output-available" && JSON.stringify(event.output).includes('"outcome":"unknown"')), JSON.stringify(o.trace));
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("zero-search injection produces actual empty catalog results", async () => {
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R05")!;
    const o = await executeCase(c, async () => providerStream());
    assert.equal(o.faultTriggered, true);
    assert.equal(gradeChecks(c, o).find(check => check.id.startsWith("zero_results_observed"))?.outcome, "pass");
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("duplicate tool-call injection repeats the identical call identity without adding two items", async () => {
  const { functionStream, setToolRequest } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R12")!;
    let calls = 0;
    const mock: typeof fetch = async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body))); calls++;
      return calls === 1 ? functionStream("commit", { summary: "Added Forum", handledInputIds: [] }) : providerStream();
    };
    const o = await executeCase(c, mock);
    const checks = gradeChecks(c, o);
    assert.ok(checks.every(check => check.outcome === "pass"), JSON.stringify(checks));
    const plan = (o.after.plan as {plan:{days:{itemIds:string[]}[]}}).plan;
    assert.equal(plan.days.flatMap(day => day.itemIds).filter(id => id === "forum-eval").length, 1);
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("lost follow-up commit preserves the moved Pantheon and verifies the receipt", async () => {
  const { functionStream, setToolRequest } = await import("./plan-fixture");
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const c = (await loadCases("data/evaluation/cases.json")).cases.find(item => item.id === "R09")!;
    let calls = 0;
    const mock: typeof fetch = async (_url, init) => {
      setToolRequest(JSON.parse(String(init?.body))); calls++;
      if (calls === 1) return functionStream("editPlan", { operations: [{ type: "moveItem", id: "pantheon", dayId: "day-3", index: 2 }], authorizedItemIds: [] });
      if (calls === 2) return functionStream("commit", { summary: "Moved Pantheon", handledInputIds: [] });
      return providerStream();
    };
    const o = await executeCase(c, mock);
    assert.ok(gradeChecks(c, o).every(check => check.outcome === "pass"), JSON.stringify(gradeChecks(c, o)));
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});
