import assert from "node:assert/strict";
import { test } from "node:test";
import { asSchema } from "ai";
import { applyPlanOperations, inspectPlan, type ActivityItem, type Plan } from "../lib/plan";
import { applyBudgetOperations } from "../lib/budget";
import { authorPlan, authorBudget, authoringItem, authoringError } from "../services/assistant/agent/authoring";
import { actionDiagnostic } from "../services/assistant/agent/actions/results";
import { z } from "zod";
import { createPlanInput, editPlanInput, editBudgetInput } from "../services/assistant/agent/tools/inputs";
import type { AgentEnvironment } from "../services/assistant/agent/contracts";
import { examplePlan, fixturePricedBudget } from "./plan-fixture";
import catalog from "../data/italy.json";
import { DraftState } from "../services/workspace/draft";
import { EvidenceIndex, visibleSources } from "../services/workspace/evidence";

const source = { url: "https://example.com/test-rate", documentId: null, documentRevision: null, title: "Fixture source", checkedAt: "2026-10-27T00:00:00.000Z" };
const environment = {
  source: { type: "message", conversationId: "conversation", messageId: "user" },
  places: async (ids: string[]) => catalog.filter(place => ids.includes(place.id)),
  evidence: (id: string) => id === "source_one" ? source : undefined,
  evidenceSources: () => [{ sourceId: "source_one", ...source }],
} as unknown as AgentEnvironment;
const venue = { name: "Synthetic Hotel", address: "1 Example Street", city: "Rome", sourceId: "source_one" };
const messageEnvironment = (text: string, role = "user"): AgentEnvironment => ({
  ...environment,
  readMessage: async id => ({ id, conversationId: "original-conversation", role, parts: [{ type: "text", text }] }),
});

test("proposed routes cannot borrow user provenance from a city-only request", async () => {
  const plan = examplePlan(), before = structuredClone(plan);
  const env = messageEnvironment("Plan three days across Rome and Naples for my family.");
  await assert.rejects(authorPlan(plan, [{ type: "addActivity", id: "walk", dayId: "day-3", title: "Old town walk", kind: "free_time", userLocation: "Naples historic centre, around Via dei Tribunali", startTime: "15:00", durationMinutes: 90 }], env), error => (error as { code?: string }).code === "USER_LOCATION_SOURCE_REQUIRED");
  assert.deepEqual(plan, before);
  const next = applyPlanOperations(plan, (await authorPlan(plan, [{ type: "addActivity", id: "walk", dayId: "day-3", title: "Old town walk", kind: "free_time", area: "Naples historic centre, around Via dei Tribunali", startTime: "15:00", durationMinutes: 90 }], env)).operations);
  const item = next.items.walk as ActivityItem;
  assert.equal(item.location?.type, "area");
  if (item.location?.type === "area") { assert.equal(item.location.basis.kind, "assumption"); assert.deepEqual(item.location.basis.sources, []); }
  assert.equal(item.keep, null); assert.equal(item.reservation, null);
  assert.deepEqual((authoringItem(item, env) as { location: unknown }).location, { area: "Naples historic centre, around Via dei Tribunali" });
  assert.ok(!inspectPlan(next, catalog).findings.some(finding => finding.severity === "error" && finding.itemIds.includes("walk")));
});

test("actual user location survives a later clock-only edit with its original source", async () => {
  const env = messageEnvironment("Meet us at Roma Termini at noon.");
  const plan = examplePlan();
  const next = applyPlanOperations(plan, (await authorPlan(plan, [{ type: "addActivity", id: "meeting", dayId: "day-1", title: "Meet family", kind: "logistics", userLocation: "Roma Termini", userLocationMessageId: "earlier-user", startTime: "12:00", durationMinutes: 30 }], env)).operations);
  const item = next.items.meeting as ActivityItem;
  assert.equal(item.location?.type, "specified");
  if (item.location?.type === "specified") assert.deepEqual(item.location.basis.sources, [{ type: "message", messageId: "earlier-user", conversationId: "original-conversation" }]);
  const moved = applyPlanOperations(next, (await authorPlan(next, [{ type: "updateActivity", id: "meeting", changes: { startTime: "12:30" } }], environment)).operations);
  assert.deepEqual((moved.items.meeting as ActivityItem).location, item.location);
  assert.deepEqual((authoringItem(item, env) as { location: unknown }).location, { userLocation: "Roma Termini", userLocationMessageId: "earlier-user" });
});

