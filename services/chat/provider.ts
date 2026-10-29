import "server-only";
import { APICallError } from "ai";
import { replyFailureText, type ReplyFailureCode } from "@/lib/chat/failure";

export function failureCode(error: unknown): ReplyFailureCode {
  if (APICallError.isInstance(error) && error.statusCode === 429) return "provider_limit";
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "cancelled";
  return "provider_error";
}

export function chatErrorMessage(error: unknown) {
  return replyFailureText(failureCode(error));
}
