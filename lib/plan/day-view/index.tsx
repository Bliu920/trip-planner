"use client";

import { useEffect, useRef, ViewTransition, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { Day } from "../presentation/model";
import { StopDetails } from "./details";
import { DayMap } from "./map";
import "./styles.css";

/** Shared expanded day. Hosts own navigation, data and write commands. */
export function DayView({ day, card, context, selectedId, selectionRequest, onSelect, onEdit, onToggleOptional, locked = false }: {
  day: Day; card: ReactNode; context?: ReactNode; selectedId: string | null; selectionRequest: number;
  onSelect: (id: string) => void; onEdit?: (id: string) => void;
  onToggleOptional?: (id: string) => void; locked?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLElement>(null);
  const selected = day.stops.find(stop => stop.id === selectedId && !stop.omitted);

  const hasSelection = !!selected;

  // Reveal narrow-screen details.
  useEffect(() => {
    if (hasSelection && contextRef.current && root.current && getComputedStyle(root.current).display === "flex") {
      contextRef.current.scrollIntoView({ block: "start" });
      contextRef.current.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    }
  }, [hasSelection, selectionRequest]);

  // Connect map and timeline.
  function selectFromMap(id: string) {
    onSelect(id);
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>(".pp-stop[data-stop-id]");
    const button = Array.from(buttons ?? []).find(value => value.dataset.stopId === id);
    button?.scrollIntoView({ block: "nearest" });
    button?.focus({ preventScroll: true });
  }
  function returnToTimeline() {
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>(".pp-stop[data-stop-id]");
    const target = Array.from(buttons ?? []).find(button => button.dataset.stopId === selectedId);
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }

  // Compose the same day.
  return <div className="dp-host"><div ref={root} className="dp-expanded">
    <div className="dp-itinerary">{card}</div>
    <ViewTransition enter="plan-details" exit="plan-details" default="none"><aside ref={contextRef} className="dp-context" aria-label="Activity details, map and day spending">
      {selected && <button type="button" className="dp-backToDay cursor-pointer" onClick={returnToTimeline}><ArrowLeft size={13} />Day timeline</button>}
      {selected && <StopDetails key={selected.id} stop={selected} cover={day.photo} onEdit={onEdit} onToggleOptional={onToggleOptional} locked={locked} />}
      <DayMap key={day.id} day={day} selected={selected?.id ?? null} selectionRequest={selectionRequest} onSelect={selectFromMap} />
      {context}
    </aside></ViewTransition>
  </div></div>;
}
