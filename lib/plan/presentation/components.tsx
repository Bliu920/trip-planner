"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogClose, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, ArrowUpRight, Footprints, MapPin, Pencil, Sun, Utensils, X } from "lucide-react";
import { money, moneyRange, overviewPeriod, type ActivityKind, type Budget, type Day, type Stop } from "./model";
import { Reminders } from "./reminders";

const activityIcons = { food: Utensils, sight: MapPin, walk: MapPin, stay: Sun, garden: MapPin, departure: ArrowRight, viewpoint: MapPin };
function ActivityIcon({ kind }: { kind: ActivityKind }) {
  const Icon = activityIcons[kind];
  return <span className={`pp-activityIcon pp-activity-${kind}`} aria-hidden="true"><Icon size={13} /></span>;
}

export function TripSummary({ title, meta, dateLabel, onDate, actionsDisabled = false, budget, budgetCard, embedded, onBudget, expanded = false, navigation, daySelector }: {
  onDate?: () => void; actionsDisabled?: boolean; budgetCard?: ReactNode; title: string; meta: string[]; dateLabel: string | null; budget: Budget | null; embedded: boolean; onBudget: () => void;
  expanded?: boolean; navigation?: ReactNode; daySelector?: ReactNode;
}) {
  const Heading = embedded ? "h2" : "h1";
  return <section className="pp-summary" aria-label="Trip overview">
    <div className="pp-identity"><Heading>{title}</Heading>
      <div className="pp-headerSlot">
        <div className="pp-headerLayer pp-headerFacts" data-active={!expanded} aria-hidden={expanded} inert={expanded}>
          <p>{meta.join(" · ")}</p>{dateLabel && <small>{onDate ? <button type="button" className="cursor-pointer pp-editable" disabled={actionsDisabled} aria-label={`Edit dates: ${dateLabel}`} aria-haspopup="dialog" onClick={onDate}>{dateLabel}</button> : dateLabel}</small>}
          {daySelector}
        </div>
        <div className="pp-headerLayer" data-active={expanded} aria-hidden={!expanded} inert={!expanded}>{navigation}</div>
      </div>
    </div>
    {budgetCard ?? (budget && <button type="button" className="pp-budgetCard cursor-pointer" aria-label={`${budget.scope}: ${moneyRange(budget)}. View budget breakdown.`} aria-haspopup="dialog" onClick={onBudget}>
      <span className="pp-budgetLabel">Trip budget <span>Estimated total</span></span>
      <span className="pp-budgetAmount"><strong>{moneyRange(budget)}</strong><ArrowUpRight size={18} /></span>
    </button>)}
  </section>;
}

export function Timeline({ stops, detailed = false, actionsDisabled = false, onStop, onToggleOptional, selectedId, domId }: {
  stops: Stop[]; actionsDisabled?: boolean; onStop: (id: string) => void; onToggleOptional?: (id: string) => void;
  selectedId?: string | null; domId?: string; detailed?: boolean;
}) {
  return <ol className="pp-schedule">
    {stops.map((stop, index) => {
      const period = overviewPeriod(stop.time);
      const startsPeriod = index === 0 || period !== overviewPeriod(stops[index - 1].time);
      const time = detailed ? stop.time : startsPeriod ? period : "";
      const duration = !detailed && stop.duration.startsWith("Until ") ? "" : stop.duration;
      return <li className="pp-event" key={stop.id} data-period-start={!detailed && startsPeriod}>
        {stop.omitted ? <div className="pp-openSlot">
          <time data-flexible={!detailed || time.length > 5} aria-hidden={!time || undefined}>{time}</time><ActivityIcon kind="stay" /><span>Free time
            {onToggleOptional && stop.canToggle && <button type="button" className="cursor-pointer" data-stop-id={stop.id} disabled={actionsDisabled} onClick={() => onToggleOptional(stop.id)}>Restore {stop.title}</button>}
          </span>
        </div> : <button type="button" className="pp-stop cursor-pointer" id={domId ? `${domId}-stop-${stop.id}` : undefined} data-stop-id={stop.id} aria-label={detailed ? undefined : [period, stop.title, duration, stop.optional ? "Optional" : ""].filter(Boolean).join(", ")} aria-pressed={selectedId === undefined ? undefined : selectedId === stop.id} onClick={() => onStop(stop.id)}>
            <time data-flexible={!detailed || time.length > 5} aria-hidden={!time || undefined}>{time}</time><ActivityIcon kind={stop.kind} />
            <span className="pp-stopContent"><strong>{stop.title}</strong><span>{[duration, stop.optional ? "Optional" : ""].filter(Boolean).join(" · ")}</span></span>
          </button>}
      </li>;
    })}
    {!stops.length && <li className="pp-emptyDay">No activities scheduled.</li>}
  </ol>;
}

