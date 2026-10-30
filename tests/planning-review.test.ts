import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewPlanning, groupFindings } from "../lib/planning-review";
import { initializePlan, type ActivityItem } from "../lib/plan";
import { examplePlan, fixturePricedBudget } from "./plan-fixture";

test("empty initial artifacts have one shared classification and ordered next actions", () => {
  const p = examplePlan(), empty = initializePlan({ startDate: null, days: p.days.map(({ id, title }) => ({ id, title })) as Parameters<typeof initializePlan>[0]["days"] });
  const review = reviewPlanning(empty, null, true, "version-1");
  assert.equal(review.fingerprint, "version-1"); assert.deepEqual(review.blockers.map(issue => issue.code), ["PLAN_EMPTY", "BUDGET_EMPTY"]);
  assert.equal(review.readyToPublish, false);
});
test("sparse days are advisory and cannot deadlock an explicit free-time request", () => {
  const review = reviewPlanning(examplePlan(), fixturePricedBudget(), true, "v2");
  assert.equal(review.readyToPublish, true); assert.equal(review.qualityComplete, false);
  assert.ok(review.findings.some(issue => issue.code === "DAY_SPARSE"));
});
test("numeric entries do not conceal a missing meal cost or a dangling cost reference", () => {
  const plan = examplePlan(), budget = fixturePricedBudget();
  plan.items.meal = { ...plan.items["visit-1"], id: "meal", kind: "meal" } as ActivityItem;
  plan.days[0].itemIds.push("meal"); budget.entries[0].planItemIds = ["missing"];
  const review = reviewPlanning(plan, budget, false, "v3");
  assert.ok(review.blockers.some(issue => issue.code === "BUDGET_LINK"));
  assert.deepEqual(review.costs.unlinkedMealIds, ["meal"]);
  assert.equal(review.costs.priced, 1); assert.equal(review.qualityComplete, false);
});
test("meal service windows expose missing dinner without imposing a fixed activity count", () => {
  const plan = examplePlan();
  for (const [id, time] of [["breakfast", "08:30"], ["lunch", "13:00"]]) {
    const item = structuredClone(plan.items["visit-1"]) as ActivityItem;
    item.id = id; item.kind = "meal"; item.timing.start = { date: null, time, binding: "suggested", basis: item.timing.duration!.basis };
    plan.items[id] = item; plan.days[0].itemIds.push(id);
  }
  const review = reviewPlanning(plan, fixturePricedBudget(), false, "meal-windows");
  assert.match(review.findings.find(issue => issue.code === "MEAL_WINDOWS" && issue.artifact === "day:day-1")!.message, /no scheduled dinner/);
  assert.equal(review.readyToPublish, true, "Partial days and included meals remain reviewable exceptions.");
});
test("initial publication requires review against the final itinerary, with an actionable blocker", () => {
  const review = reviewPlanning(examplePlan(), fixturePricedBudget(), true, "review", [], true);
  assert.equal(review.readyToPublish, false);
  assert.ok(review.blockers.some(issue => issue.code === "BUDGET_REVIEW_REQUIRED" && issue.nextAction === "editBudget"));
  assert.equal(reviewPlanning(examplePlan(), fixturePricedBudget(), false, "edit", [], true).readyToPublish, true, "An isolated edit can preserve an already stale estimate.");
  assert.equal(reviewPlanning(examplePlan(), fixturePricedBudget(), false, "coordinated", [], true, true).readyToPublish, false, "Coordinated Plan and Budget changes need final review.");
});
test("per-person admission quantities expose party-size double counting without rewriting amounts", () => {
  const budget = fixturePricedBudget(); budget.scope = "per_person"; budget.travelers = 2;
  const entry = budget.entries[0]; entry.category = "activities"; entry.quantity = 2; entry.planItemIds = ["visit-1"];
  const before = structuredClone(budget), review = reviewPlanning(examplePlan(), budget, false, "quantity");
  assert.ok(review.findings.some(issue => issue.code === "COST_QUANTITY_SCOPE" && issue.artifact === `budget:${entry.id}`));
  assert.deepEqual(budget, before);
  entry.quantity = 1;
  assert.ok(!reviewPlanning(examplePlan(), budget, false, "corrected").findings.some(issue => issue.code === "COST_QUANTITY_SCOPE"));
});

test("a provisional overnight area is a research finding, not a false completed hotel", () => {
  const plan = examplePlan();
  plan.items.base = { id: "base", kind: "stay", title: "Central base", location: { type: "area", label: "Central Rome", basis: { kind: "assumption", explanation: "Proposed base.", sources: [] } }, coverage: { type: "nights", afterDayIds: ["day-1", "day-2"], basis: { kind: "assumption", explanation: "Two nights.", sources: [] } }, optional: false, reason: null, reservation: null, keep: null };
  const review = reviewPlanning(plan, fixturePricedBudget(), false, "provisional-stay");
  assert.equal(review.findings[0].code, "STAY_PROVISIONAL");
  assert.equal(review.readyToPublish, true, "A disclosed research failure must remain saveable.");
});


test("daily food quantity and a breached spending limit are actionable advisory findings", () => {
  const budget = fixturePricedBudget(); budget.limit = 10;
  Object.assign(budget.entries[0], { category: "food", unit: "person-day allowance", quantity: 9 });
  let review = reviewPlanning(examplePlan(), budget, false, "food-unit");
  assert.ok(review.findings.some(issue => issue.code === "COST_QUANTITY_UNIT"));
  assert.ok(review.findings.some(issue => issue.code === "BUDGET_LIMIT"));
  assert.equal(review.readyToPublish, true, "An honest unresolved tradeoff remains saveable.");
  budget.entries[0].quantity = 3; budget.limit = 100000;
  review = reviewPlanning(examplePlan(), budget, false, "food-corrected");
  assert.ok(!review.findings.some(issue => ["COST_QUANTITY_UNIT", "BUDGET_LIMIT"].includes(issue.code)));
  budget.entries[0].unit = "person-meal"; budget.entries[0].quantity = 9;
  assert.ok(!reviewPlanning(examplePlan(), budget, false, "meal-unit").findings.some(issue => issue.code === "COST_QUANTITY_UNIT"));
});


test("unlinked attraction charges remain visible for reconciliation rather than silently inflating totals", () => {
  const budget = fixturePricedBudget();
  Object.assign(budget.entries[0], { category: "activities", planItemIds: [] });
  const before = structuredClone(budget), review = reviewPlanning(examplePlan(), budget, false, "orphan-cost");
  assert.ok(review.findings.some(issue => issue.code === "UNLINKED_ACTIVITY_COST"));
  assert.deepEqual(budget, before, "A legitimately paid charge must not be automatically deleted.");
});


test("grouped route warnings retain every affected item and never collapse hard errors", () => {
  const input = [
    { code: "journey_unverified", severity: "warning" as const, itemIds: ["a", "b"], message: "Missing position" },
    { code: "journey_unverified", severity: "warning" as const, itemIds: ["b", "c"], message: "Missing position" },
    { code: "journey_time", severity: "error" as const, itemIds: ["a"], message: "Too short" },
    { code: "journey_time", severity: "error" as const, itemIds: ["b"], message: "Too short" },
  ], before = structuredClone(input), result = groupFindings(input);
  assert.equal(result.length, 3); assert.deepEqual(result[0].itemIds, ["a", "b", "c"]);
  assert.equal(result.filter(f => f.severity === "error").length, 2); assert.deepEqual(input, before);
});
