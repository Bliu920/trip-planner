"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowLeft } from "lucide-react";
import type { Day } from "../presentation/model";
import { StopDetails } from "./details";
import { useDayJourneys, JourneyStatus } from "@/lib/journeys/view";
import { DayMap } from "./map";
import "./styles.css";

/** Detail column beside the persistent day cards. Hosts own writes. */
export function DayView({ day, context, selectedId, selectionRequest, onSelect, onEdit, onToggleOptional, timelineRef, visible, locked = false }: {
  day: Day; context?: ReactNode; selectedId: string | null; selectionRequest: number;
  onSelect: (id: string) => void; onEdit?: (id: string) => void;
  onToggleOptional?: (id: string) => void; timelineRef: RefObject<HTMLElement | null>; visible: boolean; locked?: boolean;
}) {
  const journeys = useDayJourneys(day.id, visible);
  const contextRef = useRef<HTMLElement>(null);
  const selected = [...day.stops, ...(day.stays ?? [])].find(stop => stop.id === selectedId && !stop.omitted);
  const hasSelection = !!selected;
  const scrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" as const : "smooth" as const;

  // Reveal details after expansion.
  useEffect(() => {
    const stage = timelineRef.current;
    if (!visible || !hasSelection || !stage || getComputedStyle(stage).display !== "flex") return;
    const reveal = () => {
      contextRef.current?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
      contextRef.current?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    };
    if (stage.dataset.motion === "opening" || stage.dataset.motion === "closing") stage.addEventListener("plan-motion-end", reveal, { once: true });
    else reveal();
    return () => stage.removeEventListener("plan-motion-end", reveal);
  }, [visible, hasSelection, selectionRequest, timelineRef]);

  function timelineButton(id: string) {
    return Array.from(timelineRef.current?.querySelectorAll<HTMLButtonElement>("button[data-stop-id]") ?? []).find(button => button.dataset.stopId === id);
  }
  // Connect map and timeline.
  function selectFromMap(id: string) {
    onSelect(id);
    const button = timelineButton(id);
    button?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
    button?.focus({ preventScroll: true });
  }
  function returnToTimeline() {
    const target = selectedId ? timelineButton(selectedId) : null;
    target?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    target?.focus({ preventScroll: true });
  }

  // Compose activity context.
  return <aside ref={contextRef} className="dp-context" aria-label="Activity details, map and day spending">
    {selected && <button type="button" className="dp-backToDay cursor-pointer" onClick={returnToTimeline}><ArrowLeft size={13} />Day timeline</button>}
    {selected && <StopDetails key={selected.id} stop={selected} cover={day.photo} onEdit={onEdit} onToggleOptional={onToggleOptional} locked={locked} />}
    <DayMap key={day.id} day={day} selected={selected?.id ?? null} selectionRequest={selectionRequest} onSelect={selectFromMap} routes={journeys?.report?.legs} />
    <JourneyStatus state={journeys} />
    {context}
  </aside>;
}
