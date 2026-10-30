import assert from "node:assert/strict";
import { test } from "node:test";
import { asSchema } from "ai";
import { createPlanInput, createBudgetInput, editPlanInput, editBudgetInput } from "../services/assistant/agent/tools/inputs";
import { examplePlan, fixturePricedBudget } from "./plan-fixture";

test("model creation contracts expose headers and scoped edits instead of whole artifacts", async () => {
  const plan = JSON.stringify(await asSchema(createPlanInput).jsonSchema);
  const budget = JSON.stringify(await asSchema(createBudgetInput).jsonSchema);
  assert.doesNotMatch(plan, /"itemIds"|"notes"|"startLocation"|"editToken"/);
  const properties = (await asSchema(createPlanInput).jsonSchema).properties!;
  assert.deepEqual(Object.keys((properties.plan as { properties: object }).properties).sort(), ["days", "startDate"]);
  assert.doesNotMatch(budget, /"entries"|"reviewed"/);
  assert.doesNotMatch(JSON.stringify(await asSchema(editPlanInput).jsonSchema), /replacePlan/);
  assert.doesNotMatch(JSON.stringify(await asSchema(editBudgetInput).jsonSchema), /replaceBudget/);
  const edit = await asSchema(editPlanInput).jsonSchema;
  assert.ok(!edit.required?.includes("authorizedItemIds"));
  assert.match(JSON.stringify(edit), /"maxItems":12/);
  assert.doesNotMatch(JSON.stringify(edit), /"basis"|"addItem"|"replacePlan"/);
  assert.match(JSON.stringify(edit), /addActivity/);
});

test("public contracts reject whole artifacts and internal operation shapes", async () => {
  const plan = examplePlan(), budget = fixturePricedBudget();
  const planInput = asSchema(createPlanInput), budgetInput = asSchema(createBudgetInput);
  const small = { plan: { startDate: null, days: plan.days.map(({ id, title }) => ({ id, title })) } };
  const parsed = await planInput.validate!(small);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal("userProvided" in parsed.value && parsed.value.userProvided, false);
  assert.equal((await planInput.validate!({ ...small, plan: { ...small.plan, invented: true } })).success, false);
  assert.equal((await planInput.validate!({ plan })).success, false);
  assert.equal((await planInput.validate!({ editToken: "current", plan })).success, false, "Public input rejects hidden whole-artifact input");
  assert.equal((await planInput.validate!({ editToken: "current", plan: { ...plan, notes: "not-an-array" } })).success, false);
  const { entries, ...settings } = budget;
  assert.ok(entries.length);
  assert.equal((await budgetInput.validate!({ budget: settings })).success, true);
  assert.equal((await budgetInput.validate!({ budget, reviewed: true })).success, false);
  assert.equal((await budgetInput.validate!({ editToken: "current", budget, reviewed: true })).success, false);
  assert.equal((await asSchema(editPlanInput).validate!({ operations: [{ type: "replacePlan", plan }] })).success, false);
  assert.equal((await asSchema(editPlanInput).validate!({ operations: [{ type: "addItem", item: plan.items["visit-1"], dayId: "day-1", index: null }] })).success, false);
  assert.equal((await asSchema(editBudgetInput).validate!({ operations: [{ type: "replaceBudget", budget, reviewed: true }] })).success, false);
  assert.equal((await budgetInput.validate!({ editToken: "current", budget: { ...settings, scope: "party", travelers: null } })).success, false);
  assert.equal((await asSchema(editPlanInput).validate!({ editToken: "current", operations: [{ type: "updateDay", id: "day-1", fields: { invented: true } }] })).success, false);
});

test("Public validation never injects a host field into the SDK's tool-call history", async () => {
  const schema = asSchema(editPlanInput);
  const input = { operations: [{ type: "updateActivity", id: "lunch", changes: { startTime: "12:30" } }] };
  const first = await schema.validate!(input); assert.equal(first.success, true);
  if (first.success) assert.equal("editToken" in first.value, false);
  assert.equal((await schema.validate!({ ...input, editToken: "stale" })).success, false);
});

test("scripted transport preserves names, arguments and call identity without repairing old input", async () => {
  const { functionStream } = await import("./plan-fixture");
  const input = { plan: examplePlan(), authorizedItemIds: [] };
  const response = functionStream("proposePlan", input);
  const replay = await response.clone().text();
  assert.equal(await response.text(), replay);
  const events = replay.split("\n\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  const item = events.find(event => event.type === "response.output_item.done").item;
  assert.equal(item.name, "proposePlan");
  assert.deepEqual(JSON.parse(item.arguments), input);
  assert.equal("editToken" in JSON.parse(item.arguments), false);
  assert.ok(item.call_id);
});

test("importing shared fixtures leaves process configuration unchanged", async () => {
  const { execFileSync } = await import("node:child_process");
  const script = `const before = JSON.stringify(process.env); await import('./tests/plan-fixture.ts'); if (JSON.stringify(process.env) !== before) throw new Error('Fixture mutated process configuration');`;
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: process.cwd(), stdio: "pipe" });
});
