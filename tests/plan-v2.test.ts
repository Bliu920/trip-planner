import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdit, catalogItem, userBasis } from "../lib/plan/commands";
import { fixture, places } from "./fixtures/plan/fixtures";
import { MockPlanStore } from "./fixtures/plan/mock";
import { PlanSession } from "../lib/plan/session";
import { presentPlan } from "../lib/plan/presentation/model";
import { inspectPlan } from "../lib/plan";

test("preview fixture uses the canonical schema and real catalog references", () => {
  const plan = fixture();
  assert.deepEqual(inspectPlan(plan, places).findings.filter(f => f.severity === "error"), []);
  assert.equal(plan.startDate, null);
  assert.equal(Object.keys(plan.items).length, 11);
});

test("moving and unscheduling keep one stable item and day order", () => {
  const plan = fixture(); const id = plan.days[0].itemIds[0];
  applyEdit(plan, { type: "move", id, dayId: "day-2" });
  assert.equal(plan.days[0].itemIds.includes(id), false);
  assert.equal(plan.days[1].itemIds.at(-1), id);
  applyEdit(plan, { type: "reorder", id, offset: -1 });
  assert.equal(plan.days[1].itemIds.at(-2), id);
  applyEdit(plan, { type: "move", id, dayId: "" });
  assert.ok(plan.items[id]);
  assert.ok(plan.days.every(day => !day.itemIds.includes(id)));
  assert.throws(() => applyEdit(plan, { type: "move", id, dayId: "unknown" }));
});

test("protected removal is rejected and safe removal cleans note references", () => {
  const plan = fixture(); const id = plan.days[0].itemIds[0];
  plan.items[id].keep = { basis: { kind: "user", sources: [], explanation: "Keep this place" } };
  assert.throws(() => applyEdit(plan, { type: "remove", id }), /protected/);
  plan.items[id].keep = null;
  plan.notes[0].relatedItemIds.push(id);
  applyEdit(plan, { type: "remove", id });
  assert.equal(plan.items[id], undefined);
  assert.deepEqual(plan.notes[0].relatedItemIds, []);
});

test("catalog add preserves unknown duration and uses canonical place identity", () => {
  const place = places.find(place => place.id === "place_027")!;
  const item = catalogItem(place, "added-place");
  assert.equal(item.timing.duration, null);
  const plan = fixture(true);
  applyEdit(plan, { type: "add", dayId: "day-1", item });
  assert.deepEqual(inspectPlan(plan, places).findings.filter(f => f.severity === "error"), []);
});

test("offline edit stays pending and retries exactly once", async () => {
  const store = new MockPlanStore(fixture(), 0); const session = new PlanSession("test", store);
  await session.refresh(); store.failNext("offline");
  assert.equal(await session.edit(plan => applyEdit(plan, { type: "day", id: "day-1", title: "My morning" })), false);
  const pending = session.getSnapshot().pending!;
  assert.equal(pending.plan.days[0].title, "My morning");
  assert.equal(await session.retry(), true);
  const result = await store.save("test", pending.revision, pending.plan, pending.requestId);
  assert.equal(result.snapshot.revision, 2);
  assert.equal(result.snapshot.plan?.days[0].title, "My morning");
});

test("conflict retains proposed edit until explicit reload", async () => {
  const store = new MockPlanStore(fixture(), 0); const session = new PlanSession("test", store);
  await session.refresh(); store.failNext("conflict");
  await session.edit(plan => applyEdit(plan, { type: "day", id: "day-1", title: "Unsaved title" }));
  assert.equal(session.getSnapshot().pending?.plan.days[0].title, "Unsaved title");
  assert.equal(await session.retry(), false);
  await session.refresh(true);
  assert.equal(session.getSnapshot().pending, null);
  assert.equal(session.getSnapshot().data?.plan?.days[2].title, "A slower afternoon by the Arno");
  assert.notEqual(session.getSnapshot().data?.plan?.days[0].title, "Unsaved title");
});


test("original preview activities retain the shared food, rest and departure categories", () => {
  const data = presentPlan(fixture(), places);
  const stops = data.days.flatMap(day => day.stops);
  assert.equal(stops.find(stop => stop.id === "market")?.kind, "food");
  assert.equal(stops.find(stop => stop.id === "check-in")?.kind, "stay");
  assert.equal(stops.find(stop => stop.id === "depart")?.kind, "departure");
  assert.equal(stops.find(stop => stop.id === "duomo")?.kind, "sight");
});


test("direct dates and suggested timing save with honest user provenance", async () => {
  const store = new MockPlanStore(fixture(), 0);
  const session = new PlanSession("test", store);
  await session.refresh();
  assert.equal(await session.edit(plan => applyEdit(plan, { type: "date", date: "2026-11-10" })), true);
  assert.deepEqual(session.getSnapshot().data?.plan?.startDate?.basis.sources, [{ type: "direct_edit" }]);
  assert.equal(await session.edit(plan => {
    const item = plan.items["duomo"];
    if (item.kind === "travel" || item.kind === "stay") throw new Error("Expected activity");
    item.timing.start = { date: null, time: "13:15", binding: "suggested", basis: userBasis };
  }), true);
  assert.equal((await store.load("test")).plan?.startDate?.value, "2026-11-10");
});

test("direct edit provenance does not waive evidence or fixed-date protection", () => {
  const previous = fixture();
  const item = previous.items["duomo"];
  if (item.kind === "travel" || item.kind === "stay" || !item.timing.start) throw new Error("Expected activity start");
  item.timing.start.binding = "fixed";
  item.timing.start.basis = { kind: "user", sources: [{ type: "legacy_notes" }], explanation: "Existing fixed arrangement" };
  const changed = structuredClone(previous);
  applyEdit(changed, { type: "date", date: "2026-11-10" });
  assert.ok(inspectPlan(changed, places, previous).findings.some(f => f.code === "protected"));
  changed.startDate!.basis.sources = [];
  assert.ok(inspectPlan(changed, places).findings.some(f => f.severity === "error" && f.message.includes("source")));
});
