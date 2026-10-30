import { planHeader, visitCommand, budgetSettings, unpricedStay, offlineDraftCalls, reviewBudget } from "./authoring-fixture";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, afterEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import {
  createDatabase,
  seed,
  databaseFetch,
  providerStream,
  reference,
  otherTrip,
  conversation,
  generation,
} from "./chat-fixture";
import { examplePlan, functionStream, unknownBudget, fixturePricedBudget, researchResponse } from "./plan-fixture";
import { openSession } from "../services/workspace";
import { getPlan, savePlan } from "../services/plans";
import { getBudget } from "../services/budgets";
import {
  prepareDocument,
  publishDocument,
  readTextDocument,
} from "../services/documents";
import {
  beginTurn,
  saveReply,
  loadConversation,
} from "../services/assistant/conversation-store";
import { handleChat } from "../services/assistant";
import { MAX_AGENT_STEPS, RECOVERY_STEPS } from "../services/assistant/agent";
import { budgetTotals } from "../lib/budget";
function sourceHandle(body: { input: { type?: string; output?: string }[] }, url = "https://example.com/test-rate") {
  for (const item of [...body.input].reverse()) if (item.type === "function_call_output") {
    const sources = JSON.parse(item.output!).data?.sources as { url?: string; sourceId?: string }[] | undefined;
    const source = sources?.find(source => source.url === url && source.sourceId);
    if (source?.sourceId) return source.sourceId;
  }
  throw new Error("Expected a host-issued evidence handle in a real tool result.");
}
let db: PGlite;
let files: Map<string, string>;
let provider: typeof fetch;
const oldFetch = globalThis.fetch;
test("public authoring commands construct and save sourced days, hotel and costs without fixture argument repair", async () => {
  process.env.AGENT_WEB_SEARCH = "true";
  let call = 0, sourceId = "", latestOutput = "";
  const evidence = () => ({ sourceId, detail: "Fixture: lodging 50 to 80 per person-night; meals 30 to 45 per person-day; transit 5 to 10 per day; visits 20 to 25." });
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.stream !== true) return researchResponse("Fictional Hotel and Cafe, 1 Fictional Street, Rome. Synthetic identity and rates: lodging EUR 50 to 80 per person-night; meals 30 to 45 per person-day; transit 5 to 10; visits 20 to 25.");
    assert.doesNotMatch(JSON.stringify(body), /\"editToken\"/);
    for (const part of body.input) {
      if (part.type === "function_call") assert.equal("editToken" in JSON.parse(part.arguments), false, "Host fields must not leak through normalized SDK call history.");
      if (part.type === "function_call_output") assert.doesNotMatch(part.output, /"editToken"/);
    }
    assert.ok(!body.tools.some((tool: { name?: string }) => tool.name === "addDayActivities"), "The public registry has no overlapping add-only helper.");
    call++;
    const instructions = String(body.instructions ?? body.input.filter((p: { role?: string }) => ["system", "developer"].includes(p.role ?? "")).map((p: { content: string | { text?: string }[] }) => typeof p.content === "string" ? p.content : p.content.map(part => part.text ?? "").join("")).join("\n"));
    if (body.tool_choice === "none") {
      assert.equal(body.reasoning.effort, "low", "Final acknowledgment does not repeat planning reasoning.");
      assert.match(instructions, /Verified current-request publication:/);
      assert.match(instructions, /These changes ARE SAVED/);
      assert.match(instructions, /Authoritative saved budget:/);
      assert.match(instructions, /Execution has ended; tools are intentionally disabled/);
      assert.doesNotMatch(instructions, /You have access to the application's plan|Workflow:|Next required work:|Run allowance:/);
      const closingInput = body.input.filter((part: { role?: string }) => part.role === "user");
      assert.equal(closingInput.length, 1);
      assert.match(JSON.stringify(closingInput), /already been processed; it is context for this report, not a new task/);
      assert.equal(body.input.some((part: { type?: string }) => part.type === "function_call_output"), false);
      return providerStream();
    }
    assert.equal(body.reasoning.effort, call <= 2 || call >= 9 ? "medium" : "low", "Actual Responses effort follows initial judgment, assembly/pricing and review phases.");
    assert.equal(body.store, false);
    assert.ok(body.tools.filter((t: { name?: string }) => ["createPlan", "editPlan", "createBudget", "editBudget", "commit"].includes(t.name ?? "")).every((t: { parameters: unknown }) => !JSON.stringify(t.parameters).includes("editToken")));
    const last = body.input.filter((p: { type: string }) => p.type === "function_call_output").at(-1);
    latestOutput = last?.output ?? "";
    if (last) assert.equal(JSON.parse(last.output).outcome, "succeeded", last.output);
    if (call === 1) return functionStream("researchWeb", { query: "Synthetic hotel, cafe and applicable rates." });
    if (call === 2) { sourceId = JSON.parse(last.output).data.sources[0].sourceId; assert.ok(sourceId); return functionStream("createPlan", { plan: { startDate: null, days: [{ id: "day-1", title: "Art" }, { id: "day-2", title: "Food" }, { id: "day-3", title: "Gardens" }] } }); }
    if (call === 3) return functionStream("editPlan", { operations: [{ type: "addStay", id: "hotel", afterDayIds: ["day-1", "day-2"], hotel: { name: "Fictional Hotel", address: "1 Fictional Street", city: "Rome", sourceId } }] });
    if (call >= 4 && call <= 6) {
      const day = call - 3;
      return functionStream("editPlan", { operations: [
        { type: "addActivity", dayId: `day-${day}`, id: `visit-${day}`, title: "Visit the supplied sight", placeId: "place_001", startTime: "09:00" },
        { type: "addActivity", dayId: `day-${day}`, id: `meal-${day}`, title: "Lunch at Fictional Cafe", kind: "meal", startTime: "12:00", durationMinutes: 60, venue: { name: "Fictional Cafe", address: "1 Fictional Street", city: "Rome", sourceId } },
        { type: "addActivity", dayId: `day-${day}`, id: `rest-${day}`, title: "Afternoon rest", kind: "rest", locationItemId: "hotel", startTime: "14:00", durationMinutes: 60 },
      ] });
    }
    if (call === 7) return functionStream("createBudget", { budget: { currency: "EUR", scope: "per_person", travelers: 2, limit: 600, assumptions: "Shared room.", exclusions: ["International travel"] } });
    if (call === 8) return functionStream("editBudget", { operations: [
      { type: "addCost", id: "stay", label: "Two nights", category: "stay", planItemIds: ["hotel"], unit: "person-night", quantity: 2, min: 50, max: 80, priceScope: "per_person", assumptions: "Synthetic shared-room rate.", sources: [evidence()] },
      { type: "addCost", id: "food", label: "Three days of meals", category: "food", planItemIds: ["meal-1", "meal-2", "meal-3"], unit: "person-day", quantity: 3, min: 30, max: 45, priceScope: "per_person", assumptions: "Synthetic meal allowance.", sources: [evidence()] },
      { type: "addCost", id: "transport", label: "Local transport", category: "transport", planItemIds: [], unit: "person-day", quantity: 3, min: 5, max: 10, priceScope: "per_person", assumptions: "Synthetic transit allowance.", sources: [evidence()] },
      { type: "addCost", id: "visits", label: "Admissions", category: "activities", planItemIds: ["visit-1", "visit-2", "visit-3"], unit: "person-admission", quantity: 3, min: 20, max: 25, priceScope: "per_person", assumptions: "Synthetic ticket range.", sources: [evidence()] },
      { type: "review" },
    ] });
    if (call === 9) return functionStream("inspectChanges", {});
    if (call === 10) { assert.deepEqual(JSON.parse(last.output).data.blockers, []); return functionStream("commit", { summary: "Complete fixture assembled with the public authoring protocol", handledInputIds: [] }); }
    assert.match(instructions, /Verified current-request publication:/);
    assert.match(instructions, /These changes ARE SAVED/);
    assert.match(instructions, /Authoritative saved budget:/);
    assert.match(instructions, /Use these exact host-calculated totals/);
    assert.doesNotMatch(instructions, /Next required work:|Run allowance:/);
    assert.equal(body.tool_choice, "none");
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "authoring-user", text: "Plan three days with hotel, food and costs." } }),
  }), reference);
  await response.text();
  assert.equal(call, 11, latestOutput);
  const saved = (await getPlan(reference)).plan!;
  assert.ok(saved);
  assert.deepEqual(saved.days.map(d => d.itemIds.length), [3, 3, 3]);
  assert.equal(saved.items.hotel.kind, "stay");
  const visit = saved.items["visit-1"];
  if (visit.kind !== "visit") throw new Error("Fixture visit missing");
  assert.equal(visit.timing.duration!.minMinutes, 120);
  assert.equal(visit.timing.duration!.basis.kind, "catalog");
  assert.equal(visit.timing.start!.time, "09:00");
  assert.deepEqual(budgetTotals((await getBudget(reference)).budget!), { min: 265, max: 400, confirmed: 0, priced: 4, unknown: 0 });
  assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "complete");
});
test("corrected Plan inputs are resolved and an empty Budget remains the persisted save blocker", async () => {
  let call = 0;
  const p = examplePlan();
  const lines: string[] = [], info = console.info;
  console.info = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    provider = async () => {
      call++;
      if (call === 1) return functionStream("createPlan", { plan: { startDate: null, days: p.days.map(({ id, title }) => ({ id, title })) } });
      if (call === 2) return functionStream("editPlan", { operations: [visitCommand] });
      if (call === 3) return functionStream("editPlan", { operations: [{ type: "updateActivity", id: "visit-1", changes: { reason: 123 } }] });
      if (call === 4) return functionStream("editPlan", { operations: [{ type: "updateActivity", id: "visit-1", changes: { reason: "A corrected local change." } }] });
      if (call === 5) return functionStream("createBudget", { budget: { currency: "EUR", scope: "per_person", travelers: 2, limit: 600, assumptions: "Shared room.", exclusions: [] } });
      if (call === 6) return functionStream("commit", { summary: "Attempted incomplete budget", handledInputIds: [] });
      return providerStream();
    };
    const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "report-user", text: "Plan a trip with a complete budget." } }),
    }), reference);
    await response.text();
    const reply = (await loadConversation(reference, conversation)).messages.at(-1)!;
    const report = reply.parts.find(part => part.type === "data-failure")?.data;
    assert.equal(report?.code, "incomplete");
    assert.equal(report?.blocker, "budget_empty");
    assert.equal(report?.termination?.kind, "tool_choice");
    assert.equal(report?.inputFailure, undefined, "A corrected input error is history, not the current blocker.");
    assert.deepEqual(report?.progress, { hasPlan: true, hasBudget: true, planItems: 1, scheduledItems: 1, populatedDays: 1, budgetEntries: 0, pricedEntries: 0 });
    assert.equal(reply.parts.find(part => part.type === "data-action")?.data.code, "BUDGET_EMPTY");
    assert.ok(JSON.stringify(report).length < 1000);
    assert.equal((await getPlan(reference)).plan, null);
    const { replyFailureMessage } = await import("../lib/chat/failure");
    assert.match(replyFailureMessage(reply), /before adding costs/);
    const events = lines.flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    assert.ok(events.some(e => e.event === "agent_input_corrected" && e.toolName === "editPlan"));
    assert.ok(events.some(e => e.event === "agent_step_finished" && e.tools.some((t: { code: string }) => t.code === "BUDGET_EMPTY") && e.progress.budgetEntries === 0));
    assert.doesNotMatch(lines.join("\n"), /A corrected local change|report-user|Shared room/);
  } finally { console.info = info; }
});
test("SDK assembles initial days and costs incrementally, repairs one batch and publishes once", async () => {
  process.env.AGENT_WEB_SEARCH = "true";
  const p = examplePlan();
  const costs: import("../services/assistant/agent/authoring").BudgetCommand[] = [];
  let calls = 0, researchCalls = 0;
  let sourceId = "";
  const outputs = (body: { input: { type?: string; output?: string }[] }) => body.input.filter(part => part.type === "function_call_output").map(part => JSON.parse(part.output!));
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.stream !== true) {
      researchCalls++;
      return researchResponse("Synthetic fixture evidence: Fictional Hotel and Fictional Cafe A, 1 Fictional Street, Rome. Shared lodging EUR 40 to 60 per person-night, meals EUR 20 to 30, admission EUR 10 to 20. Not real quotes.");
    }
    calls++;
    const results = outputs(body), latest = results.at(-1);
    if (calls > 1 && calls !== 8 && body.tool_choice !== "none") assert.equal(latest.outcome, "succeeded", JSON.stringify(latest));
    if (calls < 17) {
      assert.equal((await getPlan(reference)).plan, null, "Only the final commit publishes the itinerary.");
      assert.equal((await db.query("select * from public.budgets")).rows.length, 0);
    }
    if (calls === 1) return functionStream("saveBrief", { markdown: "# Preferences\nArt and relaxed meals.\n# Budget\nEUR 600 per person.\n# Group\nTwo adults sharing a room.", expectedRevision: 0 });
    if (calls === 2) return functionStream("createPlan", { plan: { startDate: null, days: p.days.map(({ id, title }) => ({ id, title })) } });
    if (calls === 3) {
      assert.match(latest.message, /Empty itinerary initialized/);
      return functionStream("researchWeb", { query: "Find named Rome lodging, a lunch venue and representative prices for this synthetic test." });
    }
    if (calls === 4) {
      sourceId = latest.data.sources[0].sourceId;
      assert.ok(sourceId);
      for (let day = 1; day <= 3; day++) for (const [category, itemId, min, max] of [["food", `meal-${day}`, 20, 30], ["activities", `visit-${day}`, 10, 20]] as const) {
        costs.push({ type: "addCost", id: `${category}-${day}`, label: `${category} day ${day}`, category, planItemIds: [itemId], quantity: 1, unit: "person", min, max, priceScope: "per_person", pricing: "estimated",
          assumptions: "Synthetic fixture rate, not a real quote.", sources: [{ sourceId, detail: "Synthetic fixture prices." }] });
      }
      return functionStream("editPlan", { operations: [{ type: "addStay", id: "stay", afterDayIds: ["day-1", "day-2"], hotel: { name: "Fictional Hotel", address: "1 Fictional Street", city: "Rome", sourceId } }] });
    }
    const dayBatch = (day: number) => [
      { ...visitCommand, id: `visit-${day}`, dayId: `day-${day}` },
      { type: "addActivity", id: `meal-${day}`, dayId: `day-${day}`, title: "Lunch at Fictional Cafe A", kind: "meal", startTime: "12:00", durationMinutes: 60, venue: { name: "Fictional Cafe A", address: "1 Fictional Street", city: "Rome", sourceId } },
      { type: "updateDay", id: `day-${day}`, changes: { startLocation: { locationItemId: "stay" }, endLocation: day === 3 ? null : { locationItemId: "stay" } } },
    ];
    if (calls === 5) return functionStream("editPlan", { operations: dayBatch(1) });
    if (calls === 6) return functionStream("readPlan", { view: "effective", selector: "days", ids: ["day-1"] });
    if (calls === 7) {
      assert.match(JSON.stringify(latest.data), /meal-1/);
      return functionStream("editPlan", { operations: [...dayBatch(2), { type: "updateDay", id: "day-2", changes: { endLocation: { locationItemId: "missing" } } }] });
    }
    if (calls === 8) {
      assert.equal(latest.outcome, "blocked");
      return functionStream("editPlan", { operations: dayBatch(2) });
    }
    if (calls === 9) return functionStream("editPlan", { operations: dayBatch(3) });
    if (calls === 10) return functionStream("createBudget", { budget: { currency: "EUR", scope: "per_person", travelers: 2, limit: 600, assumptions: "Two adults sharing a room. Synthetic evidence.", exclusions: ["International travel"] } });
    if (calls === 11) {
      assert.match(latest.message, /Empty budget initialized and unreviewed/);
      const stay = { ...unpricedStay, planItemIds: ["stay"], pricing: "estimated", min: 40, max: 60, sources: [{ sourceId, detail: "Synthetic lodging 40 to 60 per person-night." }] };
      return functionStream("editBudget", { operations: [stay, ...costs.slice(0, 2)] });
    }
    if (calls === 12) return functionStream("editBudget", { operations: costs.slice(2) });
    if (calls === 13) return functionStream("editPlan", { operations: [{ type: "updateActivity", id: "visit-2", changes: { reason: "Allow a slower second day." } }] });
    if (calls === 14) return functionStream("editBudget", { operations: [{ type: "review" }] });
    if (calls === 15) return functionStream("inspectChanges", {});
    if (calls === 16) {
      assert.equal(latest.data.saved, false);
      assert.equal(latest.data.blockers.length, 0);
      return functionStream("commit", { summary: "Saved three days, lodging and item-linked costs", handledInputIds: [] });
    }
    assert.match(JSON.stringify(body), /Verified current-request publication:/);
    assert.equal(body.tool_choice, "none");
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "incremental-user", text: "Plan three relaxed Rome days with lodging and researched meal costs for two adults. Budget EUR 600 per person." } }),
  }), reference);
  assert.doesNotMatch(await response.text(), /errorText/);
  assert.equal(calls, 17); assert.equal(researchCalls, 1);
  const saved = (await getPlan(reference)).plan!;
  assert.deepEqual(saved.days.map(day => day.itemIds), [["visit-1", "meal-1"], ["visit-2", "meal-2"], ["visit-3", "meal-3"]]);
  assert.equal(Object.keys(saved.items).length, 7);
  assert.equal(saved.items["visit-2"].reason, "Allow a slower second day.");
  const budget = await getBudget(reference);
  assert.equal(budget.budget!.entries.length, 7);
  assert.equal(budget.needsReview, false);
  assert.deepEqual(budgetTotals(budget.budget!), { min: 170, max: 270, confirmed: 0, priced: 7, unknown: 0 });
  assert.equal((await db.query("select * from public.planning_commits")).rows.length, 1);
  assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "complete");
});
const env = Object.fromEntries(
  [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "AGENT_WEB_SEARCH",
  ].map((k) => [k, process.env[k]]),
);
before(async () => {
  db = await createDatabase();
});
after(() => db.close());
beforeEach(async () => {
  await seed(db);
  files = new Map();
  Object.assign(process.env, {
    OPENAI_API_KEY: "fixture",
    OPENAI_MODEL: "gpt-6.1-terra",
    SUPABASE_URL: "https://db.example",
    SUPABASE_SECRET_KEY: "sb_secret_fixture",
    AGENT_WEB_SEARCH: "false",

  });
  provider = async () => providerStream();
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname !== "db.example") { return provider(url, init); }
    const root = "/storage/v1/object/";
    if (target.pathname.startsWith(root + "authenticated/")) {
      const key = target.pathname.slice((root + "authenticated/").length);
      return files.has(key)
        ? new Response(files.get(key))
        : new Response(null, { status: 404 });
    }
    if (target.pathname.startsWith(root) && init?.method === "POST") {
      const key = target.pathname.slice(root.length);
      assert.equal(new Headers(init.headers).get("x-upsert"), "false");
      assert.equal(files.has(key), false);
      files.set(key, String(init.body));
      return Response.json({});
    }
    return databaseFetch(db, target, init);
  };
});
afterEach(() => {
  globalThis.fetch = oldFetch;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
async function session(input = "user-plan", withBudget = true) {
  const turn = await beginTurn(
    reference,
    {
      conversationId: conversation,
      expectedLastId: null,
      retry: false,
      message: { id: input, text: "Plan three days in Rome" },
    },
    generation,
  );
  const agent = await openSession(
      reference,
      conversation,
      turn.responseId,
      generation,
      new AbortController().signal,
    );
  if (withBudget) {
    agent.recordWebSources!(["https://example.com/test-rate"]);
    await agent.proposeBudget!(fixturePricedBudget(), true);
  }
  return { turn, agent };
}
async function text(kind: "working" | "planning_context" = "working") {
  const edit = {
    id: randomUUID(),
    name: "Notes.md",
    kind,
    expectedRevision: 0,
    markdown: "# Requirements\nSlow pace\n\n# Research\nUnknown hours\n",
  };
  const write = await prepareDocument(reference, edit, "user");
  const saved = await publishDocument(reference, write);
  return { edit, write, saved };
}
test("Markdown bytes are stored only in files, revisions remain readable, stale writes fail", async () => {
  const { edit, saved } = await text();
  assert.equal(saved.contentRevision, 1);
  assert.equal(
    (await readTextDocument(reference, edit.id)).markdown,
    edit.markdown,
  );
  const second = await prepareDocument(
    reference,
    { ...edit, expectedRevision: 1, markdown: "# Requirements\nNo stairs" },
    "user",
  );
  await publishDocument(reference, second);
  assert.equal(
    (await readTextDocument(reference, edit.id, 1)).markdown,
    edit.markdown,
  );
  assert.match(
    (await readTextDocument(reference, edit.id)).markdown,
    /No stairs/,
  );
  await assert.rejects(
    prepareDocument(reference, { ...edit, expectedRevision: 1 }, "user"),
    /changed/,
  );
  const rows = await db.query("select * from public.document_versions");
  assert.equal(rows.rows.length, 2);
  assert.doesNotMatch(JSON.stringify(rows.rows), /No stairs|Slow pace/);
  await assert.rejects(readTextDocument(otherTrip, edit.id), /found/);
});
test("file integrity protects whole-file editing", async () => {
  const { edit, write } = await text();
  files.set(`trip-attachments/${write.path}`, "changed");
  await assert.rejects(readTextDocument(reference, edit.id), /match/);

});
test("manual plans are independent of AI, reject cross-project sources and use optimistic revisions", async () => {
  const p = examplePlan();
  const first = await savePlan(reference, 0, p, randomUUID());
  assert.equal(first.snapshot.revision, 1);
  await assert.rejects(savePlan(reference, 0, p, randomUUID()), /changed/);
  const current = await getPlan(reference);
  assert.equal(current.plan?.days.length, 3);
  p.notes.push({
    id: "source-note",
    kind: "action",
    text: "Check ticket",
    relatedItemIds: [],
    sources: [
      { type: "message", conversationId: conversation, messageId: "not-real" },
    ],
  });
  await assert.rejects(savePlan(reference, 1, p, randomUUID()), /source/);
});
test("plan plus context publishes together with one recoverable receipt", async () => {
  const { agent, turn } = await session();
  const view = agent.context as { newContextDocumentId: string };
  await agent.stageDocument({
    id: view.newContextDocumentId,
    name: "Context.md",
    kind: "planning_context",
    expectedRevision: 0,
    markdown: "# Preferences\nSlow pace, from user-plan.",
  });
  assert.equal((await agent.propose(examplePlan(), [])).valid, true);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  const saved = (await agent.commit("Created three days", ["user-plan"])) as {
    saved: boolean;
    receipt: { revision: number };
  };
  assert.equal(saved.saved, true);
  assert.equal(saved.receipt.revision, 3);
  assert.equal((await getPlan(reference)).plan?.days.length, 3);
  assert.match(
    (await readTextDocument(reference, view.newContextDocumentId)).markdown,
    /Slow pace/,
  );
  assert.deepEqual(
    await agent.commit("Repeat", ["user-plan"]),
    await agent.commit("Repeat", ["user-plan"]),
  );
  await saveReply(
    reference,
    conversation,
    turn.responseId,
    generation,
    "",
    "failed",
  );
  const transcript = await loadConversation(reference, conversation);
  assert.ok(
    transcript.messages.at(-1)!.parts.some((p) => p.type === "data-commit"),
  );
  const newGen = randomUUID();
  await beginTurn(
    reference,
    {
      conversationId: conversation,
      expectedLastId: turn.responseId,
      retry: true,
      message: null,
    },
    newGen,
  );
  const retry = await openSession(
    reference,
    conversation,
    turn.responseId,
    newGen,
    new AbortController().signal,
  );
  assert.ok((retry.context as { priorReceipt: unknown }).priorReceipt);
  await assert.rejects(retry.propose(examplePlan(), []), /already saved/);
});
test("concurrent document edits reject a stale run without publishing its plan or files", async () => {
  const { agent } = await session();
  await agent.propose(examplePlan(), []);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  await text();
  await assert.rejects(agent.commit("Create", ["user-plan"]), /changed/);
  assert.equal((await getPlan(reference)).plan, null);
  await agent.reload();
  agent.recordWebSources!(["https://example.com/test-rate"]);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  assert.equal((await agent.propose(examplePlan(), [])).valid, true);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  await agent.commit("Create", ["user-plan"]);
  assert.ok((await getPlan(reference)).plan);
});
test("transaction rollback leaves staged bytes unpublished when a source is invalid", async () => {
  const { agent } = await session();
  const context = (agent.context as { newContextDocumentId: string })
    .newContextDocumentId;
  await agent.stageDocument({
    id: context,
    name: "Context.md",
    kind: "planning_context",
    expectedRevision: 0,
    markdown: "# Proposals\nSomething inferred",
  });
  const p = examplePlan();
  p.startDate = {
    value: "2026-11-01",
    basis: {
      kind: "user",
      sources: [
        { type: "document", documentId: context, revision: 1, section: null },
      ],
      explanation: null,
    },
  };
  assert.equal((await agent.propose(p, [])).valid, true);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  await assert.rejects(agent.commit("Save", ["user-plan"]), /source/);
  assert.equal((await getPlan(reference)).plan, null);
  assert.equal(
    (await db.query("select * from public.attachments")).rows.length,
    0,
  );
  assert.equal(files.size, 1);
});
test("stopped generations cannot commit and failed user input remains pending", async () => {
  const { agent, turn } = await session();
  await agent.propose(examplePlan(), []);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  await saveReply(
    reference,
    conversation,
    turn.responseId,
    generation,
    "",
    "interrupted",
  );
  await assert.rejects(
    agent.commit("Create", ["user-plan"]),
    /expired|stopped/,
  );
  const snapshot = await db.query<{ v: { pendingInputs: unknown[] } }>(
    "select public.planning_snapshot($1) as v",
    [reference],
  );
  assert.equal(snapshot.rows[0].v.pendingInputs.length, 1);
});
test("SDK tool loop validates, commits, persists a receipt, and restores the result", async () => {
  let call = 0;
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-6.1-terra");
    assert.ok(
      JSON.stringify(
        body.tools.find((t: { name: string }) => t.name === "createPlan")
          .parameters,
      ).length < 15000,
      "Provider tool schema should reuse definitions.",
    );
    assert.equal(body.store, false);
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.reasoning?.effort, call === 0 ? "medium" : "low", "Responses uses requirement judgment followed by assembly and final reporting for this fixture.");
    call++;
    const draft = offlineDraftCalls()[call - 1];
    if (draft) return functionStream(...draft);
    if (call === 7) {
      assert.match(JSON.stringify(body), /readyToCommit/);
      return functionStream("commit", { summary: "Created your first plan", handledInputIds: [] });
    }
    assert.match(JSON.stringify(body), /Created your first plan/);
    return providerStream();
  };
  const req = new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({
      conversationId: conversation,
      expectedLastId: null,
      retry: false,
      message: { id: "sdk-user", text: "Plan three days in Rome" },
    }),
  });
  const response = await handleChat(req, reference);
  assert.equal(response.status, 200);
  const stream = await response.text();
  assert.doesNotMatch(stream, /errorText/);
  assert.equal(call, 8);
  assert.equal((stream.match(/"type":"text-start"/g) ?? []).length, 1);
  assert.equal((stream.match(/What pace do you prefer/g) ?? []).length, 1);
  assert.ok((await getPlan(reference)).plan);
  const saved = await loadConversation(reference, conversation);
  assert.equal(saved.messages.at(-1)!.metadata?.status, "complete");
  assert.ok(saved.messages.at(-1)!.parts.some((p) => p.type === "data-commit"));
});
test("anonymous database roles cannot access new modules or integration commands", async () => {
  await db.exec("set role anon");
  try {
    for (const query of [
      "select * from public.plans",
      "select * from public.document_versions",
      "select * from public.planning_runs",
      `select public.planning_snapshot('${reference}')`,
      `select public.plan_get('${reference}')`,
    ])
      await assert.rejects(db.query(query), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("reload adopts context created by another writer and keeps exact revisions", async () => {
  const { agent } = await session("user-plan", false);
  const { edit, saved } = await text("planning_context");
  const latest = (await agent.reload()) as { newContextDocumentId: string };
  assert.equal(latest.newContextDocumentId, edit.id);
  await agent.stageDocument({
    ...edit,
    expectedRevision: saved.revision,
    markdown: "# Requirements\nSlow pace and breaks",
  });
  await agent.commit("Updated context", ["user-plan"]);
  assert.match((await readTextDocument(reference, edit.id)).markdown, /breaks/);
});

test("source deletion denies file access without erasing saved facts or blocking later edits", async () => {
  const { edit, saved } = await text();
  const p = examplePlan();
  p.startDate = {
    value: "2026-11-01",
    basis: {
      kind: "user",
      sources: [
        {
          type: "document",
          documentId: edit.id,
          revision: 1,
          section: "Requirements",
        },
      ],
      explanation: null,
    },
  };
  await savePlan(
    reference,
    (await getPlan(reference)).revision,
    p,
    randomUUID(),
  );
  await db.query("select public.document_mutate($1,$2,'delete',$3)", [
    reference,
    edit.id,
    saved.revision,
  ]);
  await assert.rejects(readTextDocument(reference, edit.id));
  p.days[1].title = "A relaxed second day";
  await savePlan(
    reference,
    (await getPlan(reference)).revision,
    p,
    randomUUID(),
  );
  assert.equal((await getPlan(reference)).plan?.startDate?.value, "2026-11-01");
});


test("manual retry returns the latest snapshot without replacing a newer protected plan", async () => {
  const initial = examplePlan(),
    requestId = randomUUID();
  await savePlan(reference, 0, initial, requestId);
  const newer = structuredClone(initial);
  newer.items["visit-1"].keep = {
    basis: {
      kind: "user",
      sources: [{ type: "legacy_notes" }],
      explanation: null,
    },
  };
  await savePlan(reference, 1, newer, randomUUID());
  const retried = await savePlan(reference, 0, initial, requestId);
  assert.equal(retried.savedRevision, 1);
  assert.ok(retried.snapshot.plan?.items["visit-1"].keep);
  const altered = structuredClone(initial);
  altered.days[0].title = "A different request";
  await assert.rejects(savePlan(reference, 0, altered, requestId), /changed/);
});

test("SDK saves a complete comparable-based budget with provenance and correct totals", async () => {
  process.env.AGENT_WEB_SEARCH = "true";
  const budget = unknownBudget();
  Object.assign(budget.entries[0], { pricing: "estimated", unitMin: 50, unitMax: 80, sources: [{ title: "Official rates", url: "https://example.com/rates", documentId: null, documentRevision: null, checkedAt: "2026-10-27T00:00:00.000Z", detail: "Indicative rates, dates not selected." }] });
  const base = budget.entries[0];
  base.quantity = 2;
  base.unit = "person-night";
  base.assumptions = "Indicative room rate divided by two for assumed room sharing; actual group size remains unknown.";
  base.sources[0].detail = "Synthetic comparable hotel quotes: EUR 100 to 160 per room-night, different dates.";
  budget.entries.push(
    { ...structuredClone(base), id: "food", label: "Meals for three days", category: "food", unit: "person-day", quantity: 3, unitMin: 30, unitMax: 50,
      assumptions: "Three meals daily, using representative menu prices; no selected restaurants.",
      sources: [{ ...base.sources[0], detail: "Synthetic menu anchors: breakfast EUR 5 to 10, lunch 10 to 15, dinner 15 to 25." }] },
    { ...structuredClone(base), id: "transport", label: "Local transport", category: "transport", unit: "person-pass", quantity: 1, unitMin: 45, unitMax: 45,
      assumptions: "Indicative published pass price, future tariff not guaranteed.",
      sources: [{ ...base.sources[0], detail: "Synthetic pass tariff EUR 45." }] },
    { ...structuredClone(base), id: "activity", label: "Museum allowance", category: "activities", unit: "person-ticket", quantity: 1, unitMin: 15, unitMax: 25,
      assumptions: "Comparable museum admission range; selected date not yet quoted.",
      sources: [{ ...base.sources[0], detail: "Synthetic comparable museum tariffs EUR 15 and 25." }] },
  );
  let call = 0;
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.tool_choice !== "none") assert.match(JSON.stringify(body), /Required first-generation guide/);
    assert.match(JSON.stringify(body), /web_search/);
    assert.doesNotMatch(JSON.stringify(body), /webSearch/);
    assert.ok(body.tools.some((tool: { type: string }) => tool.type === "web_search"));
    call++;
    if (call === 1) return functionStream("readGuide", { id: "budget-research" });
    if (call === 2) {
      assert.match(JSON.stringify(body), /Amount and applicability/);
      const item = { type: "web_search_call", id: "ws_test", status: "completed", action: { type: "search", query: "official Rome rates", sources: [{ type: "url", url: "https://example.com/rates" }] } };
      const functionEvents = (await functionStream("createPlan", { plan: planHeader }).text()).split("\n\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
      const events = [
        functionEvents[0],
        { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress" } },
        { type: "response.output_item.done", output_index: 0, item },
        ...functionEvents.slice(1).map(event => "output_index" in event ? { ...event, output_index: 1 } : event),
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }
    if (call === 3) return functionStream("readEnvironment", {});
    if (call === 4) return functionStream("editPlan", { operations: [visitCommand] });
    if (call === 5) return functionStream("createBudget", { budget: budgetSettings });
    if (call === 6) {
      const sourceId = sourceHandle(body, "https://example.com/rates");
      return functionStream("editBudget", { operations: [
        { type: "addCost", id: "stay", label: "Lodging", category: "stay", planItemIds: [], unit: "person-night", quantity: 2, min: 50, max: 80, priceScope: "per_person", assumptions: "Indicative room rate divided by two for assumed room sharing; actual group size remains unknown.", sources: [{ sourceId, title: "Official rates", detail: "Synthetic comparable hotel quotes: EUR 100 to 160 per room-night, different dates." }] },
        { type: "addCost", id: "food", label: "Meals for three days", category: "food", planItemIds: [], unit: "person-day", quantity: 3, min: 30, max: 50, priceScope: "per_person", assumptions: "Three meals daily, using representative menu prices; no selected restaurants.", sources: [{ sourceId, title: "Official rates", detail: "Synthetic menu anchors: breakfast EUR 5 to 10, lunch 10 to 15, dinner 15 to 25." }] },
        { type: "addCost", id: "transport", label: "Local transport", category: "transport", planItemIds: [], unit: "person-pass", quantity: 1, min: 45, max: 45, priceScope: "per_person", assumptions: "Indicative published pass price, future tariff not guaranteed.", sources: [{ sourceId, title: "Official rates", detail: "Synthetic pass tariff EUR 45." }] },
        { type: "addCost", id: "activity", label: "Museum allowance", category: "activities", planItemIds: [], unit: "person-ticket", quantity: 1, min: 15, max: 25, priceScope: "per_person", assumptions: "Comparable museum admission range; selected date not yet quoted.", sources: [{ sourceId, title: "Official rates", detail: "Synthetic comparable museum tariffs EUR 15 and 25." }] },
        { type: "review" },
      ] });
    }
    if (call === 7) return functionStream("commit", { summary: "Researched budget saved", handledInputIds: ["research-user"] });
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "research-user", text: "Plan Rome and research prices" } }),
  }), reference);
  const stream = await response.text();
  assert.doesNotMatch(stream, /errorText/);
  assert.equal(call, 8);
  const snapshot = await db.query<{ content: typeof budget }>("select content from public.budgets where trip_reference=$1", [reference]);
  const saved = snapshot.rows[0]?.content;
  assert.deepEqual(budgetTotals(saved), { min: 250, max: 380, confirmed: 0, priced: 4, unknown: 0 });
  assert.equal(saved.travelers, null);
  assert.match(saved.entries[0].assumptions, /assumed room sharing/);
  assert.match(saved.entries[0].sources[0].detail, /per room-night/);
  for (const entry of saved.entries) {
    assert.ok(!Number.isNaN(Date.parse(entry.sources[0].checkedAt)));
    const expected = budget.entries.find(expected => expected.id === entry.id)!;
    assert.deepEqual(entry, { ...expected, sources: [{ ...expected.sources[0], checkedAt: entry.sources[0].checkedAt }] });
  }
});

