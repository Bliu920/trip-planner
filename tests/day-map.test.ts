import assert from "node:assert/strict";
import { test } from "node:test";
import { dayLocations, locationNotice, visibleMapLabels } from "../lib/plan/day-view/locations";
import type { Day, Stop } from "../lib/plan/presentation/model";
import type { CheckedLeg } from "../lib/journeys";

const stop: Stop = { id: "museum", title: "Museum", time: "10:00", duration: "1 hr", kind: "sight", category: "visit", note: "", coordinates: [41.89, 12.49] };
const day: Day = { id: "day", title: "Rome", date: null, photo: null, walkingLabel: null, stayLabel: null,
  stops: [stop, { ...stop, id: "meal", kind: "food", category: "meal", coordinates: null, locationLabel: "Restaurant, Rome", locationState: "unmapped" },
    { ...stop, id: "rest", coordinates: null, category: "rest", locationState: "not_applicable" }, { ...stop, id: "skipped", omitted: true }],
  stays: [{ ...stop, id: "hotel", title: "Hotel" }] };
const leg: CheckedLeg = { id: "connection", dayId: "day", fromItemId: "museum", toItemId: "meal", mode: "walk", status: "unverified",
  distanceMeters: null, durationSeconds: null, reservedMinutes: null, availableMinutes: null, evidenceId: null, checkedAt: null, reason: "Timing not confirmed",
  fromCoordinates: [12.49, 41.89], toCoordinates: [12.48, 41.9] };

test("day map and detail positions share route evidence without inventing unknown locations", () => {
  const before = structuredClone(day);
  const result = dayLocations(day, [leg]);
  assert.deepEqual(result.places.map(place => [place.id, place.number]), [["museum", 1], ["meal", 2], ["hotel", "H"]]);
  const meal = result.stops.find(stop => stop.id === "meal")!;
  assert.deepEqual(meal.coordinates, [41.9, 12.48]);
  assert.equal(locationNotice(meal), null);
  assert.equal(result.stops.find(stop => stop.id === "rest")?.coordinates, null);
  assert.equal(result.stops.find(stop => stop.id === "skipped")?.coordinates, null);
  assert.deepEqual(day, before);
  assert.equal(dayLocations(day, [{ ...leg, dayId: "another-day" }]).places.some(place => place.id === "meal"), false);
});

test("invalid positions cannot create pins or a misleading located status", () => {
  const result = dayLocations({ ...day, stays: [], stops: [{ ...stop, coordinates: [91, 12] }, { ...stop, id: "bad", coordinates: [NaN, 0] }] });
  assert.equal(result.places.length, 0);
  assert.ok(result.stops.every(stop => stop.coordinates === null));
  assert.deepEqual(dayLocations(day, [{ ...leg, toCoordinates: [181, 41] }]).places.map(place => place.id), ["museum", "hotel"]);
});

test("location messages distinguish undecided venues, unlocated addresses and location-free activities", () => {
  assert.equal(locationNotice({ ...stop, coordinates: null, locationState: "undecided" }), "Place not chosen yet");
  assert.equal(locationNotice({ ...stop, coordinates: null, locationState: "unmapped" }), "Not located on map");
  assert.equal(locationNotice({ ...stop, coordinates: null, locationState: "not_applicable" }), null);
  assert.equal(locationNotice({ ...stop, coordinates: null, category: "free time" }), null);
  assert.equal(locationNotice(stop), null);
});

test("map labels avoid collisions and edges while keeping the selected full name", () => {
  const frame = { left: 0, top: 0, right: 400, bottom: 280 };
  const labels = [
    { id: "one", box: { left: 30, top: 30, right: 140, bottom: 50 } },
    { id: "two", box: { left: 50, top: 35, right: 160, bottom: 55 } },
    { id: "three", box: { left: 200, top: 100, right: 300, bottom: 120 } },
    { id: "edge", box: { left: 350, top: 50, right: 450, bottom: 70 } },
  ];
  assert.deepEqual([...visibleMapLabels(labels, [], frame, null)], ["one", "three"]);
  assert.deepEqual([...visibleMapLabels(labels, [], frame, "two")], ["two", "three"]);
  assert.deepEqual([...visibleMapLabels(labels, [{ left: 220, top: 100, right: 250, bottom: 130 }], frame, "two")], ["two"]);
});
