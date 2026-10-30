import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, seed, databaseFetch, reference, conversation, generation } from "./chat-fixture";
import { examplePlan, fixturePricedBudget } from "./plan-fixture";
import { initializePlan } from "../lib/plan";
import { initializeBudget } from "../lib/budget";
import { journeyContext } from "../services/workspace/views";
import { openSession } from "../services/workspace";
import { beginTurn, saveReply } from "../services/assistant/conversation-store";
import { getPlan, savePlan } from "../services/plans";
import { agentTools } from "../services/assistant/agent/tools";
import { authorPlan, authorBudget } from "../services/assistant/agent/authoring";
import type { ArtifactEnvironment } from "../services/assistant/agent/contracts";
let db: PGlite, files: Map<string, string>;
const oldFetch = globalThis.fetch;
const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "AGENT_WEB_SEARCH"];
const oldEnv = keys.map(key => process.env[key]);
before(async () => { db = await createDatabase(); });
after(() => db.close());
beforeEach(async () => {
  await seed(db); files = new Map();
  Object.assign(process.env, { SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_fixture", AGENT_WEB_SEARCH: "false" });
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(target.hostname, "db.example", "No live model calls in deterministic tests.");
    const root = "/storage/v1/object/";
    if (target.pathname.startsWith(root + "authenticated/")) return new Response(files.get(target.pathname.slice((root + "authenticated/").length)) ?? null, { status: files.has(target.pathname.slice((root + "authenticated/").length)) ? 200 : 404 });
    if (target.pathname.startsWith(root) && init?.method === "POST") { files.set(target.pathname.slice(root.length), String(init.body)); return Response.json({}); }
    return databaseFetch(db, target, init);
  };
});
afterEach(() => { globalThis.fetch = oldFetch; keys.forEach((key, i) => { if (oldEnv[i] === undefined) delete process.env[key]; else process.env[key] = oldEnv[i]; }); });
async function session() {
  const turn = await beginTurn(reference, { conversationId: conversation, expectedLastId: null, retry: false, message: { id: "workspace-user", text: "Plan three days in Rome" } }, generation);
  const environment = await openSession(reference, conversation, turn.responseId, generation, new AbortController().signal);
  return { environment, api: environment.artifacts!, turn };
}
const token = (api: ArtifactEnvironment) => (api.manifest() as { editToken: string }).editToken;
const plan = (api: ArtifactEnvironment) => (api.readPlan({ view: "effective", selector: "full", ids: [] }) as { plan: ReturnType<typeof examplePlan> }).plan;
test("commit diagnostics distinguish input scope from absent changes", async () => {
  const { environment } = await session();
  await assert.rejects(environment.commit("Missing request", []), { code: "INPUT_NOT_HANDLED" });
  await assert.rejects(environment.commit("Unrelated request", ["workspace-user", "not-pending"]), { code: "INPUT_NOT_PENDING" });
  await assert.rejects(environment.commit("No changes", ["workspace-user"]), { code: "NOTHING_TO_SAVE" });
  assert.equal((await db.query("select * from public.planning_commits")).rows.length, 0);
});
test("initial scaffolds cannot publish as a finished first itinerary", async () => {
  const { api, environment } = await session();
  const p = examplePlan();
  await api.createPlan(token(api), initializePlan({ startDate: null, days: p.days.map(({ id, title }) => ({ id, title })) as Parameters<typeof initializePlan>[0]["days"] }), []);
  await api.createBudget(token(api), initializeBudget({ currency: "EUR", scope: "per_person", travelers: 2, limit: 600, assumptions: "Shared room.", exclusions: [] }), false);
  const inspected = await api.inspectChanges() as { blockers: { code?: string; nextAction?: string }[] };
  assert.ok(inspected.blockers.some(blocker => blocker.code === "BUDGET_EMPTY" && blocker.nextAction === "editBudget"));
  assert.ok(inspected.blockers.some(blocker => blocker.code === "PLAN_EMPTY"));
  await assert.rejects(api.commit(token(api), "Unfinished", ["workspace-user"]), /empty days/);
  environment.recordWebSources!(["https://example.com/test-rate"]);
  await api.editBudget(token(api), [{ type: "addEntry", entry: fixturePricedBudget().entries[0] }, { type: "recordReview" }]);
  await assert.rejects(api.commit(token(api), "Still unfinished", ["workspace-user"]), /empty days/);
  assert.equal((await getPlan(reference)).plan, null);
  assert.equal((await db.query("select * from public.planning_commits")).rows.length, 0);
  await api.editPlan(token(api), [{ type: "addItem", item: p.items["visit-1"], dayId: "day-1", index: null }], []);
  await api.editBudget(token(api), [{ type: "recordReview" }]);
  assert.equal((await api.commit(token(api), "Completed arrangements", ["workspace-user"]) as { saved: boolean }).saved, true);
});
async function initial(api: ArtifactEnvironment, environment: Awaited<ReturnType<typeof session>>["environment"]) {
  await api.createPlan(token(api), examplePlan(), []);
  environment.recordWebSources!(["https://example.com/test-rate"]);
  await api.createBudget(token(api), fixturePricedBudget(), true);
}
test("a repeated known deletion does not strand a repaired batch or leave an impossible save obligation", async () => {
  const { api, environment } = await session(); await initial(api, environment);
  const extra = { ...structuredClone(examplePlan().items["visit-1"]), id: "castel" };
  await api.editPlan(token(api), [{ type: "addItem", item: extra, dayId: "day-2", index: null }], []);
  await api.editBudget(token(api), [{ type: "addEntry", entry: { ...fixturePricedBudget().entries[0], id: "castel-cost", planItemIds: ["castel"] } }]);
  await api.editPlan(token(api), (await authorPlan(plan(api), [{ type: "removeItem", id: "castel" }], environment)).operations, []);
  const repaired = await authorPlan(plan(api), [
    { type: "updateActivity", id: "visit-1", changes: { reason: "Preserve the morning and free the afternoon." } },
    { type: "removeItem", id: "castel" },
  ], environment);
  await api.editPlan(token(api), repaired.operations, []);
  const budget = () => (api.readBudget({ view: "effective", selector: "full", ids: [] }) as { budget: ReturnType<typeof fixturePricedBudget> }).budget;
  await api.editBudget(token(api), authorBudget(budget(), [{ type: "removeCost", id: "castel-cost" }], environment));
  await api.editBudget(token(api), authorBudget(budget(), [{ type: "removeCost", id: "castel-cost" }], environment));
  const unchanged = await authorPlan(plan(api), [{ type: "removeItem", id: "castel" }], environment);
  assert.deepEqual(unchanged.operations, []);
  await api.editPlan(token(api), unchanged.operations, []);
  await assert.rejects(authorPlan(plan(api), [{ type: "removeItem", id: "never-existed" }], environment), /not found/);
  await api.editBudget(token(api), [{ type: "recordReview" }]);
  assert.equal((await api.commit(token(api), "Removed the afternoon stop once", ["workspace-user"]) as { saved: boolean }).saved, true);
  const saved = (await getPlan(reference)).plan!;
  assert.equal(saved.items.castel, undefined); assert.deepEqual(saved.days[1].itemIds, []);
});
test("Internal effective reads expose accepted drafts and local edits without changing saved state", async () => {
  const { api, environment } = await session(); const old = token(api);
  assert.equal((api.readPlan({ view: "effective", selector: "full", ids: [] }) as { exists: boolean }).exists, false);
  await initial(api, environment);
  assert.equal((api.readPlan({ view: "saved", selector: "full", ids: [] }) as { exists: boolean }).exists, false);
  const before = structuredClone(plan(api));
  await api.editPlan(token(api), [{ type: "updateDay", id: "day-2", fields: { title: "Relaxed day" } }], []);
  assert.deepEqual(plan(api).days[0], before.days[0]); assert.deepEqual(plan(api).items, before.items);
  await assert.rejects(api.editPlan(old, [{ type: "updateDay", id: "day-1", fields: { title: "Stale" } }], []), /draft changed/);
  await api.editPlan(token(api), [{ type: "updateDay", id: "day-1", fields: { title: "Reconciled" } }], []);
  const inspected = await api.inspectChanges() as { diff: { days: { id: string }[] }; saved: boolean };
  assert.equal(inspected.saved, false);
  await api.editBudget(token(api), [{ type: "recordReview" }]);
  const result = await api.commit(token(api), "Saved draft", ["workspace-user"]) as { saved: boolean };
  assert.equal(result.saved, true); assert.equal((await getPlan(reference)).plan!.days[1].title, "Relaxed day");
  assert.equal((await api.commit(old, "Retry", ["workspace-user"]) as { saved: boolean }).saved, true);
});
test("rejected edit retains accepted Plan but blocks an unrelated final save", async () => {
  const { api, environment } = await session(); await initial(api, environment);
  const before = structuredClone(plan(api));
  const bad = await api.editPlan(token(api), [{ type: "updateDay", id: "day-1", fields: { startLocation: { type: "item", itemId: "missing" } } }], []) as { valid: boolean };
  assert.equal(bad.valid, false); assert.deepEqual(plan(api), before);
  await api.editBudget(token(api), [{ type: "setLimit", value: 500 }, { type: "recordReview" }]);
  await assert.rejects(api.commit(token(api), "Cannot hide failed edit", ["workspace-user"]), /rejected changes/);
  await api.editPlan(token(api), [{ type: "updateDay", id: "day-1", fields: { title: "Corrected" } }], []);
  await api.editBudget(token(api), [{ type: "recordReview" }]);
  assert.equal((await api.commit(token(api), "Corrected", ["workspace-user"]) as { saved: boolean }).saved, true);
});
test("Document creation/read/edit preserves exact bytes and protects against ambiguous edits", async () => {
  const { api } = await session();
  const created = await api.createDocument(token(api), "Notes.txt", "working", "Food\r\nPasta\r\nStay\r\nCentral\r\n") as { id: string };
  assert.equal((await api.readDocument({ id: created.id, view: "saved", contentRevision: null }) as { exists: boolean }).exists, false);
  await assert.rejects(api.editDocument(token(api), created.id, [{ type: "rename", name: "Changed.txt" }, { type: "replaceText", oldText: "\r\n", newText: "x" }]), /exactly once/);
  assert.equal((await api.readDocument({ id: created.id, view: "effective", contentRevision: null }) as { name: string }).name, "Notes.txt");
  await api.createDocument(token(api), "Other.csv", "working", "a,b\n1,2");
  await assert.rejects(api.commit(token(api), "Unrelated edit", ["workspace-user"]), /rejected changes/);
  await api.editDocument(token(api), created.id, [{ type: "replaceText", oldText: "Pasta", newText: "Pizza" }]);
  await api.commit(token(api), "Saved notes", ["workspace-user"]);
  const saved = await api.readDocument({ id: created.id, view: "saved", contentRevision: 1 }) as { content: string; editToken?: string };
  assert.equal(saved.content, "Food\r\nPizza\r\nStay\r\nCentral\r\n"); assert.equal(saved.editToken, undefined);
});
test("current head reads detect conflicts without rebasing accepted edits", async () => {
  const { api } = await session();
  await api.createPlan(token(api), examplePlan(), []);
  await savePlan(reference, 0, examplePlan(), randomUUID());
  const old = token(api), result = await api.readEnvironment() as { conflictDetected: boolean; baseRevision: number };
  assert.equal(result.conflictDetected, true); assert.equal(result.baseRevision, 0); assert.equal(token(api), old);
  assert.equal((api.readPlan({ view: "saved", selector: "full", ids: [] }) as { exists: boolean }).exists, false);
});
test("real workspace registry exposes the current protocol only and malformed writes block completion", async () => {
  const { api, environment } = await session(); const tools = agentTools(environment);
  for (const name of ["createPlan", "editPlan", "createBudget", "editBudget", "createDocument", "editDocument", "readEnvironment", "inspectChanges"]) assert.ok(name in tools);
  for (const name of ["proposePlan", "proposeBudget", "stageDocument", "verifySave", "addDayActivities", "addStay", "addBudgetCosts"]) assert.equal(name in tools, false);
  assert.equal(Object.keys(tools).length, 21);
  const unused = async () => { throw new Error("Capability discovery must not make external requests."); };
  const enabled = agentTools({ ...environment, resolvePlace: unused, getJourneys: unused }, undefined, unused);
  assert.deepEqual(Object.keys(enabled).filter(name => !(name in tools)).sort(), ["getJourneys", "researchWeb", "resolvePlace"]);
  await initial(api, environment);
  api.rejectInput("editPlan", {});
  await assert.rejects(api.commit(token(api), "No", ["workspace-user"]), /rejected changes/);
  await api.editPlan(token(api), [{ type: "updateDay", id: "day-2", fields: { title: "Repaired" } }], []);
  await api.editBudget(token(api), [{ type: "recordReview" }]);
  await api.commit(token(api), "Recovered", ["workspace-user"]);
});
test("agent edits cannot introduce direct-edit provenance", async () => {
  const { api, environment } = await session(); await initial(api, environment);
  await assert.rejects(api.editPlan(token(api), [{ type: "setStartDate", value: { value: "2026-11-04", basis: { kind: "user", sources: [{ type: "direct_edit" }], explanation: null } } }], []), /Agent-authored facts/);
});

test("temporary cross-artifact link gaps are inspectable and must be repaired before publication", async () => {
  const { api, environment } = await session(); await initial(api, environment);
  await api.editBudget(token(api), [{ type: "updateEntry", id: "stay", fields: { planItemIds: ["missing"] } }]);
  const findings = api.readBudget({ view: "effective", selector: "full", ids: [] }) as { linkFindings: unknown[] };
  assert.equal(findings.linkFindings.length, 1);
  await assert.rejects(api.commit(token(api), "Cannot publish dangling links", ["workspace-user"]), /linked Budget/);
  await api.editBudget(token(api), [{ type: "updateEntry", id: "stay", fields: { planItemIds: ["visit-1"] } }, { type: "recordReview" }]);
  await api.commit(token(api), "Fixed links", ["workspace-user"]);
});
test("a later draft document edit invalidates dependent Plan evidence until revalidated", async () => {
  const { api, environment } = await session();
  const doc = await api.createDocument(token(api), "Research.md", "research", "Suggested visit: 60 to 90 minutes.") as { id: string };
  const p = examplePlan(), item = p.items["visit-1"];
  if (item.kind === "stay" || item.kind === "travel") throw new Error("Expected activity fixture");
  item.timing.duration!.basis = { kind: "research", explanation: null, sources: [{ type: "document", documentId: doc.id, revision: 1, section: null }] };
  await api.createPlan(token(api), p, []);
  environment.recordWebSources!(["https://example.com/test-rate"]);
  await api.createBudget(token(api), fixturePricedBudget(), true);
  await api.editDocument(token(api), doc.id, [{ type: "replaceText", oldText: "60 to 90", newText: "60 to 120" }]);
  await assert.rejects(api.commit(token(api), "Evidence changed", ["workspace-user"]), /rejected changes/);
  await api.editPlan(token(api), [{ type: "updateItem", id: "visit-1", fields: { timing: { ...item.timing, duration: { ...item.timing.duration!, maxMinutes: 120 } } } }], []);
  await api.editBudget(token(api), [{ type: "recordReview" }]);
  await api.commit(token(api), "Revalidated", ["workspace-user"]);
});
test("document paging invalidates its cursor on changes, and draft renames retain their format", async () => {
  const { api } = await session();
  const first = await api.createDocument(token(api), "A.txt", "working", "one") as { id: string };
  await api.createDocument(token(api), "B.csv", "working", "a,b\n1,2");
  const query = { view: "effective" as const, kind: null, format: null, query: null, cursor: null, limit: 1 };
  const page = api.listDocuments(query) as { nextCursor: string };
  assert.ok(page.nextCursor);
  await assert.rejects(api.editDocument(token(api), first.id, [{ type: "rename", name: "A.csv" }]), /extension|format|type|name/i);
  assert.equal((await api.readDocument({ id: first.id, view: "effective", contentRevision: null }) as { name: string }).name, "A.txt");
  await api.editDocument(token(api), first.id, [{ type: "rename", name: "C.txt" }]);
  assert.throws(() => api.listDocuments({ ...query, cursor: page.nextCursor }), /Restart/);
});
test("failed reload keeps the accepted draft; successful reload requires discarded documents to be restaged", async () => {
  const { api } = await session();
  await api.saveBrief(token(api), "# Preferences\nRelaxed pace", 0);
  const doc = await api.createDocument(token(api), "Notes.txt", "working", "Keep this draft") as { id: string };
  const fetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).includes("/authenticated/") ? new Response(null, { status: 503 }) : fetch(url, init);
  await assert.rejects(api.reload(token(api)));
  assert.equal((await api.readDocument({ id: doc.id, view: "effective", contentRevision: null }) as { content: string }).content, "Keep this draft");
  globalThis.fetch = fetch;
  await api.reload(token(api));
  assert.equal((await api.readDocument({ id: doc.id, view: "effective", contentRevision: null }) as { exists: boolean }).exists, false);
  assert.ok((api.manifest() as { brief: unknown }).brief);
  await api.createDocument(token(api), "Notes.txt", "working", "Restaged draft");
  const inspected = await api.inspectChanges() as { blockers: { artifact: string }[] };
  assert.equal(inspected.blockers.some(blocker => blocker.artifact.startsWith("documents")), false);
});

