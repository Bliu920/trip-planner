import { groupActivity, type ActivityEntry } from "@/lib/activity/model";
import type { MessageStatus } from "@/lib/chat/types";

export function workElapsed(run: ActivityEntry | undefined, active: boolean, now: number | null, failureElapsed?: number) {
  if (run?.elapsedMs !== undefined) return run.elapsedMs;
  if (!active) return failureElapsed ?? null;
  const start = run?.startedAt ? Date.parse(run.startedAt) : NaN;
  return now !== null && Number.isFinite(start) ? Math.max(0, now - start) : null;
}

export function workLabel(active: boolean, status: MessageStatus | undefined, elapsed: number | null, progress: string | null) {
  const seconds = elapsed === null ? null : Math.floor(elapsed / 1000);
  if (active) {
    if (progress === "Loading your conversation..." || progress === "Preparing your conversation...") return progress;
    return seconds === null ? "Working" : `Working · ${seconds}s`;
  }
  const label = status === "failed" ? "Could not finish" : status === "interrupted" ? "Stopped" : "Worked";
  return seconds === null ? label : `${label}${status === "failed" || status === "interrupted" ? " after" : " for"} ${seconds}s`;
}

export function latestWorkSteps(entries: ActivityEntry[], run?: ActivityEntry) {
  return groupActivity(run ? entries.filter(entry => entry.attempt === run.attempt) : entries).slice(-4);
}
