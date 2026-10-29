import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectPlan, dayDate, resolveLocation } from "../lib/plan/model";
import type { Basis } from "../lib/plan/types";
import catalog from "../data/italy.json";
import { examplePlan, assumption } from "./plan-fixture";
const errors = (
  value: unknown,
  previous = examplePlan(),
  authorized: string[] = [],
) =>
  inspectPlan(value, catalog, previous, authorized).findings.filter(
    (f) => f.severity === "error",
  );
const user: Basis = {
  kind: "user",
  sources: [{ type: "legacy_notes" }],
  explanation: null,
};
test("relative dates, stable IDs, real calendar offsets and uncertain durations", () => {
  const p = examplePlan();
  assert.deepEqual(errors(p), []);
  assert.equal(dayDate(p, 0), null);
  p.startDate = { value: "2028-02-28", basis: assumption };
  assert.equal(dayDate(p, 2), "2028-03-01");
  p.startDate.value = "2026-02-30";
  assert.ok(errors(p).some((f) => f.code === "shape"));
  assert.ok(errors({ ...examplePlan(), status: "ready" }).length);
});
test("catalog IDs, duplicate membership, dangling locations and cycles are rejected", () => {
  const p = examplePlan();
  p.days[1].itemIds = ["visit-1"];
  assert.ok(errors(p).some((f) => f.code === "duplicate"));
  p.days[1].itemIds = [];
  const item = p.items["visit-1"];
  assert.equal(item.kind, "visit");
  if (item.kind !== "visit") return;
  item.location = { type: "catalog", placeId: "invented" };
  assert.ok(errors(p).some((f) => f.code === "catalog"));
  item.location = { type: "item", itemId: item.id };
  assert.throws(() => resolveLocation(p, item.location), /depend on each other/);
  item.location = { type: "item", itemId: "missing" };
  assert.ok(errors(p).some((f) => f.code === "location"));
});
test("fixed bookings cannot move with the itinerary or disappear", () => {
  const old = examplePlan();
  old.startDate = { value: "2026-11-01", basis: user };
  const item = old.items["visit-1"];
  if (item.kind !== "visit") return;
  item.reservation = { state: "booked", basis: user };
  item.timing.start = {
    date: null,
    time: "10:00",
    binding: "fixed",
    basis: user,
  };
  const p = structuredClone(old);
  p.startDate!.value = "2026-11-02";
  assert.ok(errors(p, old).some((f) => f.code === "protected"));
  delete p.items["visit-1"];
  p.days[0].itemIds = [];
  assert.ok(errors(p, old, ["visit-1"]).some((f) => f.code === "protected"));
});
test("unassigning a fixed absolute booking preserves it and never cancels it", () => {
  const old = examplePlan();
  old.startDate = { value: "2026-11-01", basis: user };
  const item = old.items["visit-1"];
  if (item.kind !== "visit") return;
  item.reservation = { state: "booked", basis: user };
  item.timing.start = {
    date: "2026-11-01",
    time: "10:00",
    binding: "fixed",
    basis: user,
  };
  const p = structuredClone(old);
  p.days[0].itemIds = [];
  assert.deepEqual(errors(p, old), []);
  assert.equal(p.items["visit-1"].reservation?.state, "booked");
  p.days[1].itemIds = ["visit-1"];
  assert.ok(errors(p, old).some((f) => f.code === "date_membership"));
});
test("user hotel, generic meal area and missing transfer endpoints are represented honestly", () => {
  const p = examplePlan();
  p.items.hotel = {
    id: "hotel",
    title: "My booked hotel",
    kind: "stay",
    location: {
      type: "specified",
      label: "User hotel",
      latitude: null,
      longitude: null,
      basis: user,
    },
    coverage: {
      type: "dates",
      checkIn: { value: "2026-11-01", basis: user },
      checkOut: { value: "2026-11-04", basis: user },
    },
    optional: false,
    keep: null,
    reservation: { state: "booked", basis: user },
    reason: null,
  };
  assert.deepEqual(errors(p), []);
  p.days[0].itemIds.push("hotel");
  assert.ok(errors(p).some((f) => f.code === "stay"));
});
test("contradictory time endpoints, reservation evidence and optional bookings fail", () => {
  const p = examplePlan();
  const item = p.items["visit-1"];
  if (item.kind !== "visit") return;
  item.timing = {
    period: null,
    start: {
      date: null,
      time: "14:00",
      binding: "suggested",
      basis: assumption,
    },
    end: { date: null, time: "12:00", binding: "suggested", basis: assumption },
    duration: null,
  };
  assert.ok(errors(p).some((f) => f.code === "interval"));
  item.reservation = { state: "booked", basis: assumption };
  item.optional = true;
  assert.ok(errors(p).some((f) => f.code === "source"));
  assert.ok(errors(p).some((f) => f.code === "optional"));
});

test("overlapping scheduled intervals need a visible conflict, capacity remains qualified", () => {
  const p = examplePlan();
  const item = p.items["visit-1"];
  if (item.kind !== "visit") return;
  item.timing = {
    period: null,
    start: {
      date: null,
      time: "10:00",
      binding: "suggested",
      basis: assumption,
    },
    end: { date: null, time: "12:00", binding: "suggested", basis: assumption },
    duration: null,
  };
  p.items.second = { ...structuredClone(item), id: "second" };
  p.days[0].itemIds.push("second");
  assert.ok(errors(p).some((f) => f.code === "overlap"));
  p.notes.push({
    id: "conflict",
    kind: "conflict",
    text: "Two reported arrangements overlap; choose one before travel.",
    relatedItemIds: [item.id, "second"],
    sources: [],
  });
  assert.deepEqual(errors(p), []);
});

test("user-sourced notes cannot silently change under the same ID", () => {
  const old = examplePlan();
  old.notes.push({
    id: "access",
    kind: "action",
    text: "Avoid stairs",
    relatedItemIds: [],
    sources: [{ type: "legacy_notes" }],
  });
  const next = structuredClone(old);
  next.notes[0].text = "Stairs are fine";
  assert.ok(errors(next, old).some((f) => f.code === "protected_note"));
  assert.deepEqual(errors(next, old, ["access"]), []);
});

test("database key ordering cannot turn unchanged notes and bookings into protected edits", () => {
  const original = examplePlan();
  original.notes.push({ id: "user-note", kind: "uncertainty", text: "Confirm arrival time", relatedItemIds: ["visit-1"], sources: [{ type: "legacy_notes" }] });
  const visit = original.items["visit-1"];
  if (visit.kind !== "visit") return;
  visit.reservation = { state: "booked", basis: user };
  visit.timing.start = { date: null, time: "10:00", binding: "fixed", basis: user };
  function reordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reordered);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reordered(child)]));
  }
  const saved = reordered(original) as typeof original;
  assert.deepEqual(errors(original, saved), []);
  const changed = structuredClone(original); changed.days[1].title = "Changed independently";
  assert.deepEqual(errors(changed, saved), []);
  changed.notes[0].text = "Changed user fact";
  assert.ok(errors(changed, saved).some(f => f.code === "protected_note"));
  changed.notes[0] = original.notes[0];
  const changedVisit = changed.items["visit-1"];
  if (changedVisit.kind !== "visit") return;
  changedVisit.timing.start!.time = "11:00";
  assert.ok(errors(changed, saved).some(f => f.code === "protected"));
  changedVisit.timing.start = visit.timing.start;
  changedVisit.location = { type: "catalog", placeId: catalog[1].id };
  assert.ok(errors(changed, saved).some(f => f.code === "protected"));
});
