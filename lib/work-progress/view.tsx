"use client";

import { useEffect, useId, useState } from "react";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { ActivityHistory, type ActivityEntry } from "@/lib/activity";
import type { MessageStatus } from "@/lib/chat/types";
import { latestWorkSteps, workElapsed, workLabel } from "./timing";
import "./work.css";

export function WorkProgress({
  entries,
  run,
  active,
  progress,
  status,
  failureElapsed,
  reference,
}: {
  entries: ActivityEntry[];
  run?: ActivityEntry;
  active: boolean;
  progress: string | null;
  status?: MessageStatus;
  failureElapsed?: number;
  reference: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const contentId = useId();
  const startedAt = run?.startedAt;
  const finishedElapsed = run?.elapsedMs;
  useEffect(() => {
    if (!active || !startedAt || finishedElapsed !== undefined) return;
    const tick = () => setNow(Date.now());
    const frame = requestAnimationFrame(tick);
    const timer = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [active, startedAt, finishedElapsed]);

  if (!active && !entries.length && !run && failureElapsed === undefined) return null;
  const elapsed = workElapsed(run, active, now, failureElapsed);
  const finalStatus =
    status ??
    (run?.status === "failed"
      ? "failed"
      : run?.status === "interrupted"
        ? "interrupted"
        : undefined);
  const label = workLabel(active, finalStatus, elapsed, progress);
  const preview = active ? latestWorkSteps(entries, run) : [];

  // Compose one work disclosure.
  return (
    <section className="work-progress" data-work-progress aria-label="Response activity">
      <button
        type="button"
        className="cursor-pointer work-header"
        data-chat-activity={active ? true : undefined}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        {active && (
          <LoaderCircle size={14} className="motion-safe:animate-spin" aria-hidden="true" />
        )}
        <span>{label}</span>
        <ChevronRight size={13} className="work-chevron" aria-hidden="true" />
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {active ? progress : label}
      </span>
      <div id={contentId} className="work-branch" hidden={!expanded}>
        {expanded &&
          (entries.length ? (
            <ActivityHistory entries={entries} reference={reference} active={active} />
          ) : (
            <p className="work-empty">{active ? "No steps recorded yet." : "No steps recorded."}</p>
          ))}
      </div>
      {!expanded && !!preview.length && (
        <ol className="work-branch work-preview" aria-label="Latest steps">
          {preview.map((entry) => (
            <li key={entry.id} title={entry.title}>
              {entry.title}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
