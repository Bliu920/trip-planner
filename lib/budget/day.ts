import { budgetTotals, type Budget } from "./model";

/** Only wholly attributable costs belong in a daily subtotal. */
export function dayBudget(budget: Budget, itemIds: readonly string[]) {
  const ids = new Set(itemIds);
  const linked = budget.entries.filter(entry => entry.planItemIds.some(id => ids.has(id)));
  const entries = linked.filter(entry => entry.planItemIds.every(id => ids.has(id)));
  const shared = linked.filter(entry => !entry.planItemIds.every(id => ids.has(id)));
  const covered = new Set(linked.flatMap(entry => entry.planItemIds));
  const subset = { ...budget, entries };
  return { budget: subset, totals: budgetTotals(subset), shared, unlinked: itemIds.filter(id => !covered.has(id)) };
}
