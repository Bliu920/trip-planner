import catalog from "@/data/italy.json";
import { previewPlan } from "./data";
import type { ActivityItem, Basis, Plan, PlanDay, PlanItem } from "@/lib/plan";
import { catalogItem } from "@/lib/plan/commands";

// Adapt the original visual fixture.
const original = previewPlan(false);
const assumption: Basis = { kind: "assumption", sources: [], explanation: "Illustrative timing from the original Plan preview, not a confirmed reservation." };
const catalogIds: Record<string, string> = {
  lunch: "place_029", market: "place_030", duomo: "place_093", ponte: "place_084",
  uffizi: "place_026", buca: "place_033", oltrarno: "place_028",
  viewpoint: "place_027", boboli: "place_034",
};
export const places = catalog;
export const catalogPhotos = Object.fromEntries(original.days.flatMap(day => {
  const placeId = day.stops.map(stop => catalogIds[stop.id]).find(Boolean);
  return placeId && day.photo ? [[placeId, day.photo]] : [];
}));

export function fixture(empty = false): Plan {
  const makeDay = (index: number): PlanDay => ({
    id: original.days[index].id, title: empty ? "An open day" : original.days[index].title,
    itemIds: [], startLocation: null, endLocation: null,
  });
  const days: Plan["days"] = [makeDay(0), makeDay(1), makeDay(2)];
  const plan: Plan = { startDate: null, days, items: {}, notes: [] };
  if (empty) return plan;

  original.days.forEach((day, dayIndex) => day.stops.forEach(stop => {
    const place = catalog.find(place => place.id === catalogIds[stop.id]);
    const base = place ? catalogItem(place, stop.id) : {
      id: stop.id, title: stop.title, kind: "free_time" as const, location: null,
      reason: null, optional: false, keep: null, reservation: null,
      timing: { period: null, start: null, end: null, duration: null },
    };
    const minutes = stop.duration.endsWith(" hr") ? Number.parseFloat(stop.duration) * 60
      : stop.duration.endsWith(" min") ? Number.parseFloat(stop.duration) : null;
    const schedule: ActivityItem["timing"] = {
      period: null, start: { time: stop.time, date: null, binding: "suggested", basis: assumption },
      end: null, duration: minutes ? { minMinutes: minutes, maxMinutes: minutes, basis: assumption } : null,
    };
    let item: PlanItem = { ...base, title: stop.title, reason: stop.note, optional: stop.optional ?? false, timing: schedule };
    if (stop.kind === "food") item = { ...item, kind: "meal" };
    if (stop.id === "lunch") { item.title = `Lunch at ${place!.name}`; item.reason = "Illustrative meal choice; availability is unverified."; }
    if (stop.kind === "departure") item = {
      id: stop.id, kind: "travel", title: stop.title, reason: stop.note,
      optional: false, keep: null, reservation: null,
      from: { type: "area", label: "Florence", basis: assumption }, to: null, mode: null,
      timing: { type: "interval", schedule },
    };
    plan.items[item.id] = item;
    plan.days[dayIndex].itemIds.push(item.id);
  }));
  plan.notes = [{ id: "dates", kind: "uncertainty", text: "Dates are still open. Confirm seasonal hours and required tickets once you choose them.", relatedItemIds: [], sources: [] }];
  return plan;
}
