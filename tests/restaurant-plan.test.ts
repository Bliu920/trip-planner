import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectPlan } from "../lib/plan";
import type { Plan } from "../lib/plan";
import { inspectVenueSources } from "../services/plans/venues";
import { presentPlan } from "../lib/plan/presentation/model";
import catalog from "../data/italy.json";
import { examplePlan, assumption } from "./plan-fixture";
import { restaurantLocation, restaurantMeal, restaurantUrl } from "./restaurant-fixture";

function mealPlan() {
  const plan = examplePlan();
  plan.items["meal-a"] = restaurantMeal();
  plan.days[0].itemIds.push("meal-a");
  return plan;
}
const errors = (plan: unknown, previous: Plan | null = null) => inspectPlan(plan, catalog, previous).findings.filter(f => f.severity === "error");

test("researched meals save identity, address and evidence without invented coordinates", () => {
  const plan = mealPlan();
  assert.deepEqual(errors(plan), []);
  assert.deepEqual(inspectVenueSources(plan, null, new Set([restaurantUrl])), []);
  const stop = presentPlan(plan, catalog).days[0].stops[1];
  assert.equal(stop.title, "Lunch at Fictional Cafe A");
  assert.equal(stop.locationLabel, "Fictional Cafe A, 1 Fictional Street, Rome");
  assert.equal(stop.time, "12:30"); assert.equal(stop.duration, "1 hr");
  assert.equal(stop.coordinates, null); assert.equal(stop.sources![0].url, restaurantUrl);
  const location = restaurantLocation(); location.latitude = 41.9; location.longitude = 12.5;
  (plan.items["meal-a"] as ReturnType<typeof restaurantMeal>).location = location;
  assert.deepEqual(presentPlan(plan, catalog).days[0].stops[1].coordinates, [41.9, 12.5]);
});

test("new generic meals fail, but unrelated edits can preserve legacy placeholders with a warning", () => {
  for (const location of [null, { type: "area" as const, label: "Near the base", basis: assumption }]) {
    const plan = mealPlan();
    (plan.items["meal-a"] as ReturnType<typeof restaurantMeal>).location = location;
    assert.ok(errors(plan).some(f => f.code === "meal_venue"));
    const old = structuredClone(plan); plan.days[1].title = "Changed day";
    assert.deepEqual(errors(plan, old), []);
    assert.ok(inspectPlan(plan, catalog, old).findings.some(f => f.code === "meal_venue" && f.severity === "warning"));
    const other = structuredClone(plan); other.items.new = { ...restaurantMeal(), id: "new", location };
    assert.ok(errors(other, old).some(f => f.code === "meal_venue"));
  }
});

test("catalog meals need food venues, not arbitrary attractions or antique markets", () => {
  for (const place of catalog.filter(p => ["restaurant", "cafe", "market"].includes(p.type))) {
    const plan = mealPlan();
    (plan.items["meal-a"] as ReturnType<typeof restaurantMeal>).location = { type: "catalog", placeId: place.id };
    assert.equal(errors(plan).some(f => f.code === "meal_venue"), place.type === "market" && !place.tags.includes("food"));
  }
  const plan = mealPlan();
  (plan.items["meal-a"] as ReturnType<typeof restaurantMeal>).location = { type: "catalog", placeId: catalog[0].id };
  assert.ok(errors(plan).some(f => f.code === "meal_venue"));
});

test("explicit user-arranged meals remain possible and restaurants cannot become attractions or hotels", () => {
  const plan = mealPlan();
  (plan.items["meal-a"] as ReturnType<typeof restaurantMeal>).location = {
    type: "area", label: "Self-arranged lunch", basis: { kind: "user", sources: [{ type: "legacy_notes" }], explanation: "User arranges lunch independently." },
  };
  assert.deepEqual(errors(plan), []);
  plan.items["visit-1"] = { ...restaurantMeal(), id: "visit-1", kind: "visit" };
  assert.ok(errors(plan).some(f => f.code === "restaurant_use"));
  plan.items.hotel = { id: "hotel", kind: "stay", title: "Hotel", reason: null, optional: false, keep: null, reservation: null, location: restaurantLocation(), coverage: null };
  assert.ok(errors(plan).some(f => f.code === "restaurant_use" && f.itemIds.includes("hotel")));
});

test("restaurant identity, research basis, citation and coordinate pair are required", () => {
  const mutations = [
    { address: "" }, { city: "" }, { label: "" }, { latitude: 41.9 },
    { basis: assumption }, { basis: { kind: "research", sources: [], explanation: null } },
    { basis: { kind: "research", sources: [{ type: "catalog", placeId: catalog[0].id, field: null }], explanation: null } },
  ];
  for (const change of mutations) {
    const plan = mealPlan();
    Object.assign((plan.items["meal-a"] as ReturnType<typeof restaurantMeal>).location!, change);
    assert.ok(errors(plan).some(f => f.code === "shape"));
  }
});

test("unobserved or future restaurant sources are rejected, including copied travel endpoints", () => {
  const plan = mealPlan();
  assert.ok(inspectVenueSources(plan, null, new Set()).some(f => f.code === "restaurant_source"));
  const location = restaurantLocation();
  location.basis.sources = [{ type: "web", url: restaurantUrl, accessedAt: "2999-01-01T00:00:00.000Z" }];
  plan.days[0].startLocation = location;
  assert.ok(inspectVenueSources(plan, null, new Set([restaurantUrl])).some(f => /future/.test(f.message)));
});

test("saved restaurant evidence survives JSON key reordering and offline edits but changed facts need research", () => {
  const old = mealPlan(), plan = structuredClone(old);
  const location = restaurantLocation();
  const reordered = Object.fromEntries(Object.entries(location).reverse());
  Object.assign((plan.items["meal-a"] as ReturnType<typeof restaurantMeal>), { location: reordered });
  plan.days[0].title = "New title";
  assert.deepEqual(inspectVenueSources(plan, old, new Set()), []);
  for (const change of [{ address: "2 Other Street" }, { label: "Other Cafe" }, { city: "Florence" }, { latitude: 41.9, longitude: 12.5 }]) {
    Object.assign((plan.items["meal-a"] as ReturnType<typeof restaurantMeal>).location!, location, change);
    assert.ok(inspectVenueSources(plan, old, new Set()).length);
    if ("latitude" in change) assert.ok(inspectVenueSources(plan, old, new Set([restaurantUrl])).some(f => f.code === "venue_position"));
    else assert.deepEqual(inspectVenueSources(plan, old, new Set([restaurantUrl])), []);
  }
  const refreshed = restaurantLocation();
  refreshed.basis.sources = [{ type: "web", url: restaurantUrl, accessedAt: "2026-01-02T12:00:00.000Z" }];
  (plan.items["meal-a"] as ReturnType<typeof restaurantMeal>).location = refreshed;
  assert.ok(inspectVenueSources(plan, old, new Set()).length);
});
