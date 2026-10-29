import assert from "node:assert/strict";
import { test } from "node:test";
import { presentPlan, findStop } from "../lib/plan/presentation/model";
import { examplePlan, assumption } from "./plan-fixture";
import catalog from "../data/italy.json";

test("sparse saved plans do not inherit preview budgets, photos or party assumptions", () => {
  const plan = examplePlan();
  const before = structuredClone(plan);
  const result = presentPlan(plan, catalog);
  assert.deepEqual(plan, before);
  assert.equal(result.title, catalog[0].city);
  assert.deepEqual(result.meta, ["3 days"]);
  assert.equal(result.budget, null);
  assert.equal(result.days[0].photo, null);
  assert.equal(result.days[0].walkingLabel, null);
  assert.equal(result.days[0].date, null);
  assert.equal(result.days[0].stayLabel, null);
  assert.deepEqual(result.days[1].stops, []);
  assert.equal(result.days[0].stops[0].time, "morning");
  assert.equal(result.days[0].stops[0].duration, "1 hr to 1 hr 30 min");
});

test("stable item IDs follow reassignment and preserve unscheduled items, stays and notes", () => {
  const plan = examplePlan();
  plan.days[0].itemIds = [];
  plan.items.stay = {
    id: "stay", kind: "stay", title: "Guesthouse", reason: null,
    optional: false, keep: null, reservation: null,
    location: { type: "area", label: "City center", basis: assumption },
    coverage: { type: "nights", afterDayIds: ["day-2"], basis: assumption },
  };
  plan.notes.push({ id: "note", kind: "uncertainty", text: "Arrival unknown", relatedItemIds: [], sources: [] });
  const result = presentPlan(plan, catalog);
  assert.deepEqual(result.otherItems.map(item => item.id), ["visit-1", "stay"]);
  assert.equal(result.days[0].stayLabel, null);
  assert.equal(result.days[1].stayLabel, "Guesthouse");
  assert.match(findStop(result, "stay")!.note, /Nights after Day 2/);
  assert.deepEqual(result.notes, [{ id: "note", text: "Arrival unknown" }]);
  plan.days[2].itemIds = ["visit-1"];
  const moved = presentPlan(plan, catalog);
  assert.equal(moved.days[2].stops[0].id, "visit-1");
  assert.deepEqual(moved.otherItems.map(item => item.id), ["stay"]);
});

