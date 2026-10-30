import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, afterEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, seed, databaseFetch, reference, otherTrip, conversation, generation } from "./chat-fixture";
import { examplePlan, unknownBudget } from "./plan-fixture";
import { budgetSchema, budgetTotals, inspectBudget } from "../lib/budget";
import { getBudget, saveBudget, handleBudget } from "../services/budgets";
import { savePlan, getPlan } from "../services/plans";
import { openSession } from "../services/workspace";
import { beginTurn } from "../services/assistant/conversation-store";
import { guideCatalog, readGuide, guidePrompt } from "../services/assistant/agent/guides";
let db: PGlite;
const oldFetch = globalThis.fetch;
const env = { AGENT_WEB_SEARCH: process.env.AGENT_WEB_SEARCH, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
before(async () => { db = await createDatabase(); });
after(() => db.close());
beforeEach(async () => {
  await seed(db);
  Object.assign(process.env, { AGENT_WEB_SEARCH: "false", SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_fixture" });
  globalThis.fetch = (url, init) => databaseFetch(db, new URL(String(url)), init);
});
afterEach(() => {
  globalThis.fetch = oldFetch;
  for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
const offlineGap = { entryId: "stay", reason: "search_unavailable" as const, explanation: "Online research is disabled in this isolated test environment." };
function pricedBudget() {
  const b = unknownBudget();
  Object.assign(b.entries[0], { pricing: "estimated", unitMin: 40.1, unitMax: 60.2, assumptions: "Indicative shared-room rate, dates unknown.", sources: [{ title: "Example official rates", url: "https://hotel.example/rates", documentId: null, documentRevision: null, checkedAt: "2026-10-27T00:00:00.000Z", detail: "EUR 80.20 to 120.40 per room, divided between two adults." }] });
  return b;
}
async function agent() {
  const turn = await beginTurn(reference, { conversationId: conversation, expectedLastId: null, retry: false, message: { id: "budget-user", text: "Plan Rome" } }, generation);
  return openSession(reference, conversation, turn.responseId, generation, new AbortController().signal);
}

// Internal session setup; public protocol coverage lives in planning-integration.
async function review(a: Awaited<ReturnType<typeof agent>>) {
  const api = a.artifacts!;
  await api.editBudget((api.manifest() as { editToken: string }).editToken, [{ type: "recordReview" }]);
}

test("budget validation distinguishes unknown, estimates, exact prices and source applicability", () => {
  const b = pricedBudget();
  assert.equal(budgetSchema.safeParse(b).success, true);
  assert.deepEqual(budgetTotals(b), { min: 80.2, max: 120.4, confirmed: 0, priced: 1, unknown: 0 });
  b.entries.push(unknownBudget().entries[0]);
  assert.equal(budgetSchema.safeParse(b).success, false, "duplicate stable IDs");
  b.entries.pop(); b.entries[0].pricing = "confirmed";
  assert.equal(budgetSchema.safeParse(b).success, false, "confirmed price cannot be a range");
  b.entries[0].unitMax = 40.1;
  assert.equal(budgetTotals(b).confirmed, 80.2);
  b.entries[0].sources = [];
  assert.equal(budgetSchema.safeParse(b).success, false, "prices require evidence");
  const missing = unknownBudget();
  assert.equal(budgetTotals(missing).priced, 0);
  missing.entries[0].unitMin = 0;
  assert.equal(budgetSchema.safeParse(missing).success, false, "unknown is not free");
  const link = pricedBudget(); link.entries[0].planItemIds = ["nonexistent"];
  assert.throws(() => inspectBudget(link, examplePlan()), /A linked activity/);
  const scope = pricedBudget(); scope.scope = "party";
  assert.equal(budgetSchema.safeParse(scope).success, false, "party size required");
  const future = pricedBudget(); future.entries[0].sources[0].checkedAt = "2099-01-01T00:00:00.000Z";
  assert.throws(() => inspectBudget(future, null), /future/);
});

test("budget works without AI or a Plan, with CAS and idempotent retries", async () => {
  const b = pricedBudget(), requestId = randomUUID();
  const first = await saveBudget(reference, 0, b, requestId, true);
  assert.equal(first.snapshot.revision, 1);
  assert.equal(first.snapshot.plan, null);
  assert.equal(first.snapshot.needsReview, false);
  await assert.rejects(saveBudget(reference, 0, b, randomUUID(), true), /changed/);
  const updated = structuredClone(b); updated.limit = 500;
  await saveBudget(reference, 1, updated, randomUUID(), true);
  const retry = await saveBudget(reference, 0, b, requestId, true);
  assert.equal(retry.savedRevision, 1);
  assert.equal(retry.snapshot.budget?.limit, 500);
  await assert.rejects(saveBudget(reference, 0, updated, requestId, true), /changed/);
  assert.equal((await getBudget(otherTrip)).budget, null);
});

test("plan changes mark budget for review, partial edits cannot clear that flag", async () => {
  const p = examplePlan(); await savePlan(reference, 0, p, randomUUID());
  const b = pricedBudget(); b.entries[0].planItemIds = ["visit-1"];
  await saveBudget(reference, 1, b, randomUUID(), true);
  p.days[0].title = "A different day";
  await savePlan(reference, 2, p, randomUUID());
  assert.equal((await getBudget(reference)).needsReview, true);
  await saveBudget(reference, 3, b, randomUUID(), false);
  assert.equal((await getBudget(reference)).needsReview, true);
  await saveBudget(reference, 4, b, randomUUID(), true);
  assert.equal((await getBudget(reference)).needsReview, false);
});

test("first generation requires a budget and commits it atomically with the plan", async () => {
  const a = await agent();
  assert.equal(a.initialGeneration, true);
  await a.propose(examplePlan(), []);
  await assert.rejects(a.commit("Save", ["budget-user"]), /first itinerary needs a budget/);
  await a.proposeBudget!(unknownBudget(), true);
  await a.resolveBudgetGaps!([offlineGap]);
  await a.commit("Plan and costs saved", ["budget-user"]);
  assert.equal((await getBudget(reference)).needsReview, false);
  assert.ok((await getPlan(reference)).plan);
  assert.ok((await getBudget(reference)).budget);
});

test("agent rejects invented URL provenance and accepts actual search results", async () => {
  const a = await agent(), b = pricedBudget();
  await assert.rejects(a.proposeBudget!(b, true), /Research this source/);
  a.recordWebSources!([b.entries[0].sources[0].url!]);
  await a.proposeBudget!(b, true);
  await a.propose(examplePlan(), []);
  await review(a);
  await a.commit("Saved", ["budget-user"]);
  assert.ok((await getBudget(reference)).budget);
});

test("unknown costs cannot publish until handled, including after Plan changes or reload", async () => {
  const a = await agent();
  await a.propose(examplePlan(), []);
  await a.proposeBudget!(unknownBudget(), true);
  const blocked = await a.commit("Premature save", ["budget-user"]) as { saved: boolean; budgetCheck: { pending: string[] } };
  assert.equal(blocked.saved, false);
  assert.deepEqual(blocked.budgetCheck.pending, ["stay"]);
  assert.equal((await getPlan(reference)).plan, null);
  assert.equal((await getBudget(reference)).budget, null);
  await a.resolveBudgetGaps!([offlineGap]);
  const p = examplePlan(); p.days[0].title = "Different arrangement";
  await a.propose(p, []);
  await review(a);
  assert.equal((await a.commit("Still premature", ["budget-user"]) as { saved: boolean }).saved, false);
  await a.reload();
  await a.propose(examplePlan(), []);
  await a.proposeBudget!(unknownBudget(), true);
  assert.equal((await a.commit("After reload", ["budget-user"]) as { saved: boolean }).saved, false);
});

test("limit-only agent edits preserve existing unknown costs without claiming fresh research", async () => {
  const b = unknownBudget();
  await saveBudget(reference, 0, b, randomUUID(), false);
  const a = await agent();
  b.limit = 600;
  const result = await a.proposeBudget!(b, false) as { budgetCheck: { readyToCommit: boolean } };
  assert.equal(result.budgetCheck.readyToCommit, true);
  await a.commit("Updated limit", ["budget-user"]);
  assert.equal((await getBudget(reference)).budget?.limit, 600);
  assert.equal((await getBudget(reference)).budget?.entries[0].unitMin, null);
});

test("invalid document evidence rolls back both budget and Plan", async () => {
  const a = await agent(), b = pricedBudget();
  b.entries[0].sources[0].url = null;
  b.entries[0].sources[0].documentId = randomUUID();
  await a.propose(examplePlan(), []);
  await a.proposeBudget!(b, true);
  await assert.rejects(a.commit("Save", ["budget-user"]), /source/);
  assert.equal((await getPlan(reference)).plan, null);
  assert.equal((await getBudget(reference)).budget, null);
});

test("reload discards budget proposals and concurrent edits cannot be overwritten", async () => {
  const a = await agent();
  await a.proposeBudget!(unknownBudget(), true);
  await a.resolveBudgetGaps!([offlineGap]);
  await saveBudget(reference, 0, pricedBudget(), randomUUID(), true);
  await assert.rejects(a.commit("Save", ["budget-user"]), /changed/);
  await a.reload();
  await assert.rejects(a.commit("Save", ["budget-user"]), /Stage a valid|requested change|valid proposal/);
  assert.equal((await getBudget(reference)).budget?.entries[0].pricing, "estimated");
});

test("budget references are revalidated if a later plan proposal removes their target", async () => {
  await savePlan(reference, 0, examplePlan(), randomUUID());
  const a = await agent(), b = unknownBudget(); b.entries[0].planItemIds = ["visit-1"];
  assert.equal(a.initialGeneration, false);
  await a.proposeBudget!(b, true);
  const p = examplePlan(); p.days[0].itemIds = []; p.items = {};
  await a.propose(p, []);
  await review(a);
  await assert.rejects(a.commit("Save", ["budget-user"]), { code: "BUDGET_LINK" });
});

test("guides are allowlisted and initial instructions are loaded only when needed", () => {
  assert.throws(() => readGuide("../../.env"), /Unknown guide/);
  for (const guide of guideCatalog) assert.ok(readGuide(guide.id).content.length > 100);
  assert.match(guidePrompt(true), /Required first-generation guide/);
  assert.match(guidePrompt(true), /Produce both an itinerary and a budget/);
  for (const id of ["trip-details", "plan-quality", "first-plan"]) assert.ok(guidePrompt(true).includes(readGuide(id).content));
  for (const id of ["plan-editing", "budget-research", "budget-editing", "routes-and-stays", "planning-documents"]) assert.ok(!guidePrompt(true).includes(readGuide(id).content));
  for (const [phase, ids] of [["assemble", ["plan-editing", "routes-and-stays", "plan-quality"]], ["price", ["budget-research", "budget-editing"]], ["review", ["plan-quality", "plan-editing", "budget-editing"]]] as const) {
    const prompt = guidePrompt(true, phase);
    for (const id of ids) assert.ok(prompt.includes(readGuide(id).content));
    assert.ok(prompt.includes(readGuide("first-plan").content), "Completion requirement persists across phases");
    assert.ok(Buffer.byteLength(prompt) < 0.85 * ["trip-details", "plan-quality", "first-plan", "plan-editing", "budget-research", "budget-editing"].reduce((n, id) => n + Buffer.byteLength(readGuide(id).content), 0), "Phase guidance does not repeat the entire initial pack");
  }
  assert.doesNotMatch(guidePrompt(false), /Produce both an itinerary and a budget/);
  assert.match(guidePrompt(false), /budget-editing/);
  const quality = readGuide("plan-quality").content;
  assert.ok(guidePrompt(true).includes(quality), "First planning always receives the full quality standard");
  assert.ok(!guidePrompt(false).includes(quality), "Later turns discover quality guidance on demand");
  assert.ok(guideCatalog.some(guide => guide.id === "plan-quality"));
  assert.ok(guideCatalog.some(guide => guide.id === "planning-documents"));
  assert.match(readGuide("planning-documents").content, /Research notes.md/);
  assert.match(readGuide("planning-documents").content, /Planning decisions.md/);
});

test("budget endpoint rejects cross-site writes and anonymous SQL access", async () => {
  const response = await handleBudget(new Request(`https://app.example/api/trips/${reference}/budget`, { method: "PUT", headers: { origin: "https://evil.example" } }), reference);
  assert.equal(response.status, 403);
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query("select * from public.budgets"), /permission denied/);
    await assert.rejects(db.query(`select public.budget_get('${reference}')`), /permission denied/);
  } finally { await db.exec("reset role"); }
});

test("reused evidence survives database key ordering and cannot claim a new check date", async () => {
  const b = pricedBudget();
  await savePlan(reference, 0, examplePlan(), randomUUID());
  await saveBudget(reference, 1, b, randomUUID(), true);
  const a = await agent();
  await a.proposeBudget!(b, true);
  b.entries[0].sources[0].checkedAt = "2026-10-26T00:00:00.000Z";
  await assert.rejects(a.proposeBudget!(b, true), /Research this source/);
  await assert.rejects(a.commit("Save", ["budget-user"]), /Stage a valid|requested change|valid proposal/);
});

test("plan changes after budget review cannot falsely keep it reviewed", async () => {
  await savePlan(reference, 0, examplePlan(), randomUUID());
  const a = await agent();
  await a.proposeBudget!(unknownBudget(), true);
  const p = examplePlan(); p.days[0].title = "Changed after review";
  await a.propose(p, []);
  await a.resolveBudgetGaps!([offlineGap]);
  await assert.rejects(a.commit("Cannot claim reviewed after a Plan change", ["budget-user"]), { code: "BUDGET_REVIEW_REQUIRED" });
  assert.equal((await getPlan(reference)).plan!.days[0].title, examplePlan().days[0].title);
  assert.equal((await getBudget(reference)).budget, null);
  await review(a);
  await a.commit("Reviewed against the updated Plan", ["budget-user"]);
  assert.equal((await getBudget(reference)).needsReview, false);
  assert.equal((await getPlan(reference)).plan!.days[0].title, "Changed after review");
});

test("Budget HTTP validation returns concise actionable errors", async () => {
  const b = pricedBudget(); b.entries[0].sources = [];
  const response = await handleBudget(new Request(`https://app.example/api/trips/${reference}/budget`, {
    method: "PUT", headers: { origin: "https://app.example", "Content-Type": "application/json" },
    body: JSON.stringify({ budget: b, revision: 0, reviewed: true, requestId: randomUUID() }),
  }), reference);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "Every priced item needs a source.");
  assert.equal((await getBudget(reference)).budget, null);
});

test("an existing document from another project cannot substantiate a budget price", async () => {
  const documentId = randomUUID();
  await db.query("select public.attachment_reserve($1,$2,'Receipt.png','image/png',100,'library')", [otherTrip, documentId]);
  await db.query("select public.document_mutate($1,$2,'finalize')", [otherTrip, documentId]);
  const b = pricedBudget(); b.entries[0].sources[0].url = null; b.entries[0].sources[0].documentId = documentId;
  await assert.rejects(saveBudget(reference, 0, b, randomUUID(), true), /source/);
  assert.equal((await getBudget(reference)).budget, null);
});
