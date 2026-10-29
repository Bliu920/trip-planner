import { budgetTotals, type Budget } from "@/lib/budget";
import { dayDate, type Plan } from "@/lib/plan";
import type { PlanRead, BudgetRead } from "@/services/agent/contracts";
export function planView(plan: Plan | null, input: PlanRead) {
  if (!plan) return { exists: false };
  if (input.selector === "full") return { exists: true, plan };
  if (input.selector === "summary") return { exists: true, days: plan.days.map((day, i) => ({ id: day.id, title: day.title, date: dayDate(plan, i), itemCount: day.itemIds.length })), itemCount: Object.keys(plan.items).length, noteCount: plan.notes.length };
  const items = Object.values(plan.items).filter(item => input.selector === "items" ? input.ids.includes(item.id) : input.selector === "stays" ? item.kind === "stay" : input.selector === "unscheduled" ? item.kind !== "stay" && !plan.days.some(day => day.itemIds.includes(item.id)) : plan.days.some(day => input.ids.includes(day.id) && day.itemIds.includes(item.id)));
  if (input.selector === "days" && input.ids.some(id => !plan.days.some(day => day.id === id))) throw new Error("A selected day was not found.");
  if (input.selector === "items" && input.ids.some(id => !plan.items[id])) throw new Error("A selected arrangement was not found.");
  return { exists: true, startDate: plan.startDate, days: input.selector === "days" ? plan.days.flatMap((day, i) => input.ids.includes(day.id) ? [{ ...day, date: dayDate(plan, i) }] : []) : undefined, items, notes: plan.notes.filter(note => !note.relatedItemIds.length || note.relatedItemIds.some(id => items.some(item => item.id === id))) };
}
export function budgetView(budget: Budget | null, input: BudgetRead) {
  if (!budget) return { exists: false };
  const summary = { exists: true, totals: budgetTotals(budget), scope: budget.scope, travelers: budget.travelers, limit: budget.limit, assumptions: budget.assumptions, exclusions: budget.exclusions };
  if (input.selector === "summary") return summary;
  if (input.selector === "full") return { ...summary, budget };
  if (input.selector === "entries" && input.ids.some(id => !budget.entries.some(entry => entry.id === id))) throw new Error("A selected cost was not found.");
  return { ...summary, entries: budget.entries.filter(entry => input.selector === "entries" ? input.ids.includes(entry.id) : input.selector === "categories" ? input.ids.includes(entry.category) : entry.planItemIds.some(id => input.ids.includes(id))) };
}
export function planQuality(plan: Plan | null, budget: Budget | null) {
  if (!plan) return { ready: false, findings: ["No itinerary exists."] };
  const findings: string[] = [];
  for (const day of plan.days) {
    const items = day.itemIds.map(id => plan.items[id]).filter(Boolean);
    if (!items.some(item => item.kind === "visit" || item.kind === "meal")) findings.push(`${day.title}: no concrete outing or meal.`);
    if (!items.some(item => item.kind === "meal")) findings.push(`${day.title}: meal coverage needs review.`);
    if (items.filter(item => item.kind !== "travel" && item.kind !== "logistics").length < 3) findings.push(`${day.title}: sparse schedule; check user-requested free time.`);
  }
  if (!Object.values(plan.items).some(item => item.kind === "stay")) findings.push("Overnight arrangements need review.");
  if (!budget?.entries.length) findings.push("No budget exists.");
  else {
    if (budgetTotals(budget).unknown) findings.push("Budget includes unpriced costs.");
    for (const category of ["stay", "food", "transport", "activities"]) if (!budget.entries.some(entry => entry.category === category)) findings.push(`${category}: cost coverage or explicit exclusion needs review.`);
  }
  return { ready: !findings.length, findings, advisory: true };
}