test("SDK blocks the six-unknown regression, delivers guidance, then saves sourced prices and explained gaps", async () => {
  process.env.AGENT_WEB_SEARCH = "true";
  const missing = unknownBudget();
  missing.entries = ["stay", "food", "transit", "colosseum", "pantheon", "tax"].map(id => ({
    ...missing.entries[0], id, label: id, assumptions: "No supported amount from the initial search.",
  }));
  const corrected = structuredClone(missing);
  corrected.entries[0] = fixturePricedBudget().entries[0];
  const gaps = corrected.entries.slice(1).map(entry => ({
    entryId: entry.id, reason: "not_found",
    explanation: "The targeted follow-up returned only a URL and no usable price facts for this synthetic fixture.",
  }));
  let call = 0;
  async function searchAndCall(name: string, input: unknown) {
    const item = { type: "web_search_call", id: `ws_gap_${call}`, status: "completed", action: {
      type: "search", query: "synthetic official rate fixture", sources: [{ type: "url", url: "https://example.com/test-rate" }],
    } };
    const fn = (await functionStream(name, input).text()).split("\n\n")
      .filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
    const events = [fn[0],
      { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress" } },
      { type: "response.output_item.done", output_index: 0, item },
      ...fn.slice(1).map(event => "output_index" in event ? { ...event, output_index: 1 } : event),
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const outputs = body.input.filter((item: { type: string }) => item.type === "function_call_output");
    const latest = outputs.length ? JSON.parse(outputs.at(-1).output).data : null;
    call++;
    if (call === 1) return searchAndCall("createPlan", { plan: planHeader });
    if (call === 2) return functionStream("editPlan", { operations: [visitCommand] });
    if (call === 3) return functionStream("createBudget", { budget: budgetSettings });
    if (call === 4) return functionStream("editBudget", { operations: [...["stay", "food", "transit", "colosseum", "pantheon", "tax"].map(id => ({ ...unpricedStay, id, label: id, assumptions: "No supported amount from the initial search." })), { type: "review" }] });
    if (call === 5) {
      assert.equal(latest.budgetCheck.priced, 0);
      assert.equal(latest.budgetCheck.unknown, 6);
      assert.equal(latest.guidance.id, "budget-gaps");
      return functionStream("commit", { summary: "Premature completion", handledInputIds: ["gap-user"] });
    }
    if (call === 6) {
      assert.equal(latest.saved, false);
      assert.equal(latest.budgetCheck.pending.length, 6);
      assert.match(latest.guidance.content, /targeted researchWeb follow-up/);
      assert.equal((await getPlan(reference)).plan, null);
      assert.equal((await db.query("select * from public.budgets where trip_reference=$1", [reference])).rows.length, 0);
      assert.equal(files.size, 0);
      return searchAndCall("readEnvironment", {});
    }
    if (call === 7) return functionStream("editBudget", { operations: [{ type: "updateCost", id: "stay", changes: { pricing: "estimated", min: 40, max: 60, sources: [{ sourceId: sourceHandle(body), detail: "Synthetic comparable room rates." }] } }] });
    if (call === 8) {
      assert.equal(latest.budgetCheck.priced, 1);
      assert.equal(latest.budgetCheck.unknown, 5);
      return functionStream("resolveBudgetGaps", { gaps });
    }
    if (call === 9) {
      assert.equal(latest.budgetCheck.readyToCommit, true);
      assert.equal(latest.budgetCheck.coverage, "partial");
      return functionStream("editBudget", reviewBudget);
    }
    if (call === 10) return functionStream("commit", { summary: "Partial researched budget, five costs still unknown", handledInputIds: ["gap-user"] });
    assert.match(JSON.stringify(body), /Verified current-request publication:/);
    assert.match(JSON.stringify(body), /Priced subtotal/);
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false,
      message: { id: "gap-user", text: "Plan Rome with researched prices" } }),
  }), reference);
  assert.doesNotMatch(await response.text(), /errorText/);
  assert.equal(call, 11);
  const saved = await db.query<{ content: typeof missing }>("select content from public.budgets where trip_reference=$1", [reference]);
  assert.equal(saved.rows[0].content.entries[0].unitMin, 40);
  for (const entry of saved.rows[0].content.entries.slice(1)) {
    assert.equal(entry.unitMin, null);
    assert.match(entry.assumptions, /targeted follow-up/);
  }
  assert.ok((await getPlan(reference)).plan);
});