test("researched restaurants require observed sources and persist through scoped and direct edits", async () => {
  const { restaurantMeal, restaurantLocation, restaurantUrl } = await import("./restaurant-fixture");
  const { api, environment } = await session(); await initial(api, environment);
  const before = structuredClone(plan(api));
  const operations = [
    { type: "addItem" as const, item: restaurantMeal(), dayId: "day-1", index: null },
  ];
  const failed = await api.editPlan(token(api), operations, []) as { valid: boolean; findings: { code: string }[] };
  assert.equal(failed.valid, false);
  assert.ok(failed.findings.some(f => f.code === "restaurant_source"));
  assert.deepEqual(plan(api), before);
  await assert.rejects(api.commit(token(api), "Cannot skip source checks", ["workspace-user"]), /rejected changes/);
  environment.recordWebSources!([restaurantUrl]);
  const accepted = await api.editPlan(token(api), operations, []) as { valid: boolean };
  assert.equal(accepted.valid, true);
  await api.editBudget(token(api), [{ type: "recordReview" }]);
  assert.equal((await api.commit(token(api), "Saved real meal", ["workspace-user"]) as { saved: boolean }).saved, true);
  const saved = await getPlan(reference);
  assert.deepEqual((saved.plan!.items["meal-a"] as ReturnType<typeof restaurantMeal>).location, restaurantLocation());
  const direct = structuredClone(saved.plan!); direct.days[1].title = "Changed offline";
  const updated = await savePlan(reference, saved.revision, direct, randomUUID());
  assert.equal(updated.snapshot.plan!.days[1].title, "Changed offline");
  assert.deepEqual((updated.snapshot.plan!.items["meal-a"] as ReturnType<typeof restaurantMeal>).location, restaurantLocation());
  const injected = structuredClone(updated.snapshot.plan!);
  (injected.items["meal-a"] as ReturnType<typeof restaurantMeal>).location = { ...restaurantLocation(), address: "2 Other Street" };
  await assert.rejects(savePlan(reference, updated.snapshot.revision, injected, randomUUID()), /Look up this restaurant source/);
  assert.deepEqual((await getPlan(reference)).plan, updated.snapshot.plan);
});