test("assistant text cannot establish user provenance for stays or travel endpoints", async () => {
  const env = messageEnvironment("Synthetic Hotel is in Naples.", "assistant");
  await assert.rejects(authorPlan(examplePlan(), [{ type: "addStay", id: "stay", userLocation: "Synthetic Hotel", afterDayIds: ["day-1"] }], env), /real user message/);
  await assert.rejects(authorPlan(examplePlan(), [{ type: "addTravel", id: "transfer", dayId: "day-1", title: "Transfer", from: { userLocation: "Synthetic Hotel" }, startTime: "10:00", durationMinutes: 60 }], env), /real user message/);
  await assert.rejects(authorPlan(examplePlan(), [{ type: "updateDay", id: "day-1", changes: { startLocation: { userLocation: "Synthetic Hotel" } } }], env), /real user message/);
});

test("specified proposal readbacks do not upgrade assumptions or research into user facts", () => {
  const item = structuredClone(examplePlan().items["visit-1"]) as ActivityItem;
  item.location = { type: "specified", label: "Proposed district", latitude: null, longitude: null, basis: { kind: "assumption", sources: [], explanation: "Proposed" } };
  assert.deepEqual((authoringItem(item, environment) as { location: unknown }).location, { area: "Proposed district" });
  item.location.basis = { kind: "research", sources: [], explanation: "Researched" };
  const projected = (authoringItem(item, environment) as { location: Record<string, unknown> }).location;
  assert.equal(projected.origin, "research"); assert.equal(projected.userLocation, undefined);
});
test("short source handles retain exact identity, original check times and stable restored references", () => {
  const index = new EvidenceIndex();
  const first = index.web([source.url], source.checkedAt)[0];
  assert.equal(first.sourceId, "s1");
  assert.equal(index.web([source.url])[0].sourceId, first.sourceId);
  const second = index.web([source.url], "2026-10-28T00:00:00.000Z")[0];
  assert.equal(second.sourceId, "s2");
  const restored = new EvidenceIndex(); restored.restore(index.list());
  assert.deepEqual(restored.get(first.sourceId), index.get(first.sourceId));
  assert.equal(restored.web(["https://example.com/other"], source.checkedAt)[0].sourceId, "s3");
  assert.equal(restored.web([source.url], source.checkedAt)[0].sourceId, "s1");
});
async function withStay(): Promise<Plan> {
  const plan = examplePlan();
  return applyPlanOperations(plan, (await authorPlan(plan, [{ type: "addStay", id: "hotel", hotel: venue, afterDayIds: ["day-1"] }], environment)).operations);
}

