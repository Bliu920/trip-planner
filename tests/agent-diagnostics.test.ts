import assert from "node:assert/strict";
import { test } from "node:test";
import { AISDKError, InvalidToolInputError, ToolChoiceViolationError, TypeValidationError, UIMessageStreamError } from "ai";
import { z } from "zod";
import { agentErrorDetail } from "../services/assistant/agent/diagnostics";

test("invalid tool input retains actionable schema paths without raw values or private messages", () => {
  const schema = z.object({ plan: z.object({ items: z.record(z.string(), z.object({ timing: z.object({ start: z.object({ binding: z.enum(["fixed", "suggested"]) }) }) })) }) });
  const input = { plan: { items: { "private-item-label": { timing: { start: { binding: "private-invalid-value" } } } } } };
  const parsed = schema.safeParse(input); assert.equal(parsed.success, false);
  if (parsed.success) throw new Error();
  const cause = new TypeValidationError({ value: input, cause: parsed.error });
  const error = new InvalidToolInputError({ toolName: "createPlan", toolInput: JSON.stringify(input), cause, message: "private tool message sk-secret" });
  const detail = agentErrorDetail(error);
  assert.equal(detail.kind, "tool_input");
  assert.deepEqual(detail.causeTypes, ["AI_TypeValidationError", "ZodError"]);
  assert.equal(detail.issues?.[0].path, "plan.items.*.timing.start.binding");
  assert.match(detail.issues![0].instruction, /fixed, suggested/);
  assert.doesNotMatch(JSON.stringify(detail), /private-|sk-secret/);
});

test("forced tool termination records the violated requirement and returned content types only", () => {
  const error = new ToolChoiceViolationError({ toolChoice: { type: "required" }, finishReason: "stop", provider: "openai", modelId: "gpt-6-luna",
    content: [{ type: "text", text: "private draft explanation" }] });
  const detail = agentErrorDetail(error);
  assert.equal(detail.kind, "tool_choice"); assert.equal(detail.toolChoice, "required");
  assert.deepEqual(detail.responseTypes, ["text"]);
  assert.doesNotMatch(JSON.stringify(detail), /private draft/);
});

test("compatible input variants retain concrete validation paths inside unions", () => {
  const schema = z.union([
    z.strictObject({ plan: z.strictObject({ days: z.tuple([z.string(), z.string(), z.string()]) }) }),
    z.strictObject({ plan: z.strictObject({ days: z.tuple([z.string(), z.string(), z.string()]), items: z.record(z.string(), z.string()) }) }),
  ]);
  const result = schema.safeParse({ plan: { days: "private-invalid-value", items: {} } });
  if (result.success) throw new Error("Expected invalid tuple.");
  const detail = agentErrorDetail(new TypeValidationError({ value: null, cause: result.error }));
  assert.ok(detail.issues?.some(issue => issue.path === "plan.days" && issue.instruction === "Expected tuple."));
  assert.doesNotMatch(JSON.stringify(detail), /private-invalid/);
});
test("SDK stream failures retain their actual class and chunk type without chunk IDs or prose", () => {
  const error = new UIMessageStreamError({ chunkType: "text-delta", chunkId: "private-id", message: "private content" });
  const detail = agentErrorDetail(error);
  assert.equal(detail.errorType, "AI_UIMessageStreamError");
  assert.equal(detail.chunkType, "text-delta");
  assert.doesNotMatch(JSON.stringify(detail), /private/);
  assert.equal(agentErrorDetail(new AISDKError({ name: "AI_StreamAlreadyConsumedError", message: "private content" })).errorType, "AI_StreamAlreadyConsumedError");
});
test("transport and string stream failures retain known facts without exposing raw errors", () => {
  const error = new TypeError("fetch failed", { cause: Object.assign(new Error("private host"), { code: "ECONNRESET" }) });
  assert.equal(agentErrorDetail(error).systemCode, "ECONNRESET");
  assert.equal(agentErrorDetail(error).diagnosticCode, "NETWORK_FETCH_FAILED");
  const detail = agentErrorDetail("text part private-id not found");
  assert.equal(detail.errorType, "ThrownString"); assert.equal(detail.diagnosticCode, "STREAM_PART_MISSING");
  assert.doesNotMatch(JSON.stringify(detail), /private-id|private host/);
});
test("oversized command batches report the actual numeric limit", () => {
  const parsed = z.strictObject({ operations: z.array(z.string()).max(12) }).safeParse({ operations: Array(13).fill("private-value") });
  if (parsed.success) throw new Error();
  const detail = agentErrorDetail(parsed.error);
  assert.equal(detail.issues?.[0].instruction, "Use at most 12 items.");
  assert.doesNotMatch(JSON.stringify(detail), /private-value/);
});

test("published closing task keeps the request as context and removes obsolete execution history", async () => {
  const { closingMessages } = await import("../services/assistant/agent/context/completion");
  const messages = closingMessages([{ role: "user", content: "Replace dinner near our hotel." }, { role: "assistant", content: "Old corrected failure" }]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "user");
  assert.match(String(messages[0].content), /already saved operation/);
  assert.match(String(messages[0].content), /Replace dinner near our hotel/);
  assert.doesNotMatch(JSON.stringify(messages), /Old corrected failure/);
});

test("Authoring diagnostics retain declared semantic field names while excluding argument values", async () => {
  const { planAuthoringInput } = await import("../services/assistant/agent/authoring/inputs");
  const result = planAuthoringInput.safeParse({ operations: [{ type: "addActivity", id: "private-id", title: "private-title", kind: "meal", startTime: "09:00", venue: { name: "private-name", address: "private-address", city: "private-city", sourceId: null } }] });
  if (result.success) throw new Error();
  const detail = agentErrorDetail(result.error);
  assert.ok(detail.issues?.some(issue => issue.path === "operations.0.dayId"));
  assert.ok(detail.issues?.some(issue => issue.path === "operations.0.venue.sourceId"));
  assert.doesNotMatch(JSON.stringify(detail), /private-/);
});

test("context telemetry measures opaque reasoning separately without logging content", async () => {
  const { contextSizes } = await import("../services/assistant/agent/diagnostics");
  const result = contextSizes([{ role: "user", content: "private-request" }, { role: "assistant", content: [{ type: "reasoning", text: "", providerOptions: { openai: { reasoningEncryptedContent: "private-opaque-state" } } }, { type: "text", text: "private-response" }] }]);
  assert.equal(result.historyMessages, 2);
  assert.ok(result.partBytes.reasoning > 0);
  assert.ok(result.partBytes.text > 0);
  assert.equal(result.partBytes.toolResult, 0);
  assert.doesNotMatch(JSON.stringify(result), /private-|opaque-state/);
});
