"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { DayView } from "../day-view";
import { useDayMotion } from "./motion";
import { DayCard, DetailDialog, TripSummary } from "./components";
import { findStop, type Day, type PlanPresentationData } from "./model";
import { Reminders } from "./reminders";
import "./presentation.css";

export type { PlanPresentationData, Day, Stop, Budget, Photo } from "./model";
export { presentPlan } from "./model";

type Navigation = { dayId: string | null; stopId: string | null; request: number };
type Detail = { type: "budget" } | { type: "stop"; id: string } | null;

/** One browsing flow for previews and the editable workspace. Hosts own writes. */
export function PlanPresentation({
  data,
  embedded = false,
  actionsDisabled = false,
  budgetCard,
  renderDayContext,
  initialDayId = null,
  onToggleOptional,
  onEditStop,
  onEditDay,
  onEditDate,
  onAdd,
}: {
  data: PlanPresentationData;
  budgetCard?: ReactNode;
  renderDayContext?: (day: Day) => ReactNode;
  initialDayId?: string | null;
  embedded?: boolean;
  actionsDisabled?: boolean;
  onToggleOptional?: (id: string) => void;
  onEditStop?: (id: string) => void;
  onEditDay?: (id: string) => void;
  onEditDate?: () => void;
  onAdd?: (id: string) => void;
}) {
  const [navigation, setNavigation] = useState<Navigation>({
    dayId: initialDayId,
    stopId: null,
    request: 0,
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDayId);
  const [detail, setDetail] = useState<Detail>(null);
  const root = useRef<HTMLDivElement>(null);
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [contextDayId, setContextDayId] = useState(initialDayId);
  const focusTarget = useRef<string | null>(null);
  const returnTarget = useRef<{ dayId: string; stopId: string | null } | null>(null);
  const { stage, capture: captureMotion } = useDayMotion(navigation.dayId);

  // Resolve live data by ID.
  const opened = data.days.find((day) => day.id === navigation.dayId);
  const contextDay = data.days.find((day) => day.id === contextDayId);
  const stop = detail?.type === "stop" ? (findStop(data, detail.id) ?? null) : null;
  const dayDomId = (id: string) => `${scope}-day-${id}`;

  // Restore focus without scrolling.
  useLayoutEffect(() => {
    if (focusTarget.current)
      document.getElementById(focusTarget.current)?.focus({ preventScroll: true });
    focusTarget.current = null;
  }, [navigation.dayId]);

  function openDay(id: string, stopId: string | null = null) {
    captureMotion(id);
    returnTarget.current = { dayId: id, stopId };
    focusTarget.current = stopId ? `${dayDomId(id)}-stop-${stopId}` : dayDomId(id);
    setDetail(null);
    setContextDayId(id);
    setSelectedDay(id);
    setNavigation((current) => ({ dayId: id, stopId, request: current.request + 1 }));
  }
  function closeDay() {
    if (!opened) return;
    captureMotion(opened.id);
    const target = returnTarget.current?.dayId === opened.id ? returnTarget.current.stopId : null;
    focusTarget.current = target
      ? `${dayDomId(opened.id)}-stop-${target}`
      : `${dayDomId(opened.id)}-open`;
    setSelectedDay(opened.id);
    setNavigation((current) => ({ ...current, dayId: null }));
  }
  function openStop(id: string) {
    const day = data.days.find((value) =>
      [...value.stops, ...(value.stays ?? [])].some((stop) => stop.id === id),
    );
    if (day) openDay(day.id, id);
    else if (onEditStop) onEditStop(id);
    else setDetail({ type: "stop", id });
  }
  function selectStop(id: string) {
    if (opened) returnTarget.current = { dayId: opened.id, stopId: id };
    setNavigation((current) => ({
      ...current,
      stopId: current.stopId === id ? null : id,
      request: current.request + 1,
    }));
  }
  function closeDetail() {
    setDetail(null);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>(".pp-pending button,.pp-budgetCard,.pp-stays button")
        ?.focus({ preventScroll: true }),
    );
  }
  function dayCard(day: Day, index: number, expanded: boolean) {
    return (
      <div
        key={day.id}
        className="pp-dayShell"
        data-day-id={day.id}
        hidden={!!opened && !expanded}
        inert={!!opened && !expanded}
        data-active={expanded || (selectedDay ?? data.days[0]?.id) === day.id}
      >
        <DayCard
          day={day}
          number={index + 1}
          active={expanded || (selectedDay ?? data.days[0]?.id) === day.id}
          domId={dayDomId(day.id)}
          expanded={expanded}
          selectedId={expanded ? navigation.stopId : undefined}
          onOpenDay={openDay}
          onStop={expanded ? selectStop : openStop}
          onEditDay={expanded ? onEditDay : undefined}
          onToggleOptional={expanded ? onToggleOptional : undefined}
          actionsDisabled={actionsDisabled}
        />
        {expanded && onAdd && (
          <button
            type="button"
            className="pp-add cursor-pointer"
            disabled={actionsDisabled}
            onClick={() => onAdd(day.id)}
          >
            <Plus size={14} />
            Add activity
          </button>
        )}
        {expanded && day.endNote && <p className="pp-endNote">{day.endNote}</p>}
      </div>
    );
  }

  function dayButtons(expanded: boolean) {
    return data.days.map((day, index) => (
      <button
        type="button"
        key={day.id}
        className="cursor-pointer"
        aria-current={
          (opened?.id ?? selectedDay ?? data.days[0]?.id) === day.id ? "page" : undefined
        }
        onClick={() => (expanded ? openDay(day.id) : setSelectedDay(day.id))}
      >
        Day {index + 1}
      </button>
    ));
  }

  // Keep the Plan shell mounted.
  return (
    <div ref={root} className="pp-page" data-embedded={embedded} data-day-open={!!opened}>
      <div className="pp-main">
        <TripSummary
          budgetCard={budgetCard}
          title={data.title}
          meta={data.meta}
          dateLabel={data.dateLabel}
          budget={data.budget}
          embedded={embedded}
          actionsDisabled={actionsDisabled}
          onDate={onEditDate}
          onBudget={() => setDetail({ type: "budget" })}
          expanded={!!opened}
          navigation={
            <nav className="pp-browse" aria-label="Trip days">
              <button
                type="button"
                className="pp-allDays cursor-pointer"
                aria-label={`All ${data.days.length} ${data.days.length === 1 ? "day" : "days"}`}
                onClick={closeDay}
              >
                <ArrowLeft size={14} />
                <span>{`All ${data.days.length} ${data.days.length === 1 ? "day" : "days"}`}</span>
              </button>
              <div>{dayButtons(true)}</div>
            </nav>
          }
          daySelector={
            <nav className="pp-overviewDays" aria-label="Choose a day">
              {dayButtons(false)}
            </nav>
          }
        />
        <Reminders items={data.reminders} />
        {!!data.pendingItems?.length && (
          <ul className="pp-pending" aria-label="Arrangements to schedule">
            {data.pendingItems.map((item) => (
              <li key={item.id}>
                <button type="button" className="cursor-pointer" onClick={() => openStop(item.id)}>
                  {item.title}
                  <span>
                    {item.category.startsWith("stay") ? "Check stay dates" : "Not scheduled"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dp-host">
          <section
            ref={stage}
            className="pp-days pp-stage"
            data-mode={opened ? "day" : "overview"}
            aria-label={
              opened
                ? `Day ${data.days.indexOf(opened) + 1}: ${opened.title}`
                : `${data.days.length}-day itinerary`
            }
          >
            {data.days.map((day, index) => dayCard(day, index, day.id === opened?.id))}
            <div
              className="pp-contextCell"
              data-visible={!!opened}
              aria-hidden={!opened}
              inert={!opened}
            >
              {contextDay && (
                <DayView
                  day={contextDay}
                  selectedId={navigation.stopId}
                  selectionRequest={navigation.request}
                  onSelect={selectStop}
                  timelineRef={stage}
                  visible={!!opened}
                  onEdit={onEditStop}
                  onToggleOptional={onToggleOptional}
                  locked={actionsDisabled}
                  context={renderDayContext?.(contextDay)}
                />
              )}
            </div>
          </section>
        </div>
        {!opened && !data.days.length && <p>No days planned yet.</p>}
        {data.footnote && <p className="pp-previewNote">{data.footnote}</p>}
      </div>
      <DetailDialog
        budget={detail?.type === "budget" ? data.budget : null}
        stop={stop}
        onClose={closeDetail}
        onToggleOptional={onToggleOptional}
        actionsDisabled={actionsDisabled}
      />
    </div>
  );
}
