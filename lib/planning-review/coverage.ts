import { itemTiming, type Plan } from "@/lib/plan";
import { budgetTotals, type Budget } from "@/lib/budget";
import type { DayCoverage, ReviewIssue } from "./types";

export function coverage(plan: Plan | null, budget: Budget | null) {
  const findings: ReviewIssue[] = [],
    days: DayCoverage[] = [];
  const covered = new Set(budget?.entries.flatMap((entry) => entry.planItemIds) ?? []);
  const items = Object.values(plan?.items ?? {});
  const provisionalStays = items.filter(
    (item) => item.kind === "stay" && item.location.type === "area",
  );
  if (provisionalStays.length)
    findings.push({
      code: "STAY_PROVISIONAL",
      artifact: "plan",
      itemIds: provisionalStays.map((item) => item.id),
      message:
        "Lodging is still only an area. Research a suitable named hotel and its address. Unconfirmed dated availability does not prevent proposing a real property; retain an area only if identity or suitability research actually failed.",
      nextAction: "editPlan",
    });
  for (const day of plan?.days ?? []) {
    const selected = day.itemIds.map((id) => plan!.items[id]).filter(Boolean);
    const meals = selected.filter((item) => item.kind === "meal"),
      concrete = selected.filter((item) => item.kind === "visit" || item.kind === "meal");
    const missing = selected.filter((item) => {
      const time = itemTiming(item);
      return !time?.start?.time && !(item.kind === "travel" && item.timing.type !== "interval");
    });
    days.push({
      dayId: day.id,
      itemCount: selected.length,
      concreteCount: concrete.length,
      mealIds: meals.map((item) => item.id),
      timedCount: selected.length - missing.length,
      missingTimeIds: missing.map((item) => item.id),
    });
    const add = (code: string, message: string, itemIds = day.itemIds) =>
      findings.push({ code, artifact: `day:${day.id}`, message, itemIds, nextAction: "editPlan" });
    if (!concrete.length)
      add(
        "DAY_EMPTY",
        `${day.title}: no concrete outing or meal. Check explicit user free-day exceptions.`,
      );
    if (concrete.length < 3)
      add(
        "DAY_SPARSE",
        `${day.title}: review the sparse schedule against the requested pace and available time.`,
      );
    if (!meals.length) add("MEALS_MISSING", `${day.title}: meal coverage needs review.`);
    else {
      const mealHours = meals.flatMap((item) => {
        const start = itemTiming(item)?.start?.time;
        return start ? [Number(start.slice(0, 2))] : [];
      });
      const missingMeals = [
        ["breakfast", 5, 11],
        ["lunch", 11, 17],
        ["dinner", 17, 24],
      ] as const;
      const gaps = missingMeals
        .filter(([, from, to]) => !mealHours.some((hour) => hour >= from && hour < to))
        .map(([meal]) => meal);
      if (gaps.length)
        add(
          "MEAL_WINDOWS",
          `${day.title}: no scheduled ${gaps.join(" or ")} in its usual service window. Add suitable venues, or check an explicit partial-day, included-meal or self-arranged exception.`,
          meals.map((item) => item.id),
        );
    }
    if (missing.length)
      add(
        "TIMES_MISSING",
        `${day.title}: add clock times and bounded windows where applicable.`,
        missing.map((item) => item.id),
      );
  }
  const unlinkedMealIds = items
    .filter((item) => item.kind === "meal" && !covered.has(item.id))
    .map((item) => item.id);
  const unlinkedStayIds = items
    .filter((item) => item.kind === "stay" && !covered.has(item.id))
    .map((item) => item.id);
  if (plan && !items.some((item) => item.kind === "stay"))
    findings.push({
      code: "STAY_MISSING",
      artifact: "plan",
      message: "Overnight arrangements need review; respect explicit no-stay exceptions.",
      nextAction: "editPlan",
    });
  for (const [code, ids, label] of [
    ["MEAL_COST_MISSING", unlinkedMealIds, "Meals"],
    ["STAY_COST_MISSING", unlinkedStayIds, "Stays"],
  ] as const)
    if (ids.length)
      findings.push({
        code,
        artifact: "budget",
        itemIds: [...ids],
        message: `${label} have no linked cost. Review paid, included, free or excluded coverage; missing does not mean zero.`,
        nextAction: "editBudget",
      });
  if (budget?.entries.length)
    for (const category of ["stay", "food", "transport", "activities"] as const)
      if (!budget.entries.some((entry) => entry.category === category))
        findings.push({
          code: "COST_CATEGORY",
          artifact: "budget",
          message: `${category}: review cost coverage or the explicit exclusion.`,
          nextAction: "editBudget",
        });
  if (budget?.scope === "per_person" && budget.travelers && budget.travelers > 1)
    for (const entry of budget.entries) {
      if (
        ["activities", "transport"].includes(entry.category) &&
        entry.quantity === budget.travelers
      )
        findings.push({
          code: "COST_QUANTITY_SCOPE",
          artifact: `budget:${entry.id}`,
          itemIds: entry.planItemIds,
          message: `${entry.label}: quantity equals the party size in a per-person budget. Check occurrences for one traveller. One admission or pass each normally has quantity 1; retain a larger quantity only for genuinely repeated charges.`,
          nextAction: "editBudget",
        });
    }
  if (budget && budget.limit !== null && budgetTotals(budget).max > budget.limit)
    findings.push({
      code: "BUDGET_LIMIT",
      artifact: "budget",
      message:
        "The upper estimate exceeds the user spending limit. Recheck units and occurrence counts, then research a more affordable selected option or explicitly explain the unresolved tradeoff. Do not lower supported prices merely to fit the limit.",
      nextAction: "editBudget",
    });
  for (const entry of budget?.entries ?? [])
    if (
      entry.category === "food" &&
      /\bday\b|daily/i.test(entry.unit) &&
      plan &&
      entry.quantity > plan.days.length
    )
      findings.push({
        code: "COST_QUANTITY_UNIT",
        artifact: `budget:${entry.id}`,
        itemIds: entry.planItemIds,
        message: `${entry.label}: this unit describes a daily allowance but quantity exceeds the number of trip days. Count quoted units, not linked meals. Correct the unit, quantity and one-unit amount together.`,
        nextAction: "editBudget",
      });
  for (const entry of budget?.entries ?? [])
    if (entry.category === "activities" && !entry.planItemIds.length)
      findings.push({
        code: "UNLINKED_ACTIVITY_COST",
        artifact: `budget:${entry.id}`,
        message: `${entry.label}: this admission or activity charge has no selected arrangement. Remove an obsolete unbooked charge, link the selected visit, or explicitly explain why an already-paid/non-refundable charge must remain. Removing only its links does not remove its price.`,
        nextAction: "editBudget",
      });
  const unlinkedVisits = items
    .filter((item) => item.kind === "visit" && !covered.has(item.id))
    .map((item) => item.id);
  if (unlinkedVisits.length)
    findings.push({
      code: "VISIT_COST_COVERAGE",
      artifact: "budget",
      itemIds: unlinkedVisits,
      message:
        "Review these visits for admission coverage. Explain free exterior visits, included or excluded costs; add any missing paid admission without duplicating bundled tickets.",
      nextAction: "editBudget",
    });
  const totals = budget ? budgetTotals(budget) : { priced: 0, unknown: 0 };
  if (totals.unknown)
    findings.push({
      code: "PRICES_UNKNOWN",
      artifact: "budget",
      message: "Some costs remain unpriced; the total is incomplete.",
      nextAction: "researchWeb",
    });
  return {
    days,
    findings,
    costs: {
      entries: budget?.entries.length ?? 0,
      priced: totals.priced,
      unknown: totals.unknown,
      unlinkedMealIds,
      unlinkedStayIds,
    },
  };
}