test("calendar stays exclude checkout night and missing dates do not imply coverage", () => {
  const plan = examplePlan();
  plan.startDate = { value: "2028-02-28", basis: assumption };
  plan.items.stay = {
    id: "stay", kind: "stay", title: "Guesthouse", reason: null,
    optional: false, keep: null, reservation: null,
    location: { type: "area", label: "City center", basis: assumption },
    coverage: { type: "dates", checkIn: plan.startDate, checkOut: { value: "2028-03-01", basis: assumption } },
  };
  let result = presentPlan(plan, catalog);
  assert.deepEqual(result.days.map(day => day.date), ["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.deepEqual(result.days.map(day => day.stayLabel), ["Guesthouse", "Guesthouse", null]);
  plan.startDate = null;
  result = presentPlan(plan, catalog);
  assert.ok(result.days.every(day => day.stayLabel === null));
  assert.match(result.otherItems[0].note, /2028-03-01/);
});

test("arrival endpoints and fixed end times retain protection in presentation", () => {
  const plan = examplePlan();
  const point = { date: null, time: "10:30", binding: "fixed" as const, basis: assumption };
  plan.items.train = {
    id: "train", kind: "travel", title: "Train arrival", reason: null,
    optional: true, keep: null, reservation: null,
    from: null, to: null, mode: "train", timing: { type: "arrival", at: point },
  };
  plan.days[0].itemIds.unshift("train");
  const visit = plan.items["visit-1"];
  if (visit.kind !== "visit") throw new Error("Unexpected fixture");
  visit.optional = true;
  visit.timing.end = point;
  const result = presentPlan(plan, catalog);
  assert.deepEqual(result.days[0].stops.map(stop => stop.id), ["train", "visit-1"]);
  assert.equal(result.days[0].stops[0].time, "10:30");
  assert.ok(result.days[0].stops.every(stop => stop.canToggle === false));
  visit.timing.end = null;
  assert.equal(findStop(presentPlan(plan, catalog), visit.id)?.canToggle, true);
  visit.keep = { basis: assumption };
  assert.equal(findStop(presentPlan(plan, catalog), visit.id)?.canToggle, false);
  visit.keep = null;
  visit.reservation = { state: "booked", basis: assumption };
  assert.equal(findStop(presentPlan(plan, catalog), visit.id)?.canToggle, false);
});

test("day details resolve real coordinates and preserve recorded evidence without guessed costs", () => {
  const plan = examplePlan();
  const item = plan.items["visit-1"];
  if (item.kind !== "visit") throw new Error("Unexpected fixture");
  item.timing.end = { time: "12:30", date: null, binding: "fixed", basis: assumption };
  plan.notes.push({ id: "arrival-note", kind: "action", text: "Arrive early for entry", relatedItemIds: [item.id], sources: [{ type: "web", url: "https://example.com/entry", accessedAt: "2026-10-28" }] });
  const photo = { src: "https://example.com/photo.jpg", alt: "Place", credit: "Photographer", creditUrl: "https://example.com/photo" };
  const stop = presentPlan(plan, catalog, { [catalog[0].id]: photo }).days[0].stops[0];
  assert.deepEqual(stop.coordinates, [catalog[0].latitude, catalog[0].longitude]);
  assert.equal(stop.photo, photo);
  assert.equal(stop.endTime, "12:30");
  assert.ok(stop.reminders?.some(reminder => reminder.text === "Arrive early for entry"));
  assert.ok(stop.details?.some(detail => detail.label === "Timing"));
  assert.equal(stop.sources?.[0].url, "https://example.com/entry");
  assert.equal(stop.priceLabel, undefined);
  assert.equal(stop.next, undefined);
});

test("area locations never become map pins and referenced locations follow their owner", () => {
  const plan = examplePlan();
  const item = plan.items["visit-1"];
  if (item.kind !== "visit") throw new Error("Unexpected fixture");
  plan.items.second = { ...structuredClone(item), id: "second", location: { type: "item", itemId: item.id } };
  plan.days[1].itemIds = ["second"];
  assert.deepEqual(presentPlan(plan, catalog).days[1].stops[0].coordinates, [catalog[0].latitude, catalog[0].longitude]);
  item.location = { type: "area", label: "Near the hotel", basis: assumption };
  const stop = presentPlan(plan, catalog).days[1].stops[0];
  assert.equal(stop.coordinates, null);
  assert.equal(stop.locationLabel, "Near the hotel");
  assert.equal(stop.photo, null);
  item.location = { type: "specified", label: "Hotel", latitude: 0, longitude: 0, basis: assumption };
  assert.deepEqual(presentPlan(plan, catalog).days[1].stops[0].coordinates, [0, 0]);
  item.location.latitude = 91;
  assert.equal(presentPlan(plan, catalog).days[1].stops[0].coordinates, null);
});


test("lodging and necessary reminders project to their days without exposing background assumptions", () => {
  const plan = examplePlan();
  plan.items.stay = { id: "stay", kind: "stay", title: "Proposed central base", reason: null,
    optional: false, keep: null, reservation: null, location: { type: "area", label: "City center", basis: assumption },
    coverage: { type: "nights", afterDayIds: ["day-1", "day-2"], basis: assumption } };
  plan.notes = [
    { id: "research", kind: "assumption", text: "Background comparison", relatedItemIds: [], sources: [] },
    { id: "entry", kind: "action", text: "Reserve entry", relatedItemIds: ["visit-1"], sources: [{ type: "web", url: "https://example.com/tickets", accessedAt: "2026-10-29T00:00:00.000Z" }] },
    { id: "stay-check", kind: "uncertainty", text: "Confirm check-in time", relatedItemIds: ["stay"], sources: [] },
    { id: "trip-check", kind: "action", text: "Confirm arrival time", relatedItemIds: [], sources: [] },
  ];
  const before = structuredClone(plan), result = presentPlan(plan, catalog);
  assert.deepEqual(plan, before);
  assert.deepEqual(result.days.map(day => day.stays?.map(stay => stay.id)), [["stay"], ["stay"], []]);
  assert.deepEqual(result.days.map(day => day.reminders?.map(note => note.id)), [["entry", "stay-check"], ["stay-check"], []]);
  assert.deepEqual(result.reminders?.map(note => note.id), ["trip-check"]);
  assert.equal(result.days[0].stops[0].reminders?.[0].sources?.[0].url, "https://example.com/tickets");
  assert.ok(result.days[0].stays?.[0].details?.some(detail => detail.label === "Nights" && /Day 2/.test(detail.value)));
  assert.deepEqual(result.pendingItems, []);
});

test("unassigned bookings and stays remain actionable while ordinary candidate items stay off the itinerary", () => {
  const plan = examplePlan(); plan.days[0].itemIds = [];
  plan.items.stay = { id: "stay", kind: "stay", title: "Stay awaiting nights", reason: null,
    optional: false, keep: null, reservation: null, location: { type: "area", label: "City center", basis: assumption }, coverage: null };
  let result = presentPlan(plan, catalog);
  assert.deepEqual(result.pendingItems?.map(item => item.id), ["stay"]);
  const visit = plan.items["visit-1"]; visit.reservation = { state: "booked", basis: assumption };
  result = presentPlan(plan, catalog);
  assert.deepEqual(result.pendingItems?.map(item => item.id), ["visit-1", "stay"]);
  assert.equal(findStop(result, "visit-1")?.bookingLabel, "Reservation: booked");
  plan.days[1].itemIds = ["visit-1"];
  assert.deepEqual(presentPlan(plan, catalog).pendingItems?.map(item => item.id), ["stay"]);
});
