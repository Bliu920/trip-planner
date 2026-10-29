import type { ChatMessage } from "../lib/chat/types";
import type { ActivityEntry } from "../lib/activity/model";
import type { ChatLifecycle } from "../lib/chat-response/state";

export const idle: ChatLifecycle = { loading: false, starting: false, busy: false, syncing: false, remoteBusy: false, historyError: "", startError: "" };
export const user: ChatMessage = { id: "user-one", role: "user", parts: [{ type: "text", text: "Plan a relaxed trip through Florence." }] };
export const attempt = "12fd9d92-d38d-4a5e-93c1-09747c76a964";
export function entry(id: string, status: ActivityEntry["status"], title: string): ActivityEntry {
  return { id, attempt, title, status, detail: "Reviewed the available trip information.", sources: [], documents: [] };
}
export function reply(entries: ActivityEntry[] = [], text = "", status: "streaming" | "complete" | "failed" | "interrupted" = "streaming"): ChatMessage {
  return { id: "reply-one", role: "assistant", metadata: { status, createdAt: "2026-10-28T12:00:00Z" }, parts: [...entries.map(data => ({ type: "data-activity" as const, data })), ...(text ? [{ type: "text" as const, text }] : [])] };
}
const done = entry("search-one", "complete", "Checked places");
export const scenarios: { name: string; messages: ChatMessage[]; state: ChatLifecycle }[] = [
  { name: "Submitted", messages: [user], state: { ...idle, busy: true } },
  { name: "Text before tool", messages: [user, reply([], "I will look for a relaxed route.")], state: { ...idle, busy: true } },
  { name: "First tool", messages: [user, reply([entry("search-one", "running", "Checking places...")], "I will look for a relaxed route.")], state: { ...idle, busy: true } },
  { name: "Tool gap", messages: [user, reply([done], "I will look for a relaxed route.")], state: { ...idle, busy: true } },
  { name: "Second tool", messages: [user, reply([done, entry("plan-two", "running", "Preparing your plan...")], "I will look for a relaxed route.")], state: { ...idle, busy: true } },
  { name: "Streaming answer", messages: [user, reply([done, entry("plan-two", "prepared", "Prepared your plan")], "Here is a relaxed route with time for art and good food.")], state: { ...idle, busy: true } },
  { name: "Saving history", messages: [user, { ...reply([done], "Here is your plan."), metadata: undefined }], state: { ...idle, syncing: true } },
  { name: "Completed", messages: [user, reply([done], "Here is your plan.", "complete")], state: idle },
  { name: "Reload running", messages: [user, reply([done, entry("plan-two", "running", "Preparing your plan...")], "I will look for a relaxed route.")], state: { ...idle, remoteBusy: true } },
  { name: "Stopped", messages: [user, reply([entry("search-one", "running", "Checking places...")], "", "interrupted")], state: idle },
  { name: "Failed", messages: [user, reply([entry("search-one", "failed", "Could not check places")], "", "failed")], state: idle },
  { name: "Retry", messages: [user, reply([entry("search-one", "interrupted", "Checking places...")])], state: { ...idle, busy: true } },
];
