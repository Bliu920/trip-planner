import assert from "node:assert/strict";
import { test } from "node:test";
import { dayBudget, totalLabel, type BudgetEntry } from "../lib/budget";
import { fixturePricedBudget } from "./plan-fixture";

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