test("generic meals are rejected by agent and direct saves without erasing an accepted draft", async () => {
  const { restaurantMeal } = await import("./restaurant-fixture");
  const { assumption } = await import("./plan-fixture");
  const { api, environment } = await session(); await initial(api, environment);
  const item = restaurantMeal(); item.title = "Breakfast near the base";
  item.location = { type: "area", label: "Near the base", basis: assumption };
  const rejected = await api.editPlan(token(api), [{ type: "addItem", item, dayId: null, index: null }], []) as { valid: boolean; findings: { code: string }[] };
  assert.equal(rejected.valid, false); assert.ok(rejected.findings.some(f => f.code === "meal_venue"));
  assert.equal(plan(api).items[item.id], undefined);
  await assert.rejects(api.commit(token(api), "Cannot skip meal correction", ["workspace-user"]), /rejected changes/);
  const direct = examplePlan(); direct.items[item.id] = item;
  await assert.rejects(savePlan(reference, 0, direct, randomUUID()), /Choose a specific restaurant/);
  assert.equal((await getPlan(reference)).plan, null);
});

test("a saved user-sourced note cannot block a scoped timetable edit after JSONB reload", async () => {
  const { assumption } = await import("./plan-fixture");
  const original = examplePlan();
  original.notes.push({ id: "user-note", kind: "uncertainty", text: "Confirm arrival time", relatedItemIds: [], sources: [{ type: "legacy_notes" }] });
  await savePlan(reference, 0, original, randomUUID());
  const { api } = await session();
  const visit = plan(api).items["visit-1"];
  if (visit.kind !== "visit") throw new Error("Expected visit fixture");
  const timing = { ...visit.timing, start: { date: null, time: "09:45", binding: "suggested" as const, basis: assumption } };
  const changed = await api.editPlan(token(api), [{ type: "updateItem", id: visit.id, fields: { timing } }], []) as { valid: boolean };
  assert.equal(changed.valid, true);
  const result = await api.commit(token(api), "Saved suggested timetable", ["workspace-user"]) as { saved: boolean };
  assert.equal(result.saved, true);
  const after = (await getPlan(reference)).plan!;
  assert.deepEqual(after.notes, original.notes);
  assert.equal((after.items[visit.id] as typeof visit).timing.start?.time, "09:45");
});


