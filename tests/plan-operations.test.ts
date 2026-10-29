import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPlanOperations, inspectPlan } from "../lib/plan";
import { places } from "../services/plans";
import { examplePlan } from "./plan-fixture";
test("local Plan edits preserve unrelated data and identity", () => {
  const plan = examplePlan();
  const next = applyPlanOperations(plan, [{ type: "updateDay", id: "day-2", fields: { title: "Easy afternoon" } }, { type: "updateItem", id: "visit-1", fields: { optional: true } }]);
  assert.deepEqual(next.days[0], plan.days[0]); assert.deepEqual(next.days[2], plan.days[2]);
  assert.equal(next.items["visit-1"].optional, true); assert.equal(plan.items["visit-1"].optional, false);
  assert.deepEqual("timing" in next.items["visit-1"] && next.items["visit-1"].timing, "timing" in plan.items["visit-1"] && plan.items["visit-1"].timing);
});
test("Plan operation failure rolls back the batch and rejects unknown fields", () => {
  const plan = examplePlan(), before = structuredClone(plan);
  assert.throws(() => applyPlanOperations(plan, [{ type: "updateDay", id: "day-2", fields: { title: "Changed" } }, { type: "removeItem", id: "missing" }]));
  assert.deepEqual(plan, before);
  assert.throws(() => applyPlanOperations(plan, [{ type: "updateItem", id: "visit-1", fields: { arbitrary: true } }] as never));
  assert.throws(() => applyPlanOperations(plan, [{ type: "reorderDays", ids: ["day-1", "day-1", "day-3"] }]));
});
test("removing an item never silently deletes notes or repairs references", () => {
  const plan = examplePlan(); plan.notes.push({ id: "note", kind: "action", text: "Check hours", relatedItemIds: ["visit-1"], sources: [] });
  const invalid = applyPlanOperations(plan, [{ type: "removeItem", id: "visit-1" }]);
  assert.equal(invalid.notes[0].relatedItemIds[0], "visit-1");
  assert.ok(inspectPlan(invalid, places).findings.some(finding => finding.code === "note_reference"));
  const repaired = applyPlanOperations(plan, [{ type: "removeItem", id: "visit-1" }, { type: "updateNote", id: "note", fields: { relatedItemIds: [] } }]);
  assert.equal(inspectPlan(repaired, places).findings.some(finding => finding.severity === "error"), false);
});