test("advertised authoring protocol contains semantic commands and a plain date, without internal object contracts", async () => {
  const plan = JSON.stringify(await asSchema(editPlanInput).jsonSchema);
  assert.match(plan, /addActivity/); assert.match(plan, /updateActivity/); assert.match(plan, /setCommitment/);
  assert.doesNotMatch(plan, /"basis"|"minMinutes"|replacePlan|"addItem"/);
  const budget = JSON.stringify(await asSchema(editBudgetInput).jsonSchema);
  assert.match(budget, /priceScope/); assert.match(budget, /sourceId/); assert.doesNotMatch(budget, /"checkedAt"|replaceBudget/);
  const parsed = await asSchema(createPlanInput).validate!({ userProvided: true, plan: { startDate: "2026-11-05", days: examplePlan().days.map(({ id, title }) => ({ id, title })) } });
  assert.equal(parsed.success, true);
});
test("clock-only updates preserve duration evidence, venue, unrelated items and reservation state", async () => {
  const plan = examplePlan(), before = structuredClone(plan);
  const result = await authorPlan(plan, [{ type: "updateActivity", id: "visit-1", changes: { startTime: "10:30" } }], environment);
  const next = applyPlanOperations(plan, result.operations), item = next.items["visit-1"] as ActivityItem;
  assert.equal(item.timing.start?.time, "10:30");
  assert.deepEqual(item.timing.duration, (before.items["visit-1"] as ActivityItem).timing.duration);
  assert.deepEqual(item.location, (before.items["visit-1"] as ActivityItem).location);
  assert.deepEqual(next.days, before.days); assert.deepEqual(plan, before);
});
test("invalid second command leaves original input unchanged and identifies the failed command", async () => {
  const plan = examplePlan(), before = structuredClone(plan);
  await assert.rejects(authorPlan(plan, [
    { type: "updateActivity", id: "visit-1", changes: { startTime: "10:30" } },
    { type: "addActivity", id: "meal", dayId: "day-1", kind: "meal", title: "Synthetic meal", startTime: "12:00", durationMinutes: 60, venue: { ...venue, sourceId: "invented" } },
  ], environment), /Command 2.*sourceId/);
  assert.deepEqual(plan, before);
});
test("ordinary additions and clock corrections preserve chronological order without manual indices", async () => {
  const plan = examplePlan();
  const visit = plan.items["visit-1"] as ActivityItem;
  visit.timing.start = { time: "10:00", date: null, binding: "suggested", basis: visit.timing.duration!.basis };
  let next = applyPlanOperations(plan, (await authorPlan(plan, [{ type: "addActivity", id: "breakfast", dayId: "day-1", title: "Breakfast", kind: "meal", venue, startTime: "08:30", durationMinutes: 45 }], environment)).operations);
  assert.deepEqual(next.days[0].itemIds, ["breakfast", "visit-1"]);
  next = applyPlanOperations(next, (await authorPlan(next, [{ type: "updateActivity", id: "breakfast", changes: { startTime: "12:30" } }], environment)).operations);
  assert.deepEqual(next.days[0].itemIds, ["visit-1", "breakfast"]);
});
test("authoring failures preserve safe schema paths and classified constraints for diagnostics", () => {
  const parsed = z.strictObject({ timing: z.strictObject({ start: z.string() }) }).safeParse({ timing: { start: 12 }, "private-secret": "private-value" });
  if (parsed.success) throw new Error();
  const failure = authoringError(parsed.error, 2, { type: "addStay", id: "stay" });
  assert.equal(failure.code, "ITEM_SHAPE_INVALID");
  const detail = actionDiagnostic(failure.data);
  assert.ok(detail?.findings?.some(finding => finding.path?.join(".") === "timing.start"));
  assert.doesNotMatch(JSON.stringify(detail), /private-secret|private-value/);
  assert.equal(authoringError(new Error("Arrangement ID already exists."), 0, { type: "addActivity", id: "stop" }).code, "ARRANGEMENT_EXISTS");
});
test("lodging night changes update owned boundaries while preserving explicit arrival location", async () => {
  const plan = await withStay();
  plan.days[0].startLocation = { type: "specified", label: "Arrival station", latitude: null, longitude: null, basis: { kind: "user", sources: [environment.source], explanation: null } };
  const result = await authorPlan(plan, [{ type: "updateStay", id: "hotel", changes: { afterDayIds: ["day-2"] } }], environment);
  const next = applyPlanOperations(plan, result.operations);
  assert.deepEqual(next.days[0].startLocation, plan.days[0].startLocation);
  assert.equal(next.days[0].endLocation, null); assert.equal(next.days[1].startLocation, null);
  assert.deepEqual(next.days[1].endLocation, { type: "item", itemId: "hotel" });
  assert.deepEqual(next.days[2].startLocation, { type: "item", itemId: "hotel" });
});
test("included hotel meal uses the actual property and user evidence without inventing a restaurant", async () => {
  const plan = await withStay();
  const command = { type: "addActivity" as const, id: "breakfast", dayId: "day-2", kind: "meal" as const, title: "Included hotel breakfast", includedInStayId: "hotel", startTime: "08:00", durationMinutes: 45 };
  await assert.rejects(authorPlan(plan, [command], messageEnvironment("Plan a family trip to Rome.")), /real user message/);
  const result = await authorPlan(plan, [command], messageEnvironment("Breakfast is included at Synthetic Hotel."));
  const next = applyPlanOperations(plan, result.operations), item = next.items.breakfast as ActivityItem;
  assert.equal(item.location?.type, "specified");
  if (item.location?.type === "specified") { assert.equal(item.location.label, venue.name); assert.equal(item.location.basis.kind, "user"); }
});
test("arrival/departure commands represent clock points without invented durations", async () => {
  const plan = examplePlan();
  const result = await authorPlan(plan, [{ type: "addTravel", id: "arrival", title: "Arrive in Rome", dayId: "day-1", timingMode: "arrival", startTime: "08:30" }], environment);
  const next = applyPlanOperations(plan, result.operations), item = next.items.arrival;
  assert.equal(item.kind, "travel"); if (item.kind === "travel") assert.equal(item.timing.type, "arrival");
});
test("whole-party stay total is divided once, while cost-only metadata edits retain exact prices and evidence", () => {
  const budget = fixturePricedBudget(); budget.travelers = 2;
  const operations = authorBudget(budget, [{ type: "updateCost", id: "stay", changes: { min: 240, max: 240, priceScope: "whole_party", coveredTravelers: 2, unit: "stay", quantity: 1, pricing: "confirmed" } }], environment);
  const next = applyBudgetOperations(budget, operations).budget;
  assert.equal(next.entries[0].unitMin, 120); assert.equal(next.entries[0].unitMax, 120); assert.equal(next.entries[0].quantity, 1);
  const renamed = applyBudgetOperations(next, authorBudget(next, [{ type: "updateCost", id: "stay", changes: { label: "Booked shared stay" } }], environment)).budget;
  assert.equal(renamed.entries[0].pricing, "confirmed"); assert.deepEqual(renamed.entries[0].sources, next.entries[0].sources);
  assert.equal(renamed.entries[0].unitMin, 120);
});
test("editable projection exposes ordinary time and source handles without nested timing objects", async () => {
  const plan = await withStay();
  const projected = authoringItem(plan.items.hotel, environment);
  assert.match(JSON.stringify(projected), /source_one/);
  assert.doesNotMatch(JSON.stringify(projected), /"basis"|"accessedAt"/);
});
test("a title edit cannot clear a rejected time change, and fixing one target preserves other unresolved targets", () => {
  const draft = new DraftState();
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "a", changes: { startTime: "bad" } }, { type: "updateActivity", id: "b", changes: { venue: { sourceId: "bad" } } }] });
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "a", changes: { title: "New title" } }] }, true);
  assert.equal(draft.failures.size, 2);
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "a", changes: { startTime: "10:30" } }] }, true);
  assert.equal(draft.failures.size, 1); assert.throws(() => draft.assertReady(), /rejected changes/);
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "b", changes: { venue: { sourceId: "source_one" } } }] }, true);
  assert.doesNotThrow(() => draft.assertReady());
});
test("a rejected unaccepted creation can be replaced with a new generated ID in the same day and role", () => {
  const draft = new DraftState();
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "rejected-name", dayId: "day-1", kind: "meal", venue: { sourceId: "bad" } }] });
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "accepted-name", dayId: "day-2", kind: "meal" }] }, true);
  assert.equal(draft.failures.size, 1, "An unrelated day cannot hide the missing creation.");
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "accepted-name", dayId: "day-1", kind: "meal", startTime: "12:30", durationMinutes: 60 }] }, true);
  assert.doesNotThrow(() => draft.assertReady());
});


