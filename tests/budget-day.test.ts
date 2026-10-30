import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetTotals, dayBudget, totalLabel, type BudgetEntry } from "../lib/budget";
import { fixturePricedBudget } from "./plan-fixture";
import { diningBudgetFixture } from "./budget-day-fixture";

test("day costs count each linked entry once, preserve quantities, exclude bundles and unrelated trip costs", () => {
  const budget = fixturePricedBudget();
  const template = budget.entries[0];
  const entry = (id: string, ids: string[]): BudgetEntry => ({ ...template, id, planItemIds: ids });
  budget.entries = [entry("ticket", ["a", "b"]), entry("bundle", ["b", "c"]), entry("hotel", []), entry("other-day", ["c"])];
  const before = structuredClone(budget);
  const result = dayBudget(budget, ["a", "b", "free-or-unknown"]);
  assert.equal(result.totals.min, 80);
  assert.equal(result.totals.max, 120);
  assert.deepEqual(result.budget.entries.map(entry => entry.id), ["ticket"]);
  assert.deepEqual(result.shared.map(entry => entry.id), ["bundle"]);
  assert.deepEqual(result.unlinked, ["free-or-unknown"]);
  assert.deepEqual(budget, before);
  assert.equal(result.budget.scope, budget.scope);
});

test("unknown costs and an empty day never imply free travel", () => {
  const budget = fixturePricedBudget();
  budget.entries[0] = { ...budget.entries[0], planItemIds: ["a"], pricing: "unknown", unitMin: null, unitMax: null };
  const result = dayBudget(budget, ["a"]);
  assert.equal(result.totals.unknown, 1);
  assert.equal(result.totals.priced, 0);
  assert.equal(totalLabel(result.budget), "Not estimated yet");
  assert.equal(totalLabel(dayBudget(budget, []).budget), "Not estimated yet");
});

test("moving an activity changes its linked day costs without rewriting budget facts", () => {
  const budget = fixturePricedBudget();
  budget.entries[0].planItemIds = ["a"];
  assert.equal(dayBudget(budget, ["a"]).totals.priced, 1);
  assert.equal(dayBudget(budget, ["b"]).totals.priced, 0);
  assert.equal(dayBudget(budget, ["b", "a"]).totals.priced, 1);
});

test("daily totals include breakfast, lunch and dinner shares without changing the trip estimate", () => {
  const { plan, budget } = diningBudgetFixture(), before = structuredClone(budget);
  const days = plan.days.map(day => dayBudget(budget, day.itemIds, plan, day.id));
  assert.deepEqual(days.map(day => [day.totals.min, day.totals.max]), [[53, 128], [55, 135], [35, 110]]);
  assert.ok(days.every(day => day.shared.length === 0 && day.unlinked.length === 0 && day.allocations.size === 2));
  const total = budgetTotals(budget);
  assert.equal(days.reduce((sum, day) => sum + day.totals.min, 0), total.min);
  assert.equal(days.reduce((sum, day) => sum + day.totals.max, 0), total.max);
  assert.deepEqual(budget, before);
});

test("shared food follows unequal covered meal counts and conserves cents in party scope", () => {
  const { plan, budget } = diningBudgetFixture();
  const food = budget.entries[1]; budget.entries = [food]; budget.scope = "party"; budget.travelers = 2;
  plan.days[0].itemIds.push(...plan.days[1].itemIds.filter(id => id.startsWith("lunch")));
  plan.days[1].itemIds = plan.days[1].itemIds.filter(id => !id.startsWith("lunch"));
  const totals = plan.days.map(day => dayBudget(budget, day.itemIds, plan, day.id));
  assert.deepEqual(totals.map(day => day.allocations.get(food.id)?.meals), [3, 1, 2]);
  assert.deepEqual(totals.map(day => day.totals.min), [45, 15, 30]);
  assert.ok(totals.every(day => day.budget.scope === "party" && day.budget.travelers === 2));
  food.quantity = 1; food.unitMin = 0.05; food.unitMax = 0.06;
  const cents = plan.days.map(day => dayBudget(budget, day.itemIds, plan, day.id).totals);
  assert.equal(cents.reduce((sum, day) => sum + Math.round(day.min * 100), 0), 5);
  assert.equal(cents.reduce((sum, day) => sum + Math.round(day.max * 100), 0), 6);
  assert.ok(cents.every(day => day.max >= day.min));
});

test("unknown shared meals remain unpriced and indivisible tickets are never allocated as food", () => {
  const { plan, budget } = diningBudgetFixture();
  const breakfast = budget.entries[0];
  breakfast.pricing = "unknown"; breakfast.unitMin = breakfast.unitMax = null;
  budget.entries = [breakfast, { ...budget.entries[2], planItemIds: ["admission-0", "admission-1"] }];
  const day = plan.days[0], result = dayBudget(budget, day.itemIds, plan, day.id);
  assert.equal(result.totals.unknown, 1); assert.equal(result.totals.priced, 0);
  assert.equal(result.budget.entries[0].unitMin, null);
  assert.deepEqual(result.shared.map(entry => entry.id), ["Combined ancient sites ticket"]);
});

test("stale, mixed and ambiguously scheduled food references do not manufacture a daily estimate", () => {
  for (const flaw of ["missing", "non-meal", "duplicate-day", "changed-view"] as const) {
    const { plan, budget } = diningBudgetFixture(); budget.entries = [budget.entries[0]];
    if (flaw === "missing") delete plan.items["breakfast-1"];
    if (flaw === "non-meal") budget.entries[0].planItemIds.push("admission-1");
    if (flaw === "duplicate-day") plan.days[1].itemIds.push("breakfast-0");
    const day = plan.days[0], ids = flaw === "changed-view" ? day.itemIds.slice(1) : day.itemIds;
    const result = dayBudget(budget, ids, plan, day.id);
    assert.equal(result.allocations.size, 0, flaw); assert.equal(result.shared.length, 1, flaw);
  }
});
