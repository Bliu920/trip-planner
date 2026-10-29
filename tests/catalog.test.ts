import assert from "node:assert/strict";
import test from "node:test";
import italy from "../data/italy.json";
import { filterPlaces, durationLabel } from "../lib/catalog";
import type { Place as PlanningPlace } from "../lib/plan";
import { getPlaces } from "../services/catalog";

test("catalog retains every source record and is compatible with the planner", () => {
  const places = getPlaces();
  const planningPlaces: readonly PlanningPlace[] = places;
  assert.equal(planningPlaces.length, 103);
  assert.equal(new Set(places.map(place => place.id)).size, places.length);
  assert.deepEqual(places, italy);
});

test("search handles accents, whitespace, case, and words across fields", () => {
  const places = getPlaces();
  assert.deepEqual(filterPlaces(places, "  ROME colosseum  ", "", "").map(place => place.id), ["place_001", "place_004"]);
  assert.equal(filterPlaces(places, "caffe florian", "", "")[0]?.name, "Caffè Florian, Venice");
  assert.equal(filterPlaces(places, "", "", "").length, places.length);
});

test("city and category intersect search without mutating or reordering records", () => {
  const places = getPlaces();
  const before = JSON.stringify(places);
  const expected = places.filter(place => place.city === "Rome" && place.type === "museum");
  assert.ok(expected.length > 0);
  assert.deepEqual(filterPlaces(places, "", "Rome", "museum"), expected);
  assert.deepEqual(filterPlaces(places, "Borghese", "Rome", "museum").map(place => place.name), ["Borghese Gallery"]);
  assert.deepEqual(filterPlaces(places, "Borghese", "Venice", "museum"), []);
  assert.equal(JSON.stringify(places), before);
});

test("missing catalog facts remain unknown, including booking requirements", () => {
  const places = getPlaces();
  assert.equal(places.find(place => place.id === "place_002")?.hours, null);
  assert.ok(places.some(place => place.booking_required === null));
  const unknownDuration = places.find(place => place.duration_minutes === null);
  assert.ok(unknownDuration);
  assert.equal(durationLabel(unknownDuration.duration_minutes), "Not available");
});