test("supporting evidence and decisions are independently discoverable and update existing files on later turns", async () => {
  const { api, environment, turn } = await session();
  const research = await api.createDocument(token(api), "Research notes.md", "research", "# Evidence\nService hours: unconfirmed.\nChecked 2026-10-28.\n\n# Other evidence\nKeep this finding.\n") as { id: string };
  const decisions = await api.createDocument(token(api), "Planning decisions.md", "working", "# Route\nUse a single base to reduce travel.\n") as { id: string };
  const manifest = api.manifest() as { documents: { id: string; name: string; kind: string }[] };
  assert.equal(manifest.documents.find(doc => doc.id === research.id)?.kind, "research");
  assert.equal(manifest.documents.find(doc => doc.id === decisions.id)?.kind, "working");
  assert.ok(JSON.stringify(environment.context).includes("Research notes.md"));
  await api.commit(token(api), "Saved useful supporting records", ["workspace-user"]);
  assert.equal((await getPlan(reference)).plan, null, "Document-only work does not create an itinerary");
  await saveReply(reference, conversation, turn.responseId, generation, "Saved supporting notes.", "complete");
  const nextGeneration = randomUUID();
  const nextTurn = await beginTurn(reference, { conversationId: conversation, expectedLastId: turn.responseId, retry: false, message: { id: "update-research", text: "Refresh the relevant service hours." } }, nextGeneration);
  const next = await openSession(reference, conversation, nextTurn.responseId, nextGeneration, new AbortController().signal);
  const followup = next.artifacts!;
  const savedResearch = await followup.readDocument({ id: research.id, view: "effective", contentRevision: null }) as { content: string };
  const savedDecision = await followup.readDocument({ id: decisions.id, view: "effective", contentRevision: null }) as { content: string };
  assert.match(savedResearch.content, /Service hours: unconfirmed/); assert.match(savedDecision.content, /single base/);
  await followup.editDocument(token(followup), research.id, [{ type: "replaceText", oldText: "Service hours: unconfirmed.\nChecked 2026-10-28.", newText: "Service hours: checked against the new fixture source.\nChecked 2026-10-29." }]);
  await followup.commit(token(followup), "Updated the relevant research", ["update-research"]);
  const documents = (followup.manifest() as { documents: { id: string }[] }).documents;
  assert.deepEqual(documents.map(doc => doc.id).sort(), [research.id, decisions.id].sort());
  const latest = await followup.readDocument({ id: research.id, view: "saved", contentRevision: null }) as { content: string };
  assert.match(latest.content, /2026-10-29/); assert.match(latest.content, /Keep this finding/);
  assert.equal((await followup.readDocument({ id: decisions.id, view: "saved", contentRevision: null }) as { content: string }).content, savedDecision.content);
  assert.match((await followup.readDocument({ id: research.id, view: "saved", contentRevision: 1 }) as { content: string }).content, /2026-10-28/);
});

