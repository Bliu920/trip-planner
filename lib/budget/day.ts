import type { Plan } from "@/lib/plan/types";
import { budgetTotals, type Budget, type BudgetEntry } from "./model";

/** Divide cents without losing the full allowance or reversing its price range. */
function splitCents(total: number, weights: number[]) {
  const count = weights.reduce((sum, weight) => sum + weight, 0);
  const amounts = weights.map((weight) => Math.floor((total * weight) / count));
  let remainder = total - amounts.reduce((sum, amount) => sum + amount, 0);
  weights
    .map((weight, index) => ({ index, fraction: (total * weight) % count }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (remainder > 0 && weights[index]) {
        amounts[index]++;
        remainder--;
      }
    });
  return amounts;
}

/** Project saved costs; distribute shared food only when scheduled meals establish a basis. */
export function dayBudget(
  budget: Budget,
  itemIds: readonly string[],
  plan: Plan | null = null,
  dayId?: string,
) {
  const ids = new Set(itemIds);
  const linked = budget.entries.filter((entry) => entry.planItemIds.some((id) => ids.has(id)));
  const entries: BudgetEntry[] = [],
    shared: BudgetEntry[] = [];
  const allocations = new Map<
    string,
    { original: BudgetEntry; meals: number; totalMeals: number }
  >();
  const dayIndex = plan?.days.findIndex((day) => day.id === dayId) ?? -1;
  const day = plan?.days[dayIndex];
  const currentDay =
    !!day && day.itemIds.length === ids.size && day.itemIds.every((id) => ids.has(id));
  for (const entry of linked) {
    if (entry.planItemIds.every((id) => ids.has(id))) {
      entries.push(entry);
      continue;
    }
    const mealIds = [...new Set(entry.planItemIds)];
    const membership = mealIds.map(
      (id) => plan?.days.flatMap((day, index) => (day.itemIds.includes(id) ? [index] : [])) ?? [],
    );
    if (
      entry.category !== "food" ||
      !currentDay ||
      mealIds.some((id) => plan?.items[id]?.kind !== "meal") ||
      membership.some((days) => days.length !== 1)
    ) {
      shared.push(entry);
      continue;
    }
    const weights = plan!.days.map(
      (_, index) => membership.filter((days) => days[0] === index).length,
    );
    const low = Math.round((entry.unitMin ?? 0) * 100) * entry.quantity;
    const high = Math.round((entry.unitMax ?? 0) * 100) * entry.quantity;
    const minimum = splitCents(low, weights)[dayIndex];
    const maximum = minimum + splitCents(high - low, weights)[dayIndex];
    allocations.set(entry.id, {
      original: entry,
      meals: weights[dayIndex],
      totalMeals: mealIds.length,
    });
    entries.push({
      ...entry,
      quantity: 1,
      pricing: entry.pricing === "unknown" ? "unknown" : "estimated",
      unitMin: entry.pricing === "unknown" ? null : minimum / 100,
      unitMax: entry.pricing === "unknown" ? null : maximum / 100,
    });
  }
  const covered = new Set(linked.flatMap((entry) => entry.planItemIds));
  const subset = { ...budget, entries };
  return {
    budget: subset,
    totals: budgetTotals(subset),
    shared,
    allocations,
    unlinked: itemIds.filter((id) => !covered.has(id)),
  };
}