test("an uncommitted activity classification can be corrected without inventing user authorization", async () => {
  const original = examplePlan();
  const before = original.items["visit-1"] as ActivityItem;
  before.title = "Lunch"; before.location = { type: "catalog", placeId: "place_003" };
  const compiled = await authorPlan(original, [{ type: "updateActivity", id: "visit-1", changes: { kind: "meal" } }], environment);
  const changed = applyPlanOperations(original, compiled.operations);
  assert.equal(changed.items["visit-1"].kind, "meal");
  assert.ok(!inspectPlan(changed, catalog, original).findings.some(f => f.code === "protected"));
  for (const protection of ["booking", "keep", "clock"]) {
    const protectedPlan = structuredClone(original), item = protectedPlan.items["visit-1"] as ActivityItem;
    const basis = { kind: "user" as const, sources: [environment.source], explanation: null };
    if (protection === "booking") item.reservation = { state: "booked", basis };
    if (protection === "keep") item.keep = { basis };
    if (protection === "clock") item.timing.start = { time: "12:00", date: null, binding: "fixed", basis };
    const next = structuredClone(protectedPlan); next.items["visit-1"].kind = "meal";
    assert.ok(inspectPlan(next, catalog, protectedPlan).findings.some(f => f.code === "protected"));
  }
});
test("a complete replacement resolves all rejected fields on that target, preserving other targets", () => {
  const draft = new DraftState();
  draft.input("editPlan", { operations: [{ type: "replaceActivity", id: "dinner", title: "Dinner", reason: "Old rationale", startTime: "19:00", kind: "visit" }, { type: "updateActivity", id: "other", changes: { startTime: "bad" } }] });
  draft.input("editPlan", { operations: [{ type: "replaceActivity", id: "dinner", title: "Dinner", kind: "meal", startTime: "19:00", durationMinutes: 90 }] }, true);
  assert.equal(draft.failures.size, 1);
  assert.match([...draft.failures.keys()][0], /other/);
});
test("a corrected creation can replace the model's mistaken role, including restored legacy rejection keys", () => {
  const draft = new DraftState();
  draft.restore({ generation: 0, identity: "fixture", failures: [["old", "Correct this proposal"]], inputs: [["old", { family: "plan", id: "new-activity:day-1:rest", fields: ["complete"] }]] });
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "dinner", dayId: "day-2", kind: "meal" }] }, true);
  assert.equal(draft.failures.size, 1);
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "dinner", dayId: "day-1", kind: "meal" }] }, true);
  assert.doesNotThrow(() => draft.assertReady());
});