test("Authoring retains repairable schedule conflicts as working items but blocks publication until corrected", async () => {
  const { api, environment } = await session();
  await initial(api, environment);
  const beforeToken = token(api);
  const compiled = await authorPlan(plan(api), [
    { type: "updateActivity", id: "visit-1", changes: { startTime: "09:00", durationMinutes: 60 } },
    { type: "addActivity", id: "second", title: "Second supplied stop", kind: "visit", dayId: "day-1", placeId: "place_005", startTime: "09:30", durationMinutes: 45 },
  ], environment);
  const result = await api.editPlan(beforeToken, compiled.operations, [], true) as { valid: boolean; staged: boolean };
  assert.equal(result.valid, false); assert.equal(result.staged, true);
  assert.ok(plan(api).items.second, "Accepted working items must be addressable for correction.");
  assert.notEqual(token(api), beforeToken);
  const inspected = await api.inspectChanges() as { blockers: { code?: string }[]; readiness: { ready: boolean } };
  assert.ok(inspected.blockers.some(issue => issue.code === "overlap"));
  assert.equal(inspected.readiness.ready, false);
  await assert.rejects(api.commit(token(api), "Still conflicting", ["workspace-user"]), { code: "PLAN_INVALID" });
  const fix = await authorPlan(plan(api), [{ type: "updateActivity", id: "second", changes: { startTime: "11:00" } }], environment);
  assert.equal((await api.editPlan(token(api), fix.operations, [], true) as { valid: boolean }).valid, true);
  await api.editBudget(token(api), [{ type: "recordReview" }]);
  assert.equal((await api.commit(token(api), "Conflict corrected", ["workspace-user"]) as { saved: boolean }).saved, true);
});