async function briefSession(signal = new AbortController().signal) {
  const turn = await beginTurn(reference, {
    conversationId: conversation, expectedLastId: null, retry: false,
    message: { id: "brief-user", text: "I like art and a relaxed pace. Plan three days." },
  }, generation);
  const agent = await openSession(reference, conversation, turn.responseId, generation, signal);
  return { turn, agent };
}
const briefText = "# Preferences\nUser-stated: art and a relaxed pace. Source: message brief-user.\n\n# Budget\nUnknown.\n\n# Dates and arrival/departure\nAssumed start: 2026-11-03.\n\n# Group and activity needs\nGroup size unknown.\n\n# Existing arrangements and other constraints\nNone provided.\n\n# Questions to confirm\nTravel dates and group size?";
type BriefResult = { saved: boolean; planningComplete: boolean; document: { id: string; revision: number; contentRevision: number }; workspace: { revision: number; priorReceipt: unknown; supportingContext: { markdown: string } } };

test("brief checkpoint saves readable context without finishing the request, then allows final commit", async () => {
  const { agent, turn } = await briefSession();
  const result = await agent.saveBrief(briefText, 0) as BriefResult;
  assert.equal(result.saved, true);
  assert.equal(result.planningComplete, false);
  assert.equal(result.workspace.priorReceipt, null);
  assert.equal((await getPlan(reference)).plan, null);
  assert.equal((await db.query("select * from public.planning_commits")).rows.length, 0);
  assert.equal((await db.query<{ status: string }>("select status from messages where id=$1", [turn.responseId])).rows[0].status, "streaming");
  assert.equal((await readTextDocument(reference, result.document.id)).markdown, briefText);
  const discovery = await agent.describeCatalog() as { total: number };
  assert.equal(discovery.total, 103);
  const matches = await agent.search({ cities: ["Rome"], types: ["museum"] }) as { places: { id: string; city: string }[] };
  assert.ok(matches.places.length);
  assert.ok(matches.places.every(place => place.city === "Rome"));
  await agent.propose(examplePlan(), []);
  agent.recordWebSources!(["https://example.com/test-rate"]);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  await agent.commit("Created plan after brief checkpoint", ["brief-user"]);
  assert.ok((await getPlan(reference)).plan);
  assert.equal((await db.query("select * from document_versions")).rows.length, 1);
  await assert.rejects(agent.saveBrief(briefText, 1), /already saved/);
});

