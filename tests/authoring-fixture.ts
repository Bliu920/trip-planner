/** Literal public calls for protocol tests. No domain-object translation or token injection. */
export const planHeader = { startDate: null, days: [{ id: "day-1", title: "Rome" }, { id: "day-2", title: "Explore" }, { id: "day-3", title: "Explore" }] };
export const visitCommand = { type: "addActivity", id: "visit-1", dayId: "day-1", kind: "visit", title: "Colosseum", placeId: "place_001", startTime: "09:00", durationMinutes: 90 };
export const budgetSettings = { currency: "EUR", scope: "per_person", travelers: null, limit: null, assumptions: "Party size and dates unknown.", exclusions: ["International travel"] };
export const unpricedStay = { type: "addCost", id: "stay", label: "Lodging", category: "stay", planItemIds: [], unit: "room-night", quantity: 2, min: null, max: null, priceScope: "per_person", pricing: "unknown", assumptions: "Search unavailable; room sharing not confirmed.", sources: [] };
export const offlineGaps = { gaps: [{ entryId: "stay", reason: "search_unavailable", explanation: "Research is disabled in this isolated fixture and no price evidence is supplied." }] };
export const reviewBudget = { operations: [{ type: "review" }] };
export type ScriptCall = [name: string, input: unknown];
export function offlineDraftCalls(): ScriptCall[] {
  return [
    ["createPlan", { plan: planHeader }],
    ["editPlan", { operations: [visitCommand] }],
    ["createBudget", { budget: budgetSettings }],
    ["editBudget", { operations: [unpricedStay] }],
    ["resolveBudgetGaps", offlineGaps],
    ["editBudget", reviewBudget],
  ];
}