test("a new confirmed user price must cite the updated brief rather than an unchanged old version", async () => {
  const first = await session();
  await first.api.saveBrief(token(first.api), "## Existing arrangements\nNo hotel booking yet. Source: workspace-user.", 0);
  await initial(first.api, first.environment);
  await first.api.commit(token(first.api), "Initial trip", ["workspace-user"]);
  await saveReply(reference, conversation, first.turn.responseId, generation, "Initial trip saved.", "complete");
  const nextGeneration = randomUUID();
  const next = await beginTurn(reference, { conversationId: conversation, expectedLastId: first.turn.responseId, retry: false, message: { id: "price-confirmation", text: "The booked room costs EUR 240 total." } }, nextGeneration);
  const environment = await openSession(reference, conversation, next.responseId, nextGeneration, new AbortController().signal);
  const api = environment.artifacts!;
  const manifest = api.manifest() as { brief: { id: string; contentRevision: number } };
  const budget = structuredClone(fixturePricedBudget());
  budget.entries[0] = { ...budget.entries[0], pricing: "confirmed", unitMin: 240, unitMax: 240, sources: [{ url: null, documentId: manifest.brief.id, documentRevision: manifest.brief.contentRevision, checkedAt: new Date().toISOString(), title: "Travel brief.md", detail: "User confirmed EUR 240 total." }] };
  await assert.rejects(environment.proposeBudget!(budget, true), (error: unknown) => (error as { code: string }).code === "PRICE_FACT_SOURCE");
  await api.editDocument(token(api), manifest.brief.id, [{ type: "replaceContent", content: "## Existing arrangements\nUser confirmed hotel total EUR 240. Original source: workspace-user." }]);
  budget.entries[0].sources[0].documentRevision = manifest.brief.contentRevision + 1;
  await environment.proposeBudget!(budget, true);
});


