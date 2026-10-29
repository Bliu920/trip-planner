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