function DayCover({ photo, fallback }: { photo: Day["photo"]; fallback: Day["fallbackPhoto"] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const selected = [photo, fallback].find(candidate => candidate?.src && !failed.includes(candidate.src));
  const fail = () => { if (selected) setFailed(current => current.includes(selected.src) ? current : [...current, selected.src]); };
  return <div className="pp-dayCover">
    {selected && (
      // Catalog image supplied by the host.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={selected.src} src={selected.src} alt={selected.alt} width={650} height={240}
        ref={image => { if (image?.complete && image.naturalWidth === 0) fail(); }}
        onError={fail} />
    )}
  </div>;
}

export function DayCard({ day, number, active, domId, actionsDisabled = false, onOpenDay, onEditDay, onStop, onToggleOptional, expanded = false, selectedId }: {
  day: Day; number: number; active: boolean; domId: string; actionsDisabled?: boolean;
  onOpenDay: (id: string) => void;
  onEditDay?: (id: string) => void;
  onStop: (id: string) => void; onToggleOptional?: (id: string) => void;
  expanded?: boolean; selectedId?: string | null;
}) {
  return <article className={`pp-day${active ? " pp-activeDay" : ""}`} id={domId} tabIndex={-1} aria-label={`Day ${number}: ${day.title}`} data-expanded={expanded}
    onClick={expanded ? undefined : event => {
      if (!(event.target as HTMLElement).closest("button,a,summary,input,select") && !window.getSelection()?.toString()) onOpenDay(day.id);
    }}>
    <header className="pp-dayVisual">
      <DayCover key={JSON.stringify([day.photo?.src, day.fallbackPhoto?.src])} photo={day.photo} fallback={day.fallbackPhoto} />
      {!expanded && <button type="button" className="pp-openDay cursor-pointer" id={`${domId}-open`} aria-label={`Open Day ${number}: ${day.title}`} onClick={() => onOpenDay(day.id)}><ArrowUpRight size={15} /></button>}
      <div className="pp-dayHeading"><h3>Day {number}</h3><span>{expanded ? day.title : <button type="button" className="cursor-pointer pp-editable" aria-label={`View Day ${number}: ${day.title}`} onClick={() => onOpenDay(day.id)}>{day.title}</button>}</span>
        {expanded && onEditDay && <button type="button" className="pp-editDay cursor-pointer" disabled={actionsDisabled} aria-label={`Edit Day ${number} title`} onClick={() => onEditDay(day.id)}><Pencil size={13} /></button>}
      </div>
    </header>
    <Timeline domId={domId} detailed={expanded} selectedId={selectedId} actionsDisabled={actionsDisabled} stops={day.stops} onStop={onStop} onToggleOptional={onToggleOptional} />
    <Reminders items={day.reminders} />
    {(day.walkingLabel || day.stayLabel) && <footer className="pp-dayFooter">
      {day.walkingLabel && <span><Footprints size={13} />{day.walkingLabel}</span>}
      {!!day.stays?.length ? <div className="pp-stays">{day.stays.map(stay => <button type="button" key={stay.id} className="cursor-pointer" id={`${domId}-stop-${stay.id}`} data-stop-id={stay.id}
        aria-label={`View overnight stay: ${stay.title}`} aria-pressed={selectedId === undefined ? undefined : selectedId === stay.id} onClick={() => onStop(stay.id)}>
        <span>Overnight</span>{stay.title}<ArrowUpRight size={13} aria-hidden="true" />
      </button>)}</div> : day.stayLabel && <span>{day.stayLabel}</span>}
    </footer>}
  </article>;
}

export function DetailDialog({ budget, stop, onClose, actionsDisabled = false, onToggleOptional }: {
  budget: Budget | null; stop: Stop | null; onClose: () => void; actionsDisabled?: boolean; onToggleOptional?: (id: string) => void;
}) {
  return <Dialog open={!!budget || !!stop} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="pp-dialog" showCloseButton={false}>
    <div className="pp-dialogContent">
      <DialogClose className="pp-close cursor-pointer" aria-label="Close details"><X size={19} /></DialogClose>
      {budget && <>
        <DialogTitle>Trip budget</DialogTitle><p className="pp-dialogSubtitle">{budget.scope}</p>
        <strong className="pp-dialogTotal">{moneyRange(budget)}</strong>
        <dl className="pp-costs">{budget.costs.map(cost => <div key={cost.label}><dt>{cost.label}<small>{cost.detail}</small></dt><dd>{money(cost.min, budget.currency)} to {money(cost.max, budget.currency)}</dd></div>)}</dl>
        <p className="pp-budgetNote">{budget.note}</p>
        <section className="pp-excluded"><h3>Not included</h3><p>{budget.excluded}</p></section>
      </>}
      {stop && <>
        <DialogTitle>{stop.title}</DialogTitle><p className="pp-dialogSubtitle">{stop.time} · {stop.duration}</p>
        <p className="pp-stopCategory">{stop.category}</p><p className="pp-stopNote">{stop.note}</p>
        {stop.bookingLabel && <p className="pp-booking">{stop.bookingLabel}</p>}
        {stop.canToggle && onToggleOptional && <button type="button" className="pp-skip cursor-pointer" disabled={actionsDisabled} onClick={() => { onToggleOptional(stop.id); onClose(); }}>{stop.omitted ? "Restore this stop" : "Skip this stop"}</button>}
      </>}
    </div>
    </DialogContent>
  </Dialog>;
}
