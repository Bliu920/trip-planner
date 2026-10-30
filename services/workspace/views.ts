import { budgetTotals, totalLabel, formatMoney, type Budget } from "@/lib/budget";
import { dayDate, type Plan } from "@/lib/plan";
import type { PlanRead, BudgetRead } from "@/services/assistant/agent/contracts";
import { reviewPlanning } from "@/lib/planning-review";
export function initialSaveBlockers(plan: Plan | null, budget: Budget | null) {
  return reviewPlanning(plan, budget, true, "current").blockers;
}
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
  const totals = budgetTotals(budget);
  const limitWarning = budget.limit !== null && totals.max > budget.limit ? `The upper estimate exceeds your ${formatMoney(budget.limit)} ${budget.scope === "per_person" ? "per-person" : "group"} limit by ${formatMoney(totals.max - budget.limit)}. This estimate is not fully within your limit.` : null;
  const summary = { exists: true, totals, limitWarning, displayTotal: `${totals.unknown ? "Priced subtotal" : "Estimated total"}: ${totalLabel(budget)} ${budget.scope === "per_person" ? "per person" : "for the group"}`, scope: budget.scope, travelers: budget.travelers, limit: budget.limit, assumptions: budget.assumptions, exclusions: budget.exclusions };
  if (input.selector === "summary") return summary;
  if (input.selector === "full") return { ...summary, budget };
  if (input.selector === "entries" && input.ids.some(id => !budget.entries.some(entry => entry.id === id))) throw new Error("A selected cost was not found.");
  return { ...summary, entries: budget.entries.filter(entry => input.selector === "entries" ? input.ids.includes(entry.id) : input.selector === "categories" ? input.ids.includes(entry.category) : entry.planItemIds.some(id => input.ids.includes(id))) };
}
export function planQuality(plan: Plan | null, budget: Budget | null) {
  const review = reviewPlanning(plan, budget, true, "current");
  return { ready: review.qualityComplete, findings: [...review.blockers, ...review.findings].map(issue => issue.message), advisory: true };
}

/** Compact routine context; full route evidence stays available on demand. */
export function journeyContext(report: import("@/lib/journeys").JourneyReport) {
  const uncertain = new Map<string, string[]>();
  for (const leg of report.legs) if (leg.status === "unverified") {
    const reason = leg.reason ?? "Journey remains unverified.";
    uncertain.set(reason, [...(uncertain.get(reason) ?? []), leg.id]);
  }
  const measured = report.legs.some(leg => leg.distanceMeters !== null);
  return { fingerprint: report.fingerprint, status: report.status,
    counts: { total: report.legs.length, checked: report.legs.filter(leg => leg.status === "checked").length, unverified: report.legs.filter(leg => leg.status === "unverified").length },
    knownWalkingMeters: measured ? report.walkingMeters : null, knownMovingMinutes: measured ? report.movingMinutes : null,
    conflicts: report.legs.filter(leg => leg.status === "conflict").map(({ geometry: _geometry, fromCoordinates: _from, toCoordinates: _to, ...leg }) => { void _geometry; void _from; void _to; return leg; }),
    uncertainties: [...uncertain].map(([reason, legIds]) => ({ reason, legIds })),
    findings: report.findings.filter(finding => finding.code !== "journey_unverified"),
    detail: "Totals cover only obtained map evidence. Use getJourneys for full leg details when available; unverified journeys are not checked routes." };
}
