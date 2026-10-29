import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { budgetSchema, checkBudgetPrices, type Budget, type BudgetEntry } from "@/lib/budget";

export const budgetGapSchema = z.object({
  entryId: z.string().min(1).max(100),
  reason: z.enum(["search_unavailable", "not_found", "missing_details"]),
  explanation: z.string().trim().min(20).max(1200),
}).strict();
export type BudgetGap = z.infer<typeof budgetGapSchema>;
class BudgetReviewError extends Error {
  readonly status = 400;
  readonly code = "BUDGET_GAPS";
}
type Observation = { entry: BudgetEntry; scope: string; researchRound: number; resolved: boolean };

/** Per-run publication policy. No provider, prompt, database or UI dependency. */
export class BudgetReview {
  private observations = new Map<string, Observation>();
  private researchRound = 0;

  constructor(private readonly searchAvailable: boolean) {}

  recordResearch() { this.researchRound++; }
  reset() { this.observations.clear(); }

  inspect(budget: Budget, planKey: string, existing: Budget | null, preserveExisting: boolean) {
    const scope = JSON.stringify([budget.scope, budget.travelers, budget.assumptions, planKey, preserveExisting]);
    const report = checkBudgetPrices(budget);
    const currentIds = new Set(budget.entries.map(entry => entry.id));
    for (const id of this.observations.keys()) if (!currentIds.has(id)) this.observations.delete(id);
    const pending: string[] = [];
    for (const entry of budget.entries) {
      if (entry.pricing !== "unknown") { this.observations.delete(entry.id); continue; }
      let observation = this.observations.get(entry.id);
      if (!observation || observation.scope !== scope || !isDeepStrictEqual(observation.entry, entry)) {
        // Preserve ongoing research progress.
        const cost = (value: BudgetEntry) => [value.id, value.label, value.category, value.planItemIds, value.unit, value.quantity];
        const samePendingCost = observation && !observation.resolved && observation.scope === scope &&
          isDeepStrictEqual(cost(observation.entry), cost(entry));
        const unchanged = preserveExisting && existing?.scope === budget.scope &&
          existing.travelers === budget.travelers && existing.assumptions === budget.assumptions &&
          isDeepStrictEqual(existing.entries.find(old => old.id === entry.id), entry);
        observation = { entry: structuredClone(entry), scope,
          researchRound: samePendingCost ? observation!.researchRound : this.researchRound, resolved: unchanged };
        this.observations.set(entry.id, observation);
      }
      if (!observation.resolved) pending.push(entry.id);
    }
    return { ...report, pending, readyToCommit: pending.length === 0, searchAvailable: this.searchAvailable };
  }

  resolve(budget: Budget, gaps: BudgetGap[]) {
    if (!gaps.length || new Set(gaps.map(gap => gap.entryId)).size !== gaps.length)
      throw new BudgetReviewError("Provide distinct missing-price entry IDs from the latest budget check.");
    // Validate the whole request.
    const updated = structuredClone(budget);
    for (const value of gaps) {
      const gap = budgetGapSchema.parse(value);
      const entry = updated.entries.find(entry => entry.id === gap.entryId);
      const observation = this.observations.get(gap.entryId);
      if (!entry || entry.pricing !== "unknown" || !observation || observation.resolved)
        throw new BudgetReviewError(`No pending price check for ${gap.entryId}. Propose the budget first.`);
      if (gap.reason === "search_unavailable") {
        if (this.searchAvailable) throw new BudgetReviewError("Web search is enabled. Research the missing prices before explaining unresolved costs.");
      } else if (this.searchAvailable && this.researchRound <= observation.researchRound) {
        throw new BudgetReviewError("Make a targeted web-search follow-up after the missing-price check, then record its result. A repeated proposal does not count as research.");
      }
      entry.assumptions = `${entry.assumptions}\nPrice still unknown: ${gap.explanation}`;
    }
    const checked = budgetSchema.parse(updated);
    // Apply resolutions atomically.
    for (const gap of gaps) {
      const observation = this.observations.get(gap.entryId)!;
      observation.entry = structuredClone(checked.entries.find(entry => entry.id === gap.entryId)!);
      observation.resolved = true;
    }
    return checked;
  }
}