test("interrupted planning retains brief and pending input, and rejects further checkpoint writes", async () => {
  const { agent, turn } = await briefSession();
  const saved = await agent.saveBrief(briefText, 0) as BriefResult;
  await saveReply(reference, conversation, turn.responseId, generation, "", "interrupted");
  await assert.rejects(agent.saveBrief(briefText + "\nMore", saved.document.revision), /expired|stopped/);
  const result = await db.query<{ v: { contextDocumentId: string; pendingInputs: { id: string }[] } }>("select planning_snapshot($1) as v", [reference]);
  assert.equal(result.rows[0].v.contextDocumentId, saved.document.id);
  assert.ok(result.rows[0].v.pendingInputs.some(input => input.id === "brief-user"));
  assert.equal((await readTextDocument(reference, saved.document.id)).markdown, briefText);
  assert.equal((await getPlan(reference)).plan, null);
  const reopened = await openSession(reference, conversation, turn.responseId, generation, new AbortController().signal).catch(() => null);
  assert.equal(reopened, null);
});

test("checkpoint retries recover lost responses without duplicate document versions", async () => {
  const { agent } = await briefSession();
  const transport = globalThis.fetch;
  let lost = false;
  globalThis.fetch = async (url, init) => {
    const result = await transport(url, init);
    if (String(url).endsWith("/planning_save_brief") && !lost) { lost = true; throw new Error("Lost checkpoint response"); }
    return result;
  };
  const first = await agent.saveBrief(briefText, 0) as BriefResult;
  assert.equal(first.saved, true, "The host verifies the same brief write after a lost response.");
  const recovered = await agent.saveBrief(briefText, 0) as BriefResult;
  assert.equal(recovered.saved, true);
  assert.equal(recovered.document.contentRevision, 1);
  assert.equal((await db.query("select * from document_versions")).rows.length, 1);
  assert.equal((await db.query("select * from planning_commits")).rows.length, 0);
});

