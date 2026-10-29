import { budgetTotals, type Budget } from "./model";

/** Coverage is derived from entries, never maintained as another saved fact. */
export function checkBudgetPrices(budget: Budget) {
  const { priced, unknown } = budgetTotals(budget);
  return {
    total: budget.entries.length,
    priced,
    unknown,
    coverage: !priced ? "unpriced" as const : unknown ? "partial" as const : "priced" as const,
    findings: budget.entries.filter(entry => entry.pricing === "unknown").map(entry => ({
      code: "missing_price" as const,
      entryId: entry.id,
      label: entry.label,
      reason: entry.assumptions,
    })),
  };
}
