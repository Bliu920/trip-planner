"use client";

import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentMessage } from "@/lib/agent";
import { SavedAttachments } from "@/lib/attachments";
import { PlaceChips } from "@/lib/place-references";
import { ActivityHistory, activityEntries } from "@/lib/activity";
import { actionStateLabel, actionResultSchema } from "@/lib/actions";
import { replyFailureMessage } from "@/lib/chat/failure";
import { MarkdownText } from "@/lib/markdown";
import { MessageText } from "./text";
import type { TranscriptItem } from "./state";

export function ChatResponse({ item, reference, onRetry }: { item: TranscriptItem; reference: string; onRetry?: () => void }) {
  const { message, active, progress } = item;
  const assistant = message.role === "assistant";
  const entries = activityEntries(message.parts);
  const text = message.parts.filter(part => part.type === "text").map(part => part.text).join("");
  const status = message.metadata?.status;
  const transient = assistant && active && status !== "complete";
  const saved = message.parts.find(part => part.type === "data-commit");
  const action = message.parts.findLast(part => part.type === "data-action");
  const committed = message.parts.some(part => {
    if (part.type !== "tool-commit" || !("output" in part)) return false;
    const result = actionResultSchema.safeParse(part.output);
    return result.success && result.data.outcome === "succeeded" && result.data.effect === "persisted";
  });
  const showReceipt = !transient && !!(saved || committed);
  const showAction = !transient && action?.type === "data-action";
  const showIncomplete = assistant && status && status !== "complete" && status !== "streaming" && !active;
  const places = message.parts.filter(part => part.type === "data-place").map(part => part.data);
  const files = message.parts.filter(part => part.type === "data-attachment").map(part => part.data);
  if (!text && !entries.length && !progress && !showIncomplete && !showReceipt && !showAction && !places.length && !files.length) return null;

  // Own response presentation order.
  return <AgentMessage role={assistant ? "assistant" : "user"} feedbackEnabled={false} copyText={assistant && !transient ? text : undefined} onRetry={assistant ? onRetry : undefined}>
    <div data-chat-response={assistant ? "assistant" : "user"}>
      {/* Live progress always leads. */}
      {assistant && progress && <div className="flex h-7 min-w-0 items-center gap-2 overflow-hidden text-xs text-muted-foreground" data-chat-activity role="status" aria-live="polite" aria-atomic="true">
        <LoaderCircle size={14} className="shrink-0 motion-safe:animate-spin" aria-hidden="true" />
        <span className="min-w-0 truncate">{progress}</span>
      </div>}
      <ActivityHistory entries={entries} reference={reference} active={active} />
      {text && (assistant ? <MarkdownText text={text} id={`chat-message-${message.id}`} /> : <MessageText text={text} id={`chat-message-${message.id}`} collapsible />)}
      {showAction ? <p className="workspace-reply-state" role="status">{actionStateLabel(action.data)}</p> : showReceipt && <p className="workspace-reply-state">{saved?.type === "data-commit" ? `Saved: ${saved.data.summary}` : "Changes saved"}</p>}
      {!!places.length && <div className="workspace-message-places"><PlaceChips places={places} /></div>}
      <SavedAttachments reference={reference} files={files} />
      {showIncomplete && <p className="workspace-reply-state" role="status">{replyFailureMessage(message)}{onRetry && <Button variant="ghost" className="cursor-pointer" onClick={onRetry}>Retry reply</Button>}</p>}
    </div>
  </AgentMessage>;
}