test("checkpoint reload reconciles changed project revisions and preserves concurrent brief edits", async () => {
  const { agent } = await briefSession();
  await text();
  await assert.rejects(agent.saveBrief(briefText, 0), /changed/);
  await agent.reload();
  const first = await agent.saveBrief(briefText, 0) as BriefResult;
  const edit = { id: first.document.id, name: "Travel brief.md", kind: "planning_context" as const, expectedRevision: first.document.revision, markdown: briefText + "\nUser added: avoid stairs." };
  await publishDocument(reference, await prepareDocument(reference, edit, "user"));
  await assert.rejects(agent.saveBrief(briefText + "\nStale update", first.document.revision), /changed/);
  const latest = await agent.reload() as { supportingContext: { revision: number; markdown: string } };
  assert.match(latest.supportingContext.markdown, /avoid stairs/);
  const next = await agent.saveBrief(latest.supportingContext.markdown + "\nAgent suggestion: allow rest breaks.", latest.supportingContext.revision) as BriefResult;
  assert.equal(next.document.id, first.document.id);
  assert.equal(next.document.contentRevision, 3);
});

test("late brief updates stage with the plan and budget without publishing early", async () => {
  const { agent } = await briefSession();
  const first = await agent.saveBrief(briefText, 0) as BriefResult;
  await agent.propose(examplePlan(), []);
  agent.recordWebSources!(["https://example.com/test-rate"]);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  await assert.rejects(agent.saveBrief(briefText, 0), /revision/);
  const updated = briefText + "\nDraft base: Rome. Confirm after reviewing the complete draft.";
  const staged = await agent.saveBrief(updated, first.document.revision) as { saved: boolean; staged: boolean; requiresCommit: boolean };
  assert.equal(staged.saved, false);
  assert.equal(staged.staged, true);
  assert.equal(staged.requiresCommit, true);
  assert.equal((await readTextDocument(reference, first.document.id)).markdown, briefText);
  assert.equal((await getPlan(reference)).plan, null);
  await agent.commit("Complete draft and updated brief", ["brief-user"]);
  assert.ok((await getPlan(reference)).plan);
  assert.equal((await readTextDocument(reference, first.document.id)).markdown, updated);
  assert.equal((await db.query("select * from budgets")).rows.length, 1);
  assert.equal((await db.query("select * from document_versions")).rows.length, 2);
});

