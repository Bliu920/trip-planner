import type { ChatMessage } from "../chat/types";
import { activityEntries } from "../activity/model";

export type ChatLifecycle = {
  loading: boolean; starting: boolean; busy: boolean; syncing: boolean; remoteBusy: boolean;
  historyError: string; startError: string;
};
export type TranscriptItem = {
  key: string; message: ChatMessage; progress: string | null; active: boolean; latest: boolean;
};

export function buildTranscript(messages: ChatMessage[], state: ChatLifecycle): TranscriptItem[] {
  const visible = state.loading ? [] : messages;
  const latest = visible.at(-1);
  const unfinished = latest?.role === "assistant" && (!latest.metadata || latest.metadata.status === "streaming");
  const phase = state.loading ? "loading"
    : state.starting && !state.startError && !state.historyError ? "preparing"
    : state.busy ? "working"
    : state.syncing && unfinished && !state.historyError ? "syncing"
    : state.remoteBusy && unfinished && !state.historyError ? "working" : null;
  const transcript: ChatMessage[] = phase && latest?.role !== "assistant"
    ? [...visible, { id: "pending-response", role: "assistant", parts: [] }] : visible;
  let userId = "starter";
  let replyIndex = 0;

  // Anchor replies to user turns.
  return transcript.map((message, index) => {
    if (message.role === "user") { userId = message.id; replyIndex = 0; }
    const current = index === transcript.length - 1;
    const active = message.role === "assistant" && current && phase !== null;
    const entries = activityEntries(message.parts);
    const attempt = entries.at(-1)?.attempt;
    const running = entries.findLast(entry => entry.attempt === attempt && entry.status === "running");
    const progress = !active ? null
      : phase === "loading" ? "Loading your conversation..."
      : phase === "preparing" ? "Preparing your conversation..."
      : phase === "syncing" ? "Checking saved conversation..."
      : running?.title ?? "Working on your trip...";
    return { key: message.role === "assistant" ? `reply-${userId}-${replyIndex++}` : message.id, message, progress, active, latest: current };
  });
}
