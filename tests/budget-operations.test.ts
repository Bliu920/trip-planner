import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBudgetOperations, budgetTotals } from "../lib/budget";
import { fixturePricedBudget } from "./plan-fixture";
test("Budget local edits retain evidence and exact source timestamps", () => {
  const budget = fixturePricedBudget(); budget.entries.push({ ...structuredClone(budget.entries[0]), id: "other" });
  const result = applyBudgetOperations(budget, [{ type: "updateEntry", id: "stay", fields: { quantity: 1 } }, { type: "recordReview" }]);
  assert.deepEqual(result.budget.entries[1], budget.entries[1]);
  assert.deepEqual(result.budget.entries[0].sources, budget.entries[0].sources);
  assert.equal(result.reviewed, true); assert.deepEqual(budgetTotals(result.budget).min, 120);
  assert.equal(applyBudgetOperations(budget, [{ type: "recordReview" }, { type: "setLimit", value: 400 }]).reviewed, false);
});
test("invalid Budget batches neither partially apply nor erase prices", () => {
  const budget = fixturePricedBudget(), before = structuredClone(budget);
  assert.throws(() => applyBudgetOperations(budget, [{ type: "setLimit", value: 400 }, { type: "updateEntry", id: "stay", fields: { unitMax: 1 } }]));
  assert.deepEqual(budget, before);
  assert.throws(() => applyBudgetOperations(budget, [{ type: "removeEntry", id: "missing" }]));
});