test("checkpoint refuses aborted runs and anonymous RPC access", async () => {
  const controller = new AbortController();
  const { agent } = await briefSession(controller.signal);
  controller.abort();
  await assert.rejects(agent.saveBrief(briefText, 0), /abort/i);
  assert.equal(files.size, 0);
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query("select planning_save_brief($1,$2,$3,0,$4)", [reference, "reply", generation, randomUUID()]), /permission denied/);
  } finally { await db.exec("reset role"); }
});

test("SDK runs trip-details checkpoint and shared catalog tools before proposing artifacts", async () => {
  let call = 0;
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    call++;
    if (call === 1) {
      assert.match(JSON.stringify(body), /# Trip details/);
      assert.match(JSON.stringify(body), /Step 1: Understand and save the input/);
      return functionStream("saveBrief", { markdown: briefText, expectedRevision: 0 });
    }
    if (call === 2) {
      assert.equal(body.tool_choice, "required");
      assert.match(JSON.stringify(body), /planningComplete/);
      return functionStream("describeCatalog", {});
    }
    if (call === 3) {
      assert.match(JSON.stringify(body), /not EUR amounts/);
      return functionStream("searchPlaces", { cities: ["Rome"], types: ["museum"], limit: 2 });
    }
    if (call === 4) {
      assert.match(JSON.stringify(body), /Borghese Gallery/);
      return functionStream("readPlaces", { ids: ["place_001"] });
    }
    const draft = offlineDraftCalls()[call - 5];
    if (draft) return functionStream(...draft);
    if (call === 11) return functionStream("saveBrief", { markdown: briefText + "\nProposed base: Rome.", expectedRevision: 1 });
    if (call === 12) {
      assert.match(JSON.stringify(body), /Travel brief update prepared/);
      return functionStream("commit", { summary: "Brief and plan saved", handledInputIds: [] });
    }
    assert.equal(body.tool_choice, "none");
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "brief-user", text: "Plan three days with art and a relaxed pace" } }),
  }), reference);
  const stream = await response.text();
  assert.doesNotMatch(stream, /errorText|Invalid input/);
  assert.equal(call, 13);
  assert.ok((await getPlan(reference)).plan);
  assert.equal((await db.query("select * from document_versions")).rows.length, 2);
  const saved = await loadConversation(reference, conversation);
  assert.match(stream, /"toolName":"saveBrief"/);
  assert.match(stream, /"planningComplete":false/);
  assert.ok(saved.messages.at(-1)!.parts.some(part => part.type === "data-commit"));
});

test("checkpoint RPC rejects unrelated document writes and obsolete run tokens", async () => {
  const { turn } = await briefSession();
  const edit = { id: randomUUID(), name: "Travel brief.md", kind: "planning_context" as const, expectedRevision: 0, markdown: briefText };
  const agentWrite = await prepareDocument(reference, edit, "agent");
  const userWrite = await prepareDocument(reference, { ...edit, id: randomUUID() }, "user");
  const workingWrite = await prepareDocument(reference, { ...edit, id: randomUUID(), kind: "working" }, "agent");
  const checkpoint = (tripId: string, token: string, write: string) => db.query("select planning_save_brief($1,$2,$3,0,$4)", [tripId, turn.responseId, token, write]);
  await assert.rejects(checkpoint(otherTrip, generation, agentWrite.id), /PLAN_ATTEMPT/);
  await assert.rejects(checkpoint(reference, randomUUID(), agentWrite.id), /PLAN_ATTEMPT/);
  await assert.rejects(checkpoint(reference, generation, userWrite.id), /PLAN_INVALID/);
  await assert.rejects(checkpoint(reference, generation, workingWrite.id), /PLAN_INVALID/);
  await db.query("update planning_runs set deadline=now()-interval '1 minute' where id=$1", [turn.responseId]);
  await assert.rejects(checkpoint(reference, generation, agentWrite.id), /PLAN_ATTEMPT/);
  assert.equal((await db.query("select * from document_versions")).rows.length, 0);
});

test("runtime catches an unsaved final response and gives one bounded recovery opportunity", async () => {
  let call = 0;
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    call++;
    const draft = offlineDraftCalls();
    if (call <= 2) return functionStream(...draft[call - 1]);
    if (call === 3) return providerStream();
    assert.match(JSON.stringify(body), body.tool_choice === "none" ? /Verified current-request publication:/ : /Completion check/);
    if (call <= 7) return functionStream(...draft[call - 2]);
    if (call === 8) return functionStream("commit", { summary: "Recovered unfinished save", handledInputIds: [] });
    if (call === 9) {
      assert.equal(body.tool_choice, "none");
      return new Response((await providerStream().text()).replaceAll("What pace do you prefer?", "Your draft is saved. What pace do you prefer?"), { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error("Unexpected extra recovery step");
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "recover-user", text: "Plan Rome" } }),
  }), reference);
  const stream = await response.text();
  assert.doesNotMatch(stream, /errorText/);
  assert.equal(call, 9);
  assert.equal((stream.match(/"type":"text-start"/g) ?? []).length, 1);
  assert.equal((stream.match(/What pace do you prefer/g) ?? []).length, 1);
  assert.ok((await getPlan(reference)).plan);
  const last = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(last.metadata?.status, "complete", "Recovery uses unused steps to finish the save and its reply");
  assert.equal(last.parts.find(part => part.type === "data-failure"), undefined);
  assert.equal(last.parts.filter(part => part.type === "text").map(part => part.text).join(""), "Your draft is saved. What pace do you prefer?");
  assert.equal(last.parts.find(part => part.type === "data-action")?.data.state, "saved");
});

test("a protocol failure during recovery can use the remaining allowance to save", async () => {
  let call = 0;
  provider = async (_url, init) => {
    call++;
    const draft = offlineDraftCalls()[call - 1];
    if (draft) return functionStream(...draft);
    if (call === 7 || call === 8) return providerStream();
    if (call === 9) {
      assert.match(String(init?.body), /previous response made no tool call/);
      return functionStream("commit", { summary: "Recovered using remaining allowance", handledInputIds: [] });
    }
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "protocol-recovery-user", text: "Plan Rome." } }),
  }), reference);
  await response.text();
  assert.equal(call, 10);
  assert.ok((await getPlan(reference)).plan);
  assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "complete");
  assert.equal((await db.query("select * from public.planning_commits")).rows.length, 1);
});

test("an agent that still does not commit ends with durable unsaved status, not task success", async () => {
  let call = 0;
  provider = async () => ++call === 1 ? functionStream("createPlan", { plan: planHeader }) : providerStream();
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "unsaved-user", text: "Plan Rome" } }),
  }), reference);
  const stream = await response.text();
  assert.equal(call, 4, "One extra bounded protocol-repair pass, never an unbounded retry loop");
  assert.match(stream, /"state":"unsaved"/);
  assert.equal((await getPlan(reference)).plan, null);
  const last = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(last.metadata?.status, "failed");
  assert.equal(last.parts.find(part => part.type === "data-action")?.data.state, "unsaved");
});

test("question-only responses do not require a save or invoke recovery", async () => {
  let call = 0;
  provider = async () => { call++; return providerStream(); };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "question-user", text: "What is an itinerary?" } }),
  }), reference);
  await response.text();
  assert.equal(call, 1);
  assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "complete");
});

test("action state survives checkpoints and interruption and restores as retry context", async () => {
  const { agent, turn } = await session();
  await agent.recordAction({ state: "unknown", operationId: turn.responseId, message: "Save response was lost.", code: "OUTCOME_UNKNOWN", revision: null });
  await saveReply(reference, conversation, turn.responseId, generation, "Partial response", "streaming");
  await saveReply(reference, conversation, turn.responseId, generation, "Partial response", "interrupted");
  const last = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(last.parts.find(part => part.type === "data-action")?.data.state, "unknown");
  const nextGeneration = randomUUID();
  await beginTurn(reference, { conversationId: conversation, expectedLastId: turn.responseId, retry: true, message: null }, nextGeneration);
  const retried = await openSession(reference, conversation, turn.responseId, nextGeneration, new AbortController().signal);
  assert.equal((retried.context as { priorAction: { state: string } }).priorAction.state, "unknown");
});

