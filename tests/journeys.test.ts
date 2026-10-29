import assert from "node:assert/strict";
import { test } from "node:test";
import { activityWindow, inspectPlan, type ActivityItem } from "../lib/plan";
import { deriveJourneys, bufferedMinutes } from "../lib/journeys";
import { examplePlan, assumption } from "./plan-fixture";
import catalog from "../data/italy.json";

function timed(id: string, place: string, start: string, minutes: number): ActivityItem {
  return { ...examplePlan().items["visit-1"], id, kind: "visit", location: { type: "catalog", placeId: place },
    timing: { period: null, start: { date: null, time: start, binding: "suggested", basis: assumption }, end: null,
      duration: { minMinutes: minutes - 5, maxMinutes: minutes, basis: assumption } } } as ActivityItem;
}
export function routedPlan() {
  const plan = examplePlan();
  plan.items = { a: timed("a", catalog[0].id, "09:00", 60), b: timed("b", catalog[1].id, "10:30", 60) };
  plan.days[0].itemIds = ["a", "b"];
  return plan;
}
test("starts plus ranged durations use the maximum and detect overlaps", () => {
  const plan = routedPlan(), b = plan.items.b as ActivityItem;
  assert.deepEqual(activityWindow(plan.items.a, null, 0), { dated: false, start: 540, end: 600 });
  b.timing.start!.time = "09:55";
  assert.ok(inspectPlan(plan, catalog).findings.some(f => f.code === "overlap" && f.severity === "error"));
  assert.equal(bufferedMinutes(600), 20);
});
test("implicit journeys are derived when no travel item was written", () => {
  const legs = deriveJourneys(routedPlan());
  assert.equal(legs.length, 1); assert.equal(legs[0].availableMinutes, 30);
  assert.equal(legs[0].mode, "walk"); assert.deepEqual(legs[0].travelItemIds, []);
});
test("an explicit journey consumes its own window without duplicate transfer", () => {
  const plan = routedPlan();
  plan.items.walk = { id: "walk", kind: "travel", title: "Walk", reason: null, optional: false, keep: null, reservation: null,
    from: { type: "item", itemId: "a" }, to: { type: "item", itemId: "b" }, mode: "walk",
    timing: { type: "interval", schedule: { period: null, start: { date: null, time: "10:00", binding: "suggested", basis: assumption }, end: null, duration: { minMinutes: 10, maxMinutes: 10, basis: assumption } } } };
  plan.days[0].itemIds = ["a", "walk", "b"];
  const legs = deriveJourneys(plan); assert.equal(legs.length, 1);
  assert.equal(legs[0].allocatedMinutes, 10); assert.deepEqual(legs[0].travelItemIds, ["walk"]);
});
test("same-place rest consumes time without inventing a new destination", () => {
  const plan = routedPlan();
  plan.items.rest = { ...timed("rest", catalog[0].id, "10:00", 20), kind: "rest", location: null };
  plan.days[0].itemIds = ["a", "rest", "b"];
  assert.equal(deriveJourneys(plan)[0].availableMinutes, 10);
});
test("an arrival-only travel marker never becomes a zero-minute complete journey", () => {
  const plan = routedPlan();
  plan.items.arrival = { id: "arrival", kind: "travel", title: "Arrive by car", reason: null, optional: false, keep: null, reservation: null,
    from: { type: "catalog", placeId: catalog[0].id }, to: { type: "catalog", placeId: catalog[1].id }, mode: "car",
    timing: { type: "arrival", at: { date: null, time: "10:00", binding: "suggested", basis: assumption } } };
  plan.days[0].itemIds = ["arrival"];
  const legs = deriveJourneys(plan); assert.equal(legs[0].availableMinutes, null); assert.equal(legs[0].allocatedMinutes, null);
});
