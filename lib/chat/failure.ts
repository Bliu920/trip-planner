import type { ChatMessage } from "./types";

export type ReplyFailureCode = "timeout" | "step_limit" | "output_limit" | "provider_limit" | "provider_error" | "storage_error" | "cancelled" | "incomplete" | "empty_reply" | "connection_lost";
export type ReplyFailure = {
  code: ReplyFailureCode;
  steps: number;
  elapsedMs: number;
  finishReason: string | null;
};

const messages: Record<ReplyFailureCode, string> = {
  timeout: "The assistant ran out of time before finishing this reply. You can retry to continue.",
  step_limit: "The assistant reached its planning limit before finishing this reply. You can retry to continue.",
  output_limit: "The reply reached its length limit before it was finished. You can retry to continue.",
  provider_limit: "The assistant is busy or has reached its usage limit. Please try again later.",
  provider_error: "The assistant service failed while preparing this reply. Please try again.",
  storage_error: "The reply could not be saved. Reload this conversation to check its latest state.",
  cancelled: "This reply was stopped before it finished. You can retry to continue.",
  incomplete: "The assistant stopped before completing the requested changes. You can retry to continue.",
  empty_reply: "The assistant finished without a written reply. You can retry to get an explanation.",
  connection_lost: "The reply stopped unexpectedly, and the reason was not recorded. You can retry to continue.",
};

export function replyFailureText(code: ReplyFailureCode) {
  return messages[code] ?? messages.connection_lost;
}

export function replyFailureMessage(message: ChatMessage) {
  const failure = message.parts.findLast(part => part.type === "data-failure");
  if (failure?.type === "data-failure") return replyFailureText(failure.data.code);
  return messages.connection_lost;
}