test("receipt verification recovers an actually committed write after a lost response", async () => {
  const { agent, turn } = await session();
  await agent.propose(examplePlan(), []);
  await agent.proposeBudget!(fixturePricedBudget(), true);
  const actualFetch = globalThis.fetch;
  let dropped = false;
  globalThis.fetch = async (url, init) => {
    const response = await actualFetch(url, init);
    if (String(url).endsWith("/planning_commit_budget") && !dropped) { dropped = true; throw new TypeError("Lost response after database commit"); }
    return response;
  };
  await assert.rejects(agent.commit("Saved despite lost response", ["user-plan"]), /Lost response/);
  const result = await agent.verifyCommit();
  assert.equal(result.saved, true);
  assert.equal(result.receipt?.operation_id, turn.responseId);
  const again = await agent.commit("Must not write again", ["user-plan"]) as { saved: boolean };
  assert.equal(again.saved, true);
  assert.equal((await db.query("select * from public.planning_commits where operation_id=$1", [turn.responseId])).rows.length, 1);
});

test("action RPCs isolate projects and generations, and cannot fabricate saved status", async () => {
  const { agent, turn } = await session();
  await assert.rejects(agent.recordAction({ state: "saved", operationId: turn.responseId, message: "Unverified", code: "SAVED", revision: 1 }), /invalid/);
  await assert.rejects(db.query("select public.planning_run_result($1,$2)", [otherTrip, turn.responseId]), /PLAN_NOT_FOUND/);
  const result = await db.query<{ value: boolean }>("select public.planning_record_action($1,$2,$3,$4) as value", [reference, turn.responseId, randomUUID(), JSON.stringify({ state: "unsaved", operationId: turn.responseId })]);
  assert.equal(result.rows[0].value, false);
  await db.exec("set role anon");
  try { await assert.rejects(db.query("select public.planning_run_result($1,$2)", [reference, turn.responseId]), /permission denied/); }
  finally { await db.exec("reset role"); }
});

test("an invalid Plan cannot be hidden by committing an unrelated valid budget", async () => {
  const { agent } = await session();
  const invalid = examplePlan(); invalid.days[0].itemIds = ["missing"];
  assert.equal((await agent.propose(invalid, [])).valid, false);
  await assert.rejects(agent.commit("Pretend plan saved", ["user-plan"]), /requested change is missing/);
  assert.equal((await getPlan(reference)).plan, null);
});

test("SDK input validation failures also participate in completion checks", async () => {
  let call = 0;
  provider = async (_url, init) => {
    call++;
    if (call === 1) return functionStream("createPlan", { plan: {} });
    assert.match(String(init?.body), /TOOL_INPUT_INVALID|Completion check/);
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "invalid-tool-user", text: "Plan Rome" } }),
  }), reference);
  await response.text();
  assert.equal(call, 4);
  const last = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(last.metadata?.status, "failed");
  assert.equal(last.parts.find(part => part.type === "data-action")?.data.code, "TOOL_INPUT_INVALID");
});


test("planning continues past sixteen steps and saves before replying", async () => {
  let call = 0;
  provider = async () => {
    call++;
    if (call < 20) return functionStream("readGuide", { id: "budget-research" });
    const draft = offlineDraftCalls()[call - 20];
    if (draft) return functionStream(...draft);
    if (call === 26) return functionStream("commit", { summary: "Long planning run saved", handledInputIds: [] });
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "long-user", text: "Plan Rome" } }),
  }), reference);
  assert.doesNotMatch(await response.text(), /errorText/);
  assert.equal(call, 27);
  assert.ok((await getPlan(reference)).plan);
  const last = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(last.metadata?.status, "complete");
  assert.equal(last.parts.find(part => part.type === "data-action")?.data.state, "saved");
});

test("unfinished tool loops stop at the configured total steps including recovery", async () => {
  let call = 0;
  provider = async (_url, init) => {
    call++;
    const body = JSON.stringify(JSON.parse(String(init?.body)));
    assert.ok(call <= MAX_AGENT_STEPS, "No provider call beyond the total allowance");
    if (call === MAX_AGENT_STEPS - RECOVERY_STEPS - 2) assert.match(body, /Run allowance: 3 steps remain/);
    if (call === MAX_AGENT_STEPS - RECOVERY_STEPS) assert.match(body, /Run allowance: 1 steps remain/);
    if (call > MAX_AGENT_STEPS - RECOVERY_STEPS) assert.match(body, /Completion check/);
    return call === 1
      ? functionStream("createPlan", { plan: planHeader })
      : functionStream("readGuide", { id: "budget-research" });
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "bounded-user", text: "Plan Rome" } }),
  }), reference);
  const stream = await response.text();
  assert.doesNotMatch(stream, /errorText/);
  assert.equal(call, MAX_AGENT_STEPS);
  const failure = (await loadConversation(reference, conversation)).messages.at(-1)?.parts.find(part => part.type === "data-failure");
  assert.equal(failure?.data.code, "step_limit");
  assert.equal(failure?.data.steps, MAX_AGENT_STEPS);
  assert.equal((await getPlan(reference)).plan, null);
  assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "interrupted");
});


test("a commit at the planning limit gets a final explanation without repeating the save", async () => {
  let call = 0;
  provider = async (_url, init) => {
    call++;
    const commitStep = MAX_AGENT_STEPS - RECOVERY_STEPS;
    if (call < commitStep - 6) return functionStream("readGuide", { id: "budget-research" });
    const draft = offlineDraftCalls()[call - (commitStep - 6)];
    if (draft) return functionStream(...draft);
    if (call === commitStep) return functionStream("commit", { summary: "Saved at planning limit", handledInputIds: [] });
    assert.match(String(init?.body), /Verified current-request publication:/);
    assert.equal(JSON.parse(String(init?.body)).tool_choice, "none");
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "commit-limit-user", text: "Plan Rome" } }),
  }), reference);
  assert.doesNotMatch(await response.text(), /errorText/);
  assert.equal(call, MAX_AGENT_STEPS - RECOVERY_STEPS + 1);
  const last = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(last.metadata?.status, "complete");
  assert.equal(last.parts.find(part => part.type === "data-action")?.data.state, "saved");
  assert.equal(last.parts.some(part => part.type === "data-failure"), false);
  assert.equal((await db.query("select * from planning_commits")).rows.length, 1);
});


test("planning lifetime allows ten minutes while expired writes remain guarded", async () => {
  const { turn } = await session();
  const timing = await db.query<{ seconds: number }>("select extract(epoch from deadline-created_at)::float as seconds from planning_runs where id=$1", [turn.responseId]);
  assert.ok(timing.rows[0].seconds >= 599 && timing.rows[0].seconds <= 601);
  const privileges = await db.query<{ allowed: boolean }>("select has_function_privilege('anon','public.chat_write_reply_result(uuid,uuid,text,uuid,text,text,jsonb)','execute') as allowed");
  assert.equal(privileges.rows[0].allowed, false);
  const report = { code: "timeout", steps: 12, elapsedMs: 540000, finishReason: null };
  assert.equal((await db.query<{ ok: boolean }>("select chat_write_reply_result($1,$2,$3,$4,'','interrupted',$5) as ok", [otherTrip, conversation, turn.responseId, generation, report])).rows[0].ok, false);
  assert.equal((await db.query<{ ok: boolean }>("select chat_write_reply_result($1,$2,$3,$4,'','interrupted',$5) as ok", [reference, conversation, turn.responseId, generation, report])).rows[0].ok, true);
  assert.equal((await db.query<{ ok: boolean }>("select chat_write_reply_result($1,$2,$3,$4,'late','failed',$5) as ok", [reference, conversation, turn.responseId, generation, report])).rows[0].ok, false);
});


test("readable research survives later planning steps and fixes actionable price-gap errors", async () => {
  process.env.AGENT_WEB_SEARCH = "true";
  let plannerCalls = 0;
  let researchCalls = 0;
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.stream !== true) { researchCalls++; return researchResponse(); }
    plannerCalls++;
    if (plannerCalls === 1) return functionStream("createPlan", { plan: planHeader });
    if (plannerCalls === 2) return functionStream("editPlan", { operations: [visitCommand] });
    if (plannerCalls === 3) return functionStream("createBudget", { budget: budgetSettings });
    if (plannerCalls === 4) return functionStream("editBudget", { operations: [unpricedStay] });
    if (plannerCalls === 5) return functionStream("resolveBudgetGaps", { gaps: [{ entryId: "stay", reason: "not_found", explanation: "No comparable room prices found yet." }] });
    if (plannerCalls === 6) {
      assert.match(JSON.stringify(body), /Make a targeted web-search follow-up/);
      assert.doesNotMatch(JSON.stringify(body), /The action could not finish/);
      return functionStream("researchWeb", { query: "Find comparable Rome hotel rates, with amounts, units and source URLs." });
    }
    if (plannerCalls === 7) {
      assert.match(JSON.stringify(body), /EUR 80 per person-night/);
      return functionStream("editBudget", { operations: [{ type: "updateCost", id: "stay", changes: { pricing: "estimated", min: 40, max: 60, sources: [{ sourceId: sourceHandle(body), detail: "Synthetic comparable range." }] } }, { type: "review" }] });
    }
    if (plannerCalls === 8) {
      assert.match(JSON.stringify(body), /Budget checks passed/);
      return functionStream("commit", { summary: "Plan and evidence-backed estimate saved", handledInputIds: [] });
    }
    assert.equal(body.tool_choice, "none");
    return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "research-user", text: "Plan Rome" } }),
  }), reference);
  const stream = await response.text();
  assert.doesNotMatch(stream, /errorText/);
  assert.equal(plannerCalls, 9);
  assert.equal(researchCalls, 1);
  assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "complete");
  assert.equal((await db.query("select * from budgets")).rows.length, 1);
});