test("accepted corrections accumulate across calls without clearing another target", () => {
  const draft = new DraftState();
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "a", changes: { title: "Bad proposal", startTime: "bad" } }, { type: "updateActivity", id: "b", changes: { startTime: "bad" } }] });
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "a", changes: { title: "Correct title" } }] }, true);
  assert.equal(draft.failures.size, 2);
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "a", changes: { startTime: "12:00" } }] }, true);
  assert.equal(draft.failures.size, 1);
  assert.throws(() => draft.assertReady(), error => (error as { data?: { unresolved: { targetId: string; nextAction: string }[] } }).data?.unresolved[0].targetId === "b");
});


test("routine source context stays bounded while exact active and older handles remain authoritative", () => {
  const index = new EvidenceIndex();
  for (let i = 0; i < 100; i++) index.web([`https://example.com/${i}`], source.checkedAt);
  const budget = fixturePricedBudget(); budget.entries[0].sources = [{ ...source, url: "https://example.com/0", detail: "Used older evidence" }];
  const visible = visibleSources(index.list(), null, budget);
  assert.equal(visible.sourceCount, 100); assert.equal(visible.sourcesTruncated, true);
  assert.equal(visible.sources.length, 17); assert.ok(visible.sources.some(s => s.sourceId === "s1"));
  assert.equal(index.get("s30")?.url, "https://example.com/29");
  assert.ok(JSON.stringify(visible).length < JSON.stringify(index.list()).length / 3);
});


test("derived stay titles respect the display limit while keeping the complete provisional location", async () => {
  const plan = examplePlan(), area = "A proposed neighborhood with detailed accessibility requirements. ".repeat(5);
  const compiled = await authorPlan(plan, [{ type: "addStay", id: "long-base", area, afterDayIds: ["day-1"] }], environment);
  const changed = applyPlanOperations(plan, compiled.operations), stay = changed.items["long-base"];
  assert.equal(stay.title.length, 160);
  assert.equal(stay.kind === "stay" && stay.location.type === "area" && stay.location.label, area.trim());
});

test("initial phase policy prioritizes pricing before final review and keeps follow-up judgment", async () => {
  const { planningStage } = await import("../services/assistant/agent/context/completion");
  let plan: Plan | null = null, budget: ReturnType<typeof fixturePricedBudget> | null = null, needsReview = true;
  const env = { initialGeneration: true, artifacts: { readPlan: () => ({ plan }), readBudget: () => ({ budget }), manifest: () => ({ budget: { needsReview } }) } } as unknown as AgentEnvironment;
  assert.deepEqual(planningStage(env), { phase: "understand", effort: "medium" });
  plan = examplePlan(); plan.days[2].itemIds = [];
  assert.deepEqual(planningStage(env), { phase: "assemble", effort: "low" });
  plan = examplePlan();
  for (const index of [1, 2]) {
    const item = { ...structuredClone(plan.items["visit-1"]), id: `visit-${index + 1}` };
    plan.items[item.id] = item; plan.days[index].itemIds = [item.id];
  }
  assert.deepEqual(planningStage(env), { phase: "price", effort: "low" });
  budget = fixturePricedBudget();
  assert.deepEqual(planningStage(env), { phase: "price", effort: "low" });
  needsReview = false;
  assert.deepEqual(planningStage(env), { phase: "review", effort: "medium" });
  env.initialGeneration = false;
  assert.deepEqual(planningStage(env), { phase: "review", effort: "medium" });
});

