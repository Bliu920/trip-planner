import type { ActivityItem } from "../lib/plan";
import type { BudgetEntry } from "../lib/budget";
import { examplePlan, fixturePricedBudget } from "./plan-fixture";
import { restaurantLocation } from "./restaurant-fixture";

/** Synthetic screenshot regression, never a real quote or booking. */
export function diningBudgetFixture() {
  const plan = examplePlan(), budget = fixturePricedBudget();
  const visit = plan.items["visit-1"] as ActivityItem;
  const template = budget.entries[0];
  plan.items = {};
  plan.days.forEach((day, index) => {
    const admission = `admission-${index}`;
    plan.items[admission] = { ...structuredClone(visit), id: admission, title: `Day ${index + 1} visit` };
    day.itemIds = [admission];
    for (const meal of ["breakfast", "lunch", "dinner"]) {
      const id = `${meal}-${index}`;
      plan.items[id] = { ...structuredClone(visit), id, kind: "meal", title: `${meal} at an illustrative restaurant`, location: restaurantLocation() };
      day.itemIds.push(id);
    }
  });
  const cost = (id: string, category: BudgetEntry["category"], ids: string[], min: number, max: number, quantity = 1): BudgetEntry => ({
    ...template, id, label: id, category, planItemIds: ids, unit: "person-meal", quantity, unitMin: min, unitMax: max,
  });
  budget.entries = [
    cost("Three breakfasts", "food", plan.days.map((_, i) => `breakfast-${i}`), 5, 10, 3),
    cost("Lunch and dinner allowance", "food", plan.days.flatMap((_, i) => [`lunch-${i}`, `dinner-${i}`]), 15, 50, 6),
    cost("Combined ancient sites ticket", "activities", ["admission-0"], 18, 18),
    cost("Museum admission", "activities", ["admission-1"], 20, 25),
    cost("Free visit", "activities", ["admission-2"], 0, 0),
  ];
  return { plan, budget };
}