test("only the final step's answer is published when exhausted recovery also answers prematurely", async () => {
  let call = 0;
  provider = async () => {
    call++;
    if (call === MAX_AGENT_STEPS) return providerStream();
    const response = call === 1 ? functionStream("createPlan", { plan: planHeader })
      : functionStream("readGuide", { id: "budget-research" });
    if (call !== MAX_AGENT_STEPS - 1) return response;
    const frames = (await response.text()).split("\n\n").filter(line => line.startsWith("data: {"));
    const narrative = [
      { type: "response.output_item.added", output_index: 1, item: { type: "message", id: "msg_early" } },
      { type: "response.output_text.delta", item_id: "msg_early", output_index: 1, delta: "Premature explanation must not be appended." },
      { type: "response.output_item.done", output_index: 1, item: { type: "message", id: "msg_early" } },
    ].map(event => `data: ${JSON.stringify(event)}`);
    frames.splice(1, 0, ...narrative);
    return new Response(frames.join("\n\n") + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "last-step-user", text: "Plan Rome" } }),
  }), reference);
  const stream = await response.text();
  assert.equal(call, MAX_AGENT_STEPS);
  assert.doesNotMatch(stream, /Premature explanation|errorText/);
  const last = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(last.parts.find(part => part.type === "data-failure")?.data.code, "step_limit");
  assert.equal(last.parts.filter(part => part.type === "text").map(part => part.text).join(""), "What pace do you prefer?");
});

test("SDK uses scoped reads, targeted edits and exact document edits before one final save", async () => {
  let call = 0, documentId = "";
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const outputs = (body.input as { type?: string; output?: string }[]).filter(item => item.type === "function_call_output").flatMap(item => { try { return [JSON.parse(item.output!)]; } catch { return []; } });
    documentId = outputs.find(result => result.data?.id && result.data?.proposedContentRevision === 1)?.data.id ?? documentId;
    call++;
    const draft = offlineDraftCalls()[call - 1];
    if (draft) return functionStream(...draft);
    if (call === 7) return functionStream("readPlan", { view: "effective", selector: "days", ids: ["day-2"] });
    if (call === 8) return functionStream("editPlan", { operations: [{ type: "updateDay", id: "day-2", changes: { title: "A slower second day" } }] });
    if (call === 9) return functionStream("editBudget", { operations: [{ type: "updateSettings", limit: 500 }, { type: "review" }] });
    if (call === 10) return functionStream("createDocument", { name: "Packing.txt", kind: "working", content: "Clothes\nLight jacket\nDocuments\nPassport\n" });
    if (call === 11) { assert.ok(documentId); return functionStream("editDocument", { id: documentId, operations: [{ type: "replaceText", oldText: "Light jacket", newText: "Rain jacket" }] }); }
    if (call === 12) return functionStream("readDocument", { id: documentId, view: "effective", contentRevision: null });
    if (call === 13) { assert.match(JSON.stringify(outputs), /Rain jacket/); return functionStream("inspectChanges", {}); }
    if (call === 14) return functionStream("resolveBudgetGaps", { gaps: [{ entryId: "stay", reason: "search_unavailable", explanation: "The updated estimate still has no research source in this isolated test." }] });
    if (call === 15) return functionStream("editBudget", reviewBudget);
    if (call === 16) return functionStream("commit", { summary: "Saved itinerary, budget and packing list", handledInputIds: [] });
    assert.equal(body.tool_choice, "none"); return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "scoped-sdk", text: "Plan Rome, keep day two slower, and save a packing list." } }),
  }), reference);
  const stream = await response.text(); assert.doesNotMatch(stream, /errorText/); assert.equal(call, 17);
  assert.equal((await getPlan(reference)).plan!.days[1].title, "A slower second day");
  assert.equal((await readTextDocument(reference, documentId)).markdown, "Clothes\nRain jacket\nDocuments\nPassport\n");
  assert.equal((await db.query("select * from planning_commits")).rows.length, 1);
});

test("restaurant research flows through the real SDK tool registry into saved meal evidence", async () => {
  process.env.AGENT_WEB_SEARCH = "true";
  let calls = 0, researchCalls = 0;
  let sourceId = "", checkedAt = "";
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.stream !== true) {
      researchCalls++;
      return researchResponse("Fictional Cafe A, 1 Fictional Street, Rome. Fixture lunch menu EUR 20 to 30; service dates unverified. Comparable room EUR 80 per person-night. This is synthetic evidence.");
    }
    calls++;
    if (calls === 1) return functionStream("researchWeb", { query: "Find a nearby lunch venue with name, address, meal service and menu prices, plus representative room costs." });
    if (calls === 2) {
      const reports = body.input.filter((item: { type: string }) => item.type === "function_call_output").map((item: { output: string }) => JSON.parse(item.output));
      const report = reports.find((result: { data?: { checkedAt?: string } }) => result.data?.checkedAt)?.data;
      assert.ok(report?.checkedAt); assert.match(report.summary, /1 Fictional Street/);
      sourceId = report.sources[0].sourceId; checkedAt = report.checkedAt;
      return functionStream("createPlan", { plan: planHeader });
    }
    if (calls === 3) return functionStream("editPlan", { operations: [visitCommand, { type: "addActivity", id: "meal-a", dayId: "day-1", kind: "meal", title: "Lunch at Fictional Cafe A", startTime: "12:00", durationMinutes: 60,
      venue: { name: "Fictional Cafe A", address: "1 Fictional Street", city: "Rome", sourceId } }] });
    if (calls === 4) return functionStream("createBudget", { budget: budgetSettings });
    if (calls === 5) return functionStream("editBudget", { operations: [{ ...unpricedStay, pricing: "estimated", min: 40, max: 60, sources: [{ sourceId, detail: "Synthetic lodging rate." }] }, { type: "review" }] });
    if (calls === 6) return functionStream("commit", { summary: "Saved itinerary with a specific lunch venue", handledInputIds: [] });
    assert.equal(body.tool_choice, "none"); return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "real-meal-user", text: "Plan Rome with real places to eat." } }),
  }), reference);
  const stream = await response.text();
  assert.doesNotMatch(stream, /errorText/); assert.equal(calls, 7); assert.equal(researchCalls, 1);
  const meal = (await getPlan(reference)).plan!.items["meal-a"];
  assert.equal(meal.kind, "meal");
  assert.ok("location" in meal && meal.location?.type === "restaurant");
  if ("location" in meal && meal.location?.type === "restaurant") {
    assert.equal(meal.location.label, "Fictional Cafe A");
    assert.equal(meal.location.address, "1 Fictional Street");
    assert.deepEqual(meal.location.basis.sources, [{ type: "web", url: "https://example.com/test-rate", accessedAt: checkedAt }]);
  }
  assert.equal((await loadConversation(reference, conversation)).messages.at(-1)?.metadata?.status, "complete");
  assert.equal((await db.query("select * from planning_commits")).rows.length, 1);
});

test("Public missing-day schema rejection is discharged by a valid correction before final publication", async () => {
  let calls = 0;
  provider = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls++;
    if (calls === 1) return functionStream("createPlan", { plan: { startDate: null, days: [{ id: "day-1", title: "Art" }, { id: "day-2", title: "Food" }, { id: "day-3", title: "Rest" }] } });
    if (calls === 2) return functionStream("editPlan", { operations: [{ type: "addActivity", id: "visit", title: "Visit Colosseum", placeId: "place_001", startTime: "09:00" }] });
    if (calls === 3) {
      assert.match(JSON.stringify(body), /operations.0.dayId/);
      return functionStream("editPlan", { operations: [{ type: "addActivity", id: "visit", dayId: "day-1", title: "Visit Colosseum", placeId: "place_001", startTime: "09:00" }] });
    }
    if (calls === 4) return functionStream("createBudget", { budget: { currency: "EUR", scope: "per_person", travelers: 2, limit: 600, assumptions: "Isolated offline regression", exclusions: [] } });
    if (calls === 5) return functionStream("editBudget", { operations: [{ type: "addCost", id: "ticket", label: "Ticket", category: "activities", planItemIds: ["visit"], unit: "admission", quantity: 1, min: null, max: null, priceScope: "per_person", pricing: "unknown", assumptions: "Offline fixture has no evidence", sources: [] }, { type: "review" }] });
    if (calls === 6) return functionStream("resolveBudgetGaps", { gaps: [{ entryId: "ticket", reason: "search_unavailable", explanation: "Online research is disabled for this isolated protocol regression and no price evidence was provided." }] });
    if (calls === 7) return functionStream("editBudget", { operations: [{ type: "review" }] });
    if (calls === 8) return functionStream("commit", { summary: "Corrected the missing day and saved the fixture", handledInputIds: [] });
    assert.equal(body.tool_choice, "none"); return providerStream();
  };
  const response = await handleChat(new Request(`http://localhost/api/trips/${reference}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "missing-day-user", text: "Create a minimal isolated protocol fixture with one visit." } }),
  }), reference);
  await response.text();
  const final = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(final.metadata?.status, "complete");
  assert.equal(final.parts.some(part => part.type === "data-failure"), false);
  assert.equal((await getPlan(reference)).plan!.days[0].itemIds.includes("visit"), true);
  assert.equal((await db.query("select * from planning_commits")).rows.length, 1);
  assert.equal(calls, 9);
});
