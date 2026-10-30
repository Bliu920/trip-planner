"use client";

import { Button } from "@/components/ui/button";
import { AgentMessage } from "@/lib/agent";
import { SavedAttachments } from "@/lib/attachments";
import { PlaceChips } from "@/lib/place-references";
import { activityEntries, activityRun } from "@/lib/activity";
import { WorkProgress } from "@/lib/work-progress";
import { actionStateLabel, actionResultSchema } from "@/lib/actions";
import { replyFailureMessage } from "@/lib/chat/failure";
import { MarkdownText } from "@/lib/markdown";
import { MessageText } from "./text";
import type { TranscriptItem } from "./state";

export function ChatResponse({
  item,
  reference,
  onRetry,
}: {
  item: TranscriptItem;
  reference: string;
  onRetry?: () => void;
}) {
  const { message, active, progress } = item;
  const assistant = message.role === "assistant";
  const entries = activityEntries(message.parts);
  const run = activityRun(message.parts);
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const status = message.metadata?.status;
  const transient = assistant && active && status !== "complete";
  const saved = message.parts.find((part) => part.type === "data-commit");
  const action = message.parts.findLast((part) => part.type === "data-action");
  const committed = message.parts.some((part) => {
    if (part.type !== "tool-commit" || !("output" in part)) return false;
    const result = actionResultSchema.safeParse(part.output);
    return (
      result.success && result.data.outcome === "succeeded" && result.data.effect === "persisted"
    );
  });
  const showReceipt = !transient && !!(saved || committed);
  const showAction = !transient && action?.type === "data-action";
  const showIncomplete =
    assistant && status && status !== "complete" && status !== "streaming" && !active;
  const places = message.parts
    .filter((part) => part.type === "data-place")
    .map((part) => part.data);
  const files = message.parts
    .filter((part) => part.type === "data-attachment")
    .map((part) => part.data);
  if (
    !text &&
    !entries.length &&
    !run &&
    !progress &&
    !showIncomplete &&
    !showReceipt &&
    !showAction &&
    !places.length &&
    !files.length
  )
    return null;

  // Own response presentation order.
  return (
    <AgentMessage
      role={assistant ? "assistant" : "user"}
      feedbackEnabled={false}
      copyText={assistant && !transient ? text : undefined}
      onRetry={assistant ? onRetry : undefined}
    >
      <div data-chat-response={assistant ? "assistant" : "user"}>
        {text &&
          (assistant ? (
            <MarkdownText text={text} id={`chat-message-${message.id}`} />
          ) : (
            <MessageText text={text} id={`chat-message-${message.id}`} collapsible />
          ))}
        {showAction ? (
          <p className="workspace-reply-state" role="status">
            {actionStateLabel(action.data)}
          </p>
        ) : (
          showReceipt && (
            <p className="workspace-reply-state">
              {saved?.type === "data-commit" ? `Saved: ${saved.data.summary}` : "Changes saved"}
            </p>
          )
        )}
        {!!places.length && (
          <div className="workspace-message-places">
            <PlaceChips places={places} />
          </div>
        )}
        <SavedAttachments reference={reference} files={files} />
        {showIncomplete && (
          <p className="workspace-reply-state" role="status">
            {replyFailureMessage(message)}
            {onRetry && (
              <Button variant="ghost" className="cursor-pointer" onClick={onRetry}>
                Retry reply
              </Button>
            )}
          </p>
        )}
        {/* Work follows response content. */}
        {assistant && (
          <WorkProgress
            key="response-progress"
            entries={entries}
            run={run}
            active={active}
            progress={progress}
            status={status}
            failureElapsed={
              message.parts.findLast((part) => part.type === "data-failure")?.data.elapsedMs
            }
            reference={reference}
          />
        )}
      </div>
    </AgentMessage>
  );
}
