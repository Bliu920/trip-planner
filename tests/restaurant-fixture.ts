import type { ActivityItem, Location } from "../lib/plan/types";
import { assumption } from "./plan-fixture";

// Fictional test data, never a proposed venue or real research evidence.
export const restaurantUrl = "https://example.com/cafe-a";
export function restaurantLocation(): Extract<Location, { type: "restaurant" }> {
  return {
    type: "restaurant", label: "Fictional Cafe A", address: "1 Fictional Street", city: "Rome",
    latitude: null, longitude: null,
    basis: { kind: "research", explanation: "Fixture menu and contact page.",
      sources: [{ type: "web", url: restaurantUrl, accessedAt: "2026-01-01T12:00:00.000Z" }] },
  };
}
export function restaurantMeal(): ActivityItem {
  return {
    id: "meal-a", kind: "meal", title: "Lunch at Fictional Cafe A", reason: "Near the day's visit.",
    optional: false, keep: null, reservation: null, location: restaurantLocation(),
    timing: { period: null, start: { date: null, time: "12:30", binding: "suggested", basis: assumption },
      end: null, duration: { minMinutes: 60, maxMinutes: 60, basis: assumption } },
  };
}
