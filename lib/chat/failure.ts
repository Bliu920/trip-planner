import type { ChatMessage } from "./types";
import { actionBlocker, type SaveBlocker } from "@/lib/actions";

export type ReplyFailureCode =
  | "timeout"
  | "step_limit"
  | "output_limit"
  | "provider_limit"
  | "provider_error"
  | "storage_error"
  | "cancelled"
  | "incomplete"
  | "empty_reply"
  | "connection_lost";
export type AgentErrorDetail = {
  kind:
    | "tool_input"
    | "tool_choice"
    | "provider"
    | "parse"
    | "validation"
    | "abort"
    | "timeout"
    | "unfinished"
    | "storage"
    | "other";
  errorType: string;
  stage?:
    | "open_stream"
    | "read_stream"
    | "finish_reason"
    | "steps"
    | "verify"
    | "response"
    | "heartbeat"
    | "activity"
    | "activity_finish"
    | "final_reply"
    | "stream_consumer";
  statusCode?: number;
  diagnosticCode?: string;
  systemCode?: string;
  chunkType?: string;
  causeTypes?: string[];
  toolName?: string;
  issues?: { path: string; code: string; instruction: string }[];
  toolChoice?: "none" | "required" | "tool";
  responseTypes?: string[];
};
export type ReplyFailure = {
  code: ReplyFailureCode;
  steps: number;
  elapsedMs: number;
  finishReason: string | null;
  providerReason?:
    | "rate_limit"
    | "credits_exhausted"
    | "spend_limit"
    | "usage_limit"
    | "quota"
    | "request_too_large";
  progressSaved?: boolean;
  retryAfterSeconds?: number;
  limitTokens?: number;
  requestedTokens?: number;
  usedTokens?: number;
  termination?: AgentErrorDetail;
  inputFailure?: AgentErrorDetail;
  blocker?: SaveBlocker;
  progress?: {
    hasPlan: boolean;
    hasBudget: boolean;
    planItems: number;
    scheduledItems: number;
    populatedDays: number;
    budgetEntries: number;
    pricedEntries: number;
  };
};

const messages: Record<ReplyFailureCode, string> = {
  timeout: "The assistant ran out of time before finishing this reply. You can retry to continue.",
  step_limit:
    "The assistant reached its planning limit before finishing this reply. You can retry to continue.",
  output_limit:
    "The reply reached its length limit before it was finished. You can retry to continue.",
  provider_limit: "The assistant is busy or has reached its usage limit. Please try again later.",
  provider_error: "The assistant service failed while preparing this reply. Please try again.",
  storage_error:
    "The reply could not be saved. Reload this conversation to check its latest state.",
  cancelled: "This reply was stopped before it finished. You can retry to continue.",
  incomplete:
    "The assistant stopped before completing the requested changes. You can retry to continue.",
  empty_reply:
    "The assistant finished without a written reply. You can retry to get an explanation.",
  connection_lost:
    "The reply stopped unexpectedly, and the reason was not recorded. You can retry to continue.",
};

export function replyFailureText(
  code: ReplyFailureCode,
  details?: Pick<
    ReplyFailure,
    | "providerReason"
    | "retryAfterSeconds"
    | "termination"
    | "inputFailure"
    | "blocker"
    | "progressSaved"
  >,
): string {
  if (details?.progressSaved) {
    const reason = replyFailureText(code, { ...details, progressSaved: false });
    return `${reason} Some planning progress is saved. Retry to continue from it.`;
  }
  if (code === "provider_limit") {
    if (details?.providerReason === "request_too_large")
      return "This trip request exceeds the assistant's current capacity. The app owner needs to adjust the request size or service limits before retrying.";
    if (details?.providerReason === "quota")
      return "The assistant has reached a billing or usage limit. The app owner needs to check service credits and limits before retrying.";
    if (details?.providerReason === "credits_exhausted")
      return "The assistant has run out of service credits. The app owner needs to add credits before retrying.";
    if (details?.providerReason === "spend_limit")
      return "The assistant has reached its spending limit. The app owner needs to review billing limits before retrying.";
    if (details?.providerReason === "usage_limit")
      return "The assistant has reached its usage allowance. The app owner needs to review service limits before retrying.";
    if (details?.providerReason === "rate_limit") {
      const seconds = details.retryAfterSeconds;
      return (
        "The assistant has reached a temporary request limit. " +
        (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 && seconds <= 604800
          ? `Wait at least ${Math.ceil(seconds)} seconds before retrying.`
          : "Wait a moment before retrying.")
      );
    }
  }
  if (code === "incomplete" && details?.blocker === "budget_empty")
    return "The assistant stopped before adding costs to your trip estimate, so your itinerary and budget were not saved. Your message is saved. You can retry to continue.";
  if (code === "incomplete" && details?.blocker === "plan_empty")
    return "The assistant stopped before completing your daily arrangements. Your itinerary has not been saved. You can retry to continue.";
  if (code === "incomplete" && details?.inputFailure)
    return "The assistant could not correct some details before saving your changes. Your message is saved. You can retry to continue.";
  return messages[code] ?? messages.connection_lost;
}

export function replyFailureMessage(message: ChatMessage) {
  const failure = message.parts.findLast((part) => part.type === "data-failure");
  if (failure?.type === "data-failure") {
    const action = message.parts.findLast((part) => part.type === "data-action");
    const blocker = action?.type === "data-action" ? actionBlocker(action.data) : undefined;
    return replyFailureText(failure.data.code, {
      ...failure.data,
      ...(blocker ? { blocker } : {}),
    });
  }
  return messages.connection_lost;
}
