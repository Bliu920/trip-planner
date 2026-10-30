import { groupActivity, type ActivityEntry } from "@/lib/activity/model";
import type { MessageStatus } from "@/lib/chat/types";

export function workElapsed(
  run: ActivityEntry | undefined,
  active: boolean,
  now: number | null,
  failureElapsed?: number,
) {
  if (run?.elapsedMs !== undefined) return run.elapsedMs;
  if (!active) return failureElapsed ?? null;
  const start = run?.startedAt ? Date.parse(run.startedAt) : NaN;
  return now !== null && Number.isFinite(start) ? Math.max(0, now - start) : null;
}

function workDuration(elapsed: number) {
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const remainder = seconds % 60;
  return `${Math.floor(seconds / 60)}m${remainder ? ` ${remainder}s` : ""}`;
}

export function workLabel(
  active: boolean,
  status: MessageStatus | undefined,
  elapsed: number | null,
  progress: string | null,
) {
  const duration = elapsed === null ? null : workDuration(elapsed);
  if (active) {
    if (
      progress === "Loading your conversation..." ||
      progress === "Preparing your conversation..."
    )
      return progress;
    return duration === null ? "Working" : `Working · ${duration}`;
  }
  const label =
    status === "failed" ? "Could not finish" : status === "interrupted" ? "Stopped" : "Worked";
  return duration === null
    ? label
    : `${label}${status === "failed" || status === "interrupted" ? " after" : " for"} ${duration}`;
}

export function latestWorkSteps(entries: ActivityEntry[], run?: ActivityEntry) {
  return groupActivity(
    run ? entries.filter((entry) => entry.attempt === run.attempt) : entries,
  ).slice(-4);
}
