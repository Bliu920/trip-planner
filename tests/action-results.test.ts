import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { ActionRun, actionTool, succeeded, blocked } from "../services/assistant/agent/actions";
import { actionResultSchema, actionStateLabel, type ActionState } from "../lib/actions";
import { WorkspaceError } from "../services/workspace/database";

function host() {
  const states: ActionState[] = [];
  const env = { operationId: "operation", recordAction: async (state: ActionState) => { states.push(state); },
    verifyCommit: async () => ({ saved: false, receipt: null as { operation_id: string; revision: number; summary: string } | null, snapshot: {} }) };
  return { states, env, run: new ActionRun(env) };
}
const receipt = { operation_id: "operation", revision: 3, summary: "Saved" };

test("registered tools always return the checked envelope, including read failures", async () => {
  const { run } = host();
  const tool = actionTool(run, "read", { description: "Read", inputSchema: z.object({}), execute: () => { throw new WorkspaceError("Missing source", 400, "PLAN_SOURCE"); } });
  const value = await tool.execute!({}, { toolCallId: "call", messages: [], context: {} });
  const result = actionResultSchema.parse(value);
  assert.equal(result.outcome, "blocked");
  assert.equal(result.effect, "none");
  assert.equal(result.code, "PLAN_SOURCE");
  assert.equal(result.recovery.action, "correct_input");
  assert.equal(run.state, null, "read-only questions need no save");
});

test("staged work and persisted checkpoints never satisfy final commit", async () => {
  for (const kind of ["stage", "checkpoint"] as const) {
    const { run, states } = host();
    await run.execute(kind, "call", async () => succeeded({}, kind === "stage" ? "staged" : "persisted"));
    assert.equal(states[0].state, "in_progress");
    assert.equal((await run.verify())?.state, "unsaved");
    assert.equal(run.needsRecovery, true);
  }
});

test("lost write responses are verified by the stable operation receipt", async () => {
  const { run, env } = host();
  env.verifyCommit = async () => ({ saved: true, receipt, snapshot: {} });
  const result = await run.execute("commit", "transient-call", async () => { throw new TypeError("connection lost"); });
  assert.equal(result.operationId, "operation");
  assert.equal(result.outcome, "succeeded");
  assert.equal(result.effect, "persisted");
  assert.equal((await run.verify())?.state, "saved");
  assert.equal(run.needsRecovery, false);
});

test("a missing or unreachable receipt cannot turn an ambiguous write into a definitive failure", async () => {
  const { run, env } = host();
  const result = await run.execute("commit", "call", async () => { throw new Error("timeout"); });
  assert.equal(result.outcome, "unknown");
  assert.equal(result.recovery.action, "verify");
  assert.equal((await run.verify())?.state, "unknown");
  env.verifyCommit = async () => { throw new Error("offline"); };
  assert.match(actionStateLabel((await run.verify())!), /Save not confirmed/);
});

test("receipt mismatches and malformed adapter results cannot confirm saving", async () => {
  const { run } = host();
  const result = await run.execute("commit", "call", async () => succeeded({ receipt: { ...receipt, operation_id: "another-run" } }, "persisted"));
  assert.equal(result.outcome, "unknown");
  assert.notEqual(run.state?.state, "saved");
  const invalid = await run.execute("read", "call2", async () => succeeded({}, "persisted"));
  assert.equal(invalid.outcome, "failed");
});

test("tracking must be durable before any mutation executes", async () => {
  const { run, env } = host();
  env.recordAction = async () => { throw new Error("storage offline"); };
  let called = false;
  const result = await run.execute("commit", "call", async () => { called = true; return succeeded({ receipt }, "persisted"); });
  assert.equal(called, false);
  assert.equal(result.code, "ACTION_TRACKING_UNAVAILABLE");
  assert.equal(run.needsRecovery, false, "do not keep mutating without durable tracking");
});

test("conflicts remain actionable and expired runs stop recovery", async () => {
  const { run } = host();
  const conflict = await run.execute("commit", "call", async () => { throw new WorkspaceError("Changed", 409, "PLAN_CONFLICT"); });
  assert.equal(conflict.outcome, "blocked");
  assert.equal(conflict.recovery.action, "reload");
  const expired = await run.execute("commit", "call2", async () => { throw new WorkspaceError("Stopped", 409, "PLAN_ATTEMPT"); });
  assert.equal(expired.recovery.action, "stop");
  assert.equal(run.needsRecovery, false);
});

test("read errors after a confirmed commit do not erase its saved outcome", async () => {
  const { run } = host();
  await run.execute("commit", "call", async () => succeeded({ receipt }, "persisted"));
  await run.execute("read", "read", async () => blocked(null, "UNAVAILABLE", "Source unavailable", "retry"));
  assert.equal((await run.verify())?.state, "saved");
});

// Consumer status preserves outcomes.
test("consumer save status hides revision counters and preserves uncertainty", async () => {
  const { run } = host();
  await run.execute("stage", "call", async () => succeeded({}, "staged"));
  assert.match(actionStateLabel(run.state!), /not saved yet/);
  assert.doesNotMatch(actionStateLabel(run.state!), /staged|commit|revision|receipt/i);
  await run.execute("commit", "call", async () => succeeded({ receipt }, "persisted"));
  assert.equal(actionStateLabel(run.state!), "Changes saved.");
  const unknown: ActionState = { ...run.state!, state: "unknown" };
  assert.match(actionStateLabel(unknown), /not confirmed/);
});

test("consumer action failures never display internal recovery instructions", () => {
  const state: ActionState = { state: "unsaved", operationId: "private-id", revision: null, code: "ACTION_400", message: "Use stageDocument with contextDocumentId and commit the revision." };
  assert.doesNotMatch(actionStateLabel(state), /stageDocument|contextDocumentId|commit|revision|private-id/);
  assert.match(actionStateLabel({ ...state, code: "PLAN_CONFLICT" }), /Reload/);
  assert.match(actionStateLabel({ ...state, code: "CHECKPOINT_SAVED" }), /plan has not been saved/);
});

test("SDK call replay returns the accepted mutation once and rejects changed payloads", async () => {
  const { run } = host(); let executions = 0;
  const tool = actionTool(run, "stage", { description: "Add", inputSchema: z.object({ value: z.string() }), execute: async input => { executions++; return succeeded({ value: input.value }, "staged"); } });
  const options = { toolCallId: "same-call", messages: [], context: {} };
  const first = await tool.execute!({ value: "one" }, options);
  assert.deepEqual(await tool.execute!({ value: "one" }, options), first); assert.equal(executions, 1);
  const conflict = actionResultSchema.parse(await tool.execute!({ value: "two" }, options));
  assert.equal(conflict.code, "CALL_ID_CONFLICT"); assert.equal(executions, 1);
});