test("routine journey context stays compact, preserves exact conflicts and never reports missing evidence as zero", () => {
  const legs = Array.from({ length: 20 }, (_, i) => ({ id: `leg-${i}`, dayId: "day-1", fromItemId: `from-${i}`, toItemId: `to-${i}`, fromLabel: "Previous venue", toLabel: "Following venue", mode: "walk" as const, status: "unverified" as const, distanceMeters: null, durationSeconds: null, reservedMinutes: null, availableMinutes: 30, evidenceId: null, checkedAt: null, reason: "A precise position is missing. Check the address or confirm the proposed base." }));
  const report = { fingerprint: "fixture", status: "unverified" as const, legs, findings: [], walkingMeters: 0, movingMinutes: 0 };
  const compact = journeyContext(report);
  assert.equal(compact.counts.unverified, 20); assert.equal(compact.uncertainties.length, 1); assert.equal(compact.uncertainties[0].legIds.length, 20);
  assert.equal(compact.knownMovingMinutes, null); assert.ok(JSON.stringify(compact).length < JSON.stringify(report).length / 3);
  const conflict = { ...legs[0], status: "conflict" as const, reservedMinutes: 45, availableMinutes: 10, reason: "Only ten minutes fit." };
  const changed = journeyContext({ ...report, status: "conflict", legs: [conflict, ...legs.slice(1)] });
  assert.equal(changed.status, "conflict"); assert.equal(changed.conflicts[0].reason, conflict.reason); assert.equal(changed.conflicts[0].availableMinutes, 10);
});
