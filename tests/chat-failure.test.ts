import assert from "node:assert/strict";
import { test } from "node:test";
import { replyFailureMessage, replyFailureText, type ReplyFailureCode } from "../lib/chat/failure";
import { failureCode } from "../services/chat/provider";
import type { ChatMessage } from "../lib/chat/types";

test("failure copy distinguishes time, planning allowance, service errors and unknown interruptions", () => {
  assert.match(replyFailureText("timeout"), /ran out of time/);
  assert.match(replyFailureText("step_limit"), /planning limit/);
  assert.match(replyFailureText("provider_limit"), /usage limit/);
  assert.equal(failureCode(new DOMException("timeout", "TimeoutError")), "timeout");
  assert.equal(failureCode(new DOMException("stopped", "AbortError")), "cancelled");
  const historic: ChatMessage = { id: "old", role: "assistant", parts: [] };
  assert.match(replyFailureMessage(historic), /reason was not recorded/);
  for (const code of ["timeout", "step_limit", "output_limit", "provider_error", "provider_limit", "storage_error", "cancelled", "incomplete", "empty_reply", "connection_lost"] as ReplyFailureCode[]) {
    assert.doesNotMatch(replyFailureText(code), /SDK|Supabase|schema|tool|revision|[\u2013\u2014]/);
  }
});

import { APICallError } from "ai";
import { providerDiagnostics } from "../services/chat/provider";
const apiError = (code: string | null, type = "insufficient_quota", headers: Record<string, string> = {}) => new APICallError({ message: "private provider message", url: "https://api.openai.com/v1/responses", requestBodyValues: { secret: "must not escape" }, statusCode: 429, responseHeaders: headers, data: { error: { code, type, message: "private provider message" } } });
test("429 copy distinguishes exhausted credits, spending caps, assigned usage and temporary limits", () => {
  for (const [code, text] of [["credit_balance_exhausted", /add credits/], ["insufficient_quota", /credits and limits/], ["project_spend_limit_exceeded", /billing limits/], ["organization_spend_limit_exceeded", /billing limits/], ["organization_usage_limit_exceeded", /service limits/]] as const) {
    const error = apiError(code), details = providerDiagnostics(error)!;
    assert.equal(failureCode(error), "provider_limit", "Existing SQL allowlist and historical codes stay compatible.");
    assert.match(replyFailureText("provider_limit", details), text);
    assert.doesNotMatch(replyFailureText("provider_limit", details), /try again later|wait a moment/i);
  }
  const rate = providerDiagnostics(apiError("rate_limit_exceeded", "rate_limit_error", { "Retry-After": "12.1" }))!;
  assert.equal(rate.providerReason, "rate_limit"); assert.equal(rate.retryAfterSeconds, 13);
  assert.match(replyFailureText("provider_limit", rate), /at least 13 seconds/);
  assert.equal(providerDiagnostics(apiError("slow_down", "rate_limit_error"))!.providerReason, "rate_limit");
  assert.equal(providerDiagnostics(apiError("project_spend_limit_exceeded", "insufficient_quota", { "retry-after": "5" }))!.retryAfterSeconds, undefined);
});
test("unknown 429 details remain ambiguous and logs never contain raw provider text", () => {
  const unknown = providerDiagnostics(apiError("secret_provider_value", "secret_type"))!;
  assert.equal(unknown.providerReason, undefined); assert.equal(unknown.providerCode, "unrecognized");
  assert.doesNotMatch(JSON.stringify(unknown), /secret_|private provider|must not escape/);
  assert.match(replyFailureText("provider_limit", unknown), /busy or has reached/);
  const fallback = new APICallError({ message: "private", url: "https://api.openai.com/v1/responses", requestBodyValues: {}, statusCode: 429, responseBody: JSON.stringify({ error: { code: "credit_balance_exhausted" } }) });
  assert.equal(providerDiagnostics(fallback)!.providerReason, "credits_exhausted");
  assert.equal(providerDiagnostics(new TypeError("Failed to fetch")), null);
});
test("restored chat uses the retained safe provider reason, legacy records remain honest", () => {
  const message: ChatMessage = { id: "failure", role: "assistant", parts: [{ type: "data-failure", data: { code: "provider_limit", steps: 0, elapsedMs: 2100, finishReason: null, providerReason: "credits_exhausted" } }] };
  assert.match(replyFailureMessage(message), /add credits/);
  assert.match(replyFailureText("provider_limit"), /busy or has reached/);
});


test("one request larger than a documented token allowance is not presented as a wait-only error", () => {
  const error = new APICallError({ message: "Request too large for private organization on tokens per min (TPM): Limit 10000, Requested 25000. Reduce tokens.", url: "https://api.openai.com/v1/responses", requestBodyValues: {}, statusCode: 429, responseHeaders: { "retry-after": "1" }, data: { error: { code: "rate_limit_exceeded", type: "rate_limit_error" } } });
  const details = providerDiagnostics(error)!;
  assert.equal(details.providerReason, "request_too_large"); assert.equal(details.limitTokens, 10000); assert.equal(details.requestedTokens, 25000);
  assert.equal(details.retryAfterSeconds, undefined);
  assert.match(replyFailureText("provider_limit", details), /request size or service limits/);
  assert.doesNotMatch(JSON.stringify(details), /private organization/);
});