test("missing-day rejected creation can be corrected without inventing an unassigned day", () => {
  const draft = new DraftState();
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "missing-day", title: "Candidate", kind: "visit" }] });
  assert.equal(draft.pendingCorrections()[0].targetId, "new-activity:unassigned");
  assert.doesNotMatch(draft.pendingCorrections()[0].nextAction, /in day unassigned/);
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "other", changes: { title: "Unrelated title" } }] }, true);
  assert.throws(() => draft.assertReady());
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "corrected", dayId: "real-day", title: "Candidate", kind: "visit" }] }, true);
  assert.doesNotThrow(() => draft.assertReady());
});

test("restored unknown-day creation accepts a complete equivalent replacement but retains other targets", () => {
  const first = new DraftState();
  first.input("editPlan", { operations: [{ type: "addActivity", id: "old-proposal", title: "Candidate" }, { type: "updateActivity", id: "fixed-target", changes: { startTime: "10:00" } }] });
  const restored = new DraftState(); restored.restore(first.snapshot());
  restored.input("editPlan", { operations: [{ type: "replaceActivity", id: "accepted-equivalent", title: "Candidate", kind: "visit", startTime: "09:00" }] }, true);
  assert.equal(restored.pendingCorrections().length, 1);
  assert.equal(restored.pendingCorrections()[0].targetId, "fixed-target");
  restored.input("editPlan", { operations: [{ type: "updateActivity", id: "fixed-target", changes: { startTime: "10:00" } }] }, true);
  assert.doesNotThrow(() => restored.assertReady());
});

test("unknown-day travel creation is resolved by its validated journey correction", () => {
  const draft = new DraftState();
  draft.input("editPlan", { operations: [{ type: "addTravel", id: "bad-journey", title: "Transfer" }] });
  assert.match(draft.pendingCorrections()[0].nextAction, /real day/);
  draft.input("editPlan", { operations: [{ type: "updateTravel", id: "accepted-journey", changes: { durationMinutes: 30 } }] }, true);
  assert.doesNotThrow(() => draft.assertReady());
});

test("rejected creation identity survives a correction to an invalid day or cost category", () => {
  const draft = new DraftState();
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "same-proposal", dayId: "invalid-day", title: "Candidate" }] });
  assert.match(draft.pendingCorrections()[0].nextAction, /Correct proposal same-proposal/);
  draft.input("editPlan", { operations: [{ type: "addActivity", id: "same-proposal", dayId: "real-day", title: "Candidate" }] }, true);
  assert.doesNotThrow(() => draft.assertReady());
  draft.input("editBudget", { operations: [{ type: "addCost", id: "same-cost", category: "invalid-category" }] });
  const restored = new DraftState(); restored.restore(draft.snapshot());
  restored.input("editBudget", { operations: [{ type: "addCost", id: "same-cost", category: "food" }] }, true);
  assert.doesNotThrow(() => restored.assertReady());
});

test("unidentifiable malformed commands defer to artifact recovery instead of inventing targets", () => {
  const draft = new DraftState();
  assert.equal(draft.input("editPlan", { operations: [{ type: "updateActivity", id: null, changes: { startTime: "10:00" } }] }), false);
  assert.equal(draft.input("editPlan", { operations: [{ type: "addActivity", id: "private invalid identity", dayId: "bad scope" }] }), false);
  assert.deepEqual(draft.pendingCorrections(), []);
});

test("a validated equivalent or corrected empty-field command resolves only its proposal", () => {
  const draft = new DraftState();
  draft.input("editPlan", { operations: [{ type: "addStay", id: "hotel", afterDayIds: ["wrong-day"] }] });
  draft.input("editPlan", { operations: [{ type: "updateStay", id: "hotel", changes: { afterDayIds: ["real-day"] } }] }, true);
  assert.doesNotThrow(() => draft.assertReady());
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "activity", changes: { unsupportedField: "malformed" } }] });
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "other", changes: { title: "Other" } }] }, true);
  assert.throws(() => draft.assertReady());
  draft.input("editPlan", { operations: [{ type: "updateActivity", id: "activity", changes: { title: "Corrected" } }] }, true);
  assert.doesNotThrow(() => draft.assertReady());
});
