"use client";

import { addTransitionType, startTransition, useId, useLayoutEffect, useRef, useState, ViewTransition, type ReactNode } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { DayView } from "../day-view";
import { DayCard, DetailDialog, TripSummary } from "./components";
import { findStop, type Day, type PlanPresentationData } from "./model";
import "./presentation.css";

export type { PlanPresentationData, Day, Stop, Budget, Photo } from "./model";
export { presentPlan } from "./model";

type Navigation = { dayId: string | null; stopId: string | null; request: number };
type Detail = { type: "budget" } | { type: "stop"; id: string } | null;

/** One browsing flow for previews and the editable workspace. Hosts own writes. */
export function PlanPresentation({ data, embedded = false, actionsDisabled = false, budgetCard, renderDayContext, initialDayId = null, onToggleOptional, onEditStop, onEditDay, onEditDate, onAdd }: {
  data: PlanPresentationData; budgetCard?: ReactNode; renderDayContext?: (day: Day) => ReactNode;
  initialDayId?: string | null; embedded?: boolean; actionsDisabled?: boolean;
  onToggleOptional?: (id: string) => void; onEditStop?: (id: string) => void;
  onEditDay?: (id: string) => void; onEditDate?: () => void; onAdd?: (id: string) => void;
}) {
  const [navigation, setNavigation] = useState<Navigation>({ dayId: initialDayId, stopId: null, request: 0 });
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDayId);
  const [detail, setDetail] = useState<Detail>(null);
  const root = useRef<HTMLDivElement>(null);
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const restore = useRef(false);
  const origin = useRef<{ focusId: string; windowY: number; scrolls: { element: HTMLElement; top: number; left: number }[] } | null>(null);

  // Resolve live data by ID.
  const opened = data.days.find(day => day.id === navigation.dayId);
  const stop = detail?.type === "stop" ? findStop(data, detail.id) ?? null : null;
  const dayDomId = (id: string) => `${scope}-day-${id}`;

  // Anchor the expanded Plan.
  useLayoutEffect(() => {
    if (!navigation.dayId) return;
    root.current?.scrollIntoView({ block: "start" });
    const target = root.current?.querySelector<HTMLElement>(".pp-stop[aria-pressed=true]") ?? root.current?.querySelector<HTMLElement>(".pp-day[data-expanded=true]");
    target?.focus({ preventScroll: true });
  }, [navigation.dayId]);

  // Preserve overview reading position.
  useLayoutEffect(() => {
    if (!restore.current || opened) return;
    restore.current = false;
    const saved = origin.current;
    if (!saved) return;
    saved.scrolls.forEach(({ element, top, left }) => { if (element.isConnected) element.scrollTo({ top, left, behavior: "instant" }); });
    window.scrollTo({ top: saved.windowY, behavior: "instant" });
    document.getElementById(saved.focusId)?.focus({ preventScroll: true });
  }, [opened]);

  function openDay(id: string, stopId: string | null = null) {
    if (!opened) {
      const scrolls: { element: HTMLElement; top: number; left: number }[] = [];
      for (let element: HTMLElement | null = root.current; element; element = element.parentElement) {
        if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) scrolls.push({ element, top: element.scrollTop, left: element.scrollLeft });
      }
      origin.current = { focusId: stopId ? `${dayDomId(id)}-stop-${stopId}` : `${dayDomId(id)}-open`, windowY: window.scrollY, scrolls };
    }
    setSelectedDay(id);
    setDetail(null);
    startTransition(() => {
      addTransitionType("plan-navigation");
      setNavigation(current => ({ dayId: id, stopId, request: current.request + 1 }));
    });
  }
  function closeDay() {
    if (!origin.current && opened) origin.current = { focusId: `${dayDomId(opened.id)}-open`, windowY: 0, scrolls: [] };
    restore.current = true;
    startTransition(() => {
      addTransitionType("plan-navigation");
      setNavigation(current => ({ dayId: null, stopId: null, request: current.request + 1 }));
    });
  }
  function openStop(id: string) {
    const day = data.days.find(value => value.stops.some(stop => stop.id === id));
    if (day) openDay(day.id, id);
    else if (onEditStop) onEditStop(id);
    else setDetail({ type: "stop", id });
  }
  function selectStop(id: string) {
    setNavigation(current => ({ ...current, stopId: id, request: current.request + 1 }));
  }
  function closeDetail() {
    setDetail(null);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(".pp-budgetCard,.pp-other button")?.focus({ preventScroll: true }));
  }
  function dayCard(day: Day, index: number, expanded: boolean) {
    return <ViewTransition key={day.id} name={`${scope}-day-${index}`} share="plan-day" enter="plan-peer" exit="plan-peer" default="none"><div className="pp-dayShell" data-active={expanded || (selectedDay ?? data.days[0]?.id) === day.id}>
      <DayCard day={day} number={index + 1} active={expanded || (selectedDay ?? data.days[0]?.id) === day.id} domId={dayDomId(day.id)} expanded={expanded}
        selectedId={expanded ? navigation.stopId : undefined} onOpenDay={openDay} onStop={expanded ? selectStop : openStop}
        onEditDay={expanded ? onEditDay : undefined} onToggleOptional={expanded ? onToggleOptional : undefined} actionsDisabled={actionsDisabled} />
      {expanded && onAdd && <button type="button" className="pp-add cursor-pointer" disabled={actionsDisabled} onClick={() => onAdd(day.id)}><Plus size={14} />Add activity</button>}
      {expanded && day.endNote && <p className="pp-endNote">{day.endNote}</p>}
    </div></ViewTransition>;
  }

  // Keep the Plan shell mounted.
  return <div ref={root} className="pp-page" data-embedded={embedded} data-day-open={!!opened}>
    <div className="pp-main">
      <TripSummary budgetCard={budgetCard} title={data.title} meta={data.meta} dateLabel={data.dateLabel} budget={data.budget} embedded={embedded} actionsDisabled={actionsDisabled} onDate={onEditDate} onBudget={() => setDetail({ type: "budget" })} />
      <nav className="pp-browse" data-expanded={!!opened} aria-label="Trip days">
        {opened && <button type="button" className="pp-allDays cursor-pointer" onClick={closeDay}><ArrowLeft size={14} />{`All ${data.days.length} ${data.days.length === 1 ? "day" : "days"}`}</button>}
        <div>{data.days.map((day, index) => <button type="button" key={day.id} className="cursor-pointer" aria-current={(opened?.id ?? selectedDay ?? data.days[0]?.id) === day.id ? "page" : undefined} onClick={() => opened ? openDay(day.id) : setSelectedDay(day.id)}>Day {index + 1}</button>)}</div>
      </nav>
      {opened ? <DayView day={opened} card={dayCard(opened, data.days.indexOf(opened), true)} selectedId={navigation.stopId} selectionRequest={navigation.request} onSelect={selectStop}
        onEdit={onEditStop} onToggleOptional={onToggleOptional} locked={actionsDisabled} context={renderDayContext?.(opened)} /> : <>
        <section className="pp-days" aria-label={`${data.days.length}-day itinerary`}>{data.days.map((day, index) => dayCard(day, index, false))}</section>
        {!data.days.length && <p>No days planned yet.</p>}
        {!!data.otherItems.length && <details className="pp-other"><summary className="cursor-pointer">Stays and unscheduled arrangements ({data.otherItems.length})</summary><ul>{data.otherItems.map(item => <li key={item.id}><button type="button" className="cursor-pointer" onClick={() => openStop(item.id)}>{item.title}</button></li>)}</ul></details>}
        {!!data.notes.length && <details className="pp-other"><summary className="cursor-pointer">Plan notes ({data.notes.length})</summary>{data.notes.map(note => <p key={note.id}>{note.text}</p>)}</details>}
      </>}
      {data.footnote && <p className="pp-previewNote">{data.footnote}</p>}
    </div>
    <DetailDialog budget={detail?.type === "budget" ? data.budget : null} stop={stop} onClose={closeDetail} onToggleOptional={onToggleOptional} actionsDisabled={actionsDisabled} />
  </div>;
}
