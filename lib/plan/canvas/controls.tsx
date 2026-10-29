"use client";
import { useState, type ReactNode } from "react";
import { Dialog as SharedDialog, DialogContent, DialogClose, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, X } from "lucide-react";
import { durationLabel } from "@/lib/catalog";
import { itemTiming, sourcesIn, resolveLocation, type Location, type Plan, type PlanItem, type Place } from "@/lib/plan";
import { catalogItem, isProtected, userBasis, type PlanEdit } from "../commands";

export function Dialog({ title, children, close, feedback }: { title: string; children: ReactNode; close: () => void; feedback?: string }) {
  return <SharedDialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="pv2-dialog" showCloseButton={false}>
      <div className="pv2-dialog-head"><DialogTitle>{title}</DialogTitle><DialogClose className="cursor-pointer pv2-icon" aria-label="Close dialog"><X size={20}/></DialogClose></div>
      {feedback && <p className="pv2-warning" role="alert">{feedback}</p>}
      {children}
    </DialogContent>
  </SharedDialog>;
}

export function AddStop({ dayId, places, locked, save, close, feedback }: { dayId: string; places: Place[]; locked: boolean; save: (edit: PlanEdit) => Promise<boolean>; close: () => void; feedback?: string }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const results = places.filter(place => (!city || place.city === city) && `${place.name} ${place.city}`.toLowerCase().includes(query.toLowerCase()));
  async function add(place: Place) {
    if (await save({ type: "add", dayId, item: catalogItem(place, crypto.randomUUID()) })) close();
  }
  return <Dialog title="Add to your day" close={close} feedback={feedback}>
    <p className="pv2-muted">Choose a place, or leave some breathing room.</p>
    <div className="pv2-search"><Search size={18}/><input aria-label="Search places" placeholder="Search places" value={query} onChange={event => setQuery(event.target.value)}/><select aria-label="Filter by city" value={city} onChange={event => setCity(event.target.value)}><option value="">All Italy</option>{Array.from(new Set(places.map(place => place.city))).sort().map(city => <option key={city}>{city}</option>)}</select></div>
    <button className="cursor-pointer pv2-break" disabled={locked} onClick={async () => {
      if (await save({ type: "add", dayId, item: { id: crypto.randomUUID(), kind: "free_time", title: "Time to wander", reason: null, optional: false, keep: null, reservation: null, location: null, timing: { period: null, start: null, end: null, duration: null } } })) close();
    }}><Plus size={18}/> Add free time</button>
    <ul className="pv2-results">{results.map(place => <li key={place.id}><div><strong>{place.name}</strong><span>{place.city} · {place.duration_minutes ? `${durationLabel(place.duration_minutes)} suggested` : "Duration unknown"}</span></div><button className="cursor-pointer pv2-icon" disabled={locked} aria-label={`Add ${place.name}`} onClick={() => void add(place)}><Plus size={19}/></button></li>)}</ul>
    {!results.length && <p>No matching places. Try another name or city.</p>}
    <p className="pv2-muted pv2-fine">Confirm opening hours and availability for your travel dates.</p>
  </Dialog>;
}

export function ItemFields({ item, plan, places, locked, save, close, actions }: { item: PlanItem; plan: Plan; places: Place[]; locked: boolean; save: (edit: PlanEdit) => Promise<boolean>; close: () => void; actions: ReactNode }) {
  const [draft, setDraft] = useState(() => structuredClone(item));
  const [error, setError] = useState("");
  const timing = itemTiming(draft);
  const protectedItem = isProtected(item);
  const activity = draft.kind !== "stay" && draft.kind !== "travel";
  const location = item.kind !== "travel" ? resolveLocation(plan, item.location) : null;
  const place = location?.type === "catalog" ? places.find(place => place.id === location.placeId) : undefined;
  const sources = sourcesIn(item);
  const dirty = JSON.stringify(draft) !== JSON.stringify(item);
  return <form className="pv2-fields" onSubmit={async event => {
    event.preventDefault(); setError("");
    if (!draft.title.trim()) { setError("Give this activity a title."); return; }
    if (await save({ type: "item", item: draft })) close();
    else setError("This change was not saved. Review the message above the plan before continuing.");
  }}>
    <fieldset disabled={locked}>
      <label>Activity name<input value={draft.title} maxLength={200} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label>
      {activity && timing && <div className="pv2-field-row">
        <label>Part of day<select value={timing.period ?? ""} disabled={protectedItem} onChange={event => setDraft({ ...draft, timing: { ...timing, period: event.target.value as "morning" | "afternoon" | "evening" || null } } as PlanItem)}><option value="">Flexible</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label>
        <label>Suggested start<input type="time" value={timing.start?.time ?? ""} disabled={protectedItem} onChange={event => setDraft({ ...draft, timing: { ...timing, start: event.target.value ? { date: timing.start?.date ?? null, time: event.target.value, binding: "suggested", basis: userBasis } : null } } as PlanItem)}/></label>
      </div>}
      {activity && timing && !(timing.start?.time && timing.end?.time) && <div className="pv2-field-row">
        <label>Min. minutes<input type="number" min="1" max="1440" value={timing.duration?.minMinutes ?? ""} placeholder="Unknown" disabled={protectedItem} onChange={event => {
          const minutes = Number(event.target.value);
          setDraft({ ...draft, timing: { ...timing, duration: event.target.value ? { minMinutes: minutes, maxMinutes: Math.max(minutes, timing.duration?.maxMinutes ?? minutes), basis: userBasis } : null } } as PlanItem);
        }}/></label>
        <label>Max. minutes<input type="number" min={timing.duration?.minMinutes ?? 1} max="1440" value={timing.duration?.maxMinutes ?? ""} placeholder="Unknown" disabled={protectedItem || !timing.duration} onChange={event => {
          if (timing.duration) setDraft({ ...draft, timing: { ...timing, duration: { ...timing.duration, maxMinutes: Number(event.target.value), basis: userBasis } } } as PlanItem);
        }}/></label>
      </div>}
      <label>Why this stop<textarea rows={2} value={draft.reason ?? ""} maxLength={2000} onChange={event => setDraft({ ...draft, reason: event.target.value || null })}/></label>
      {activity && <label className="pv2-checkbox"><input type="checkbox" checked={draft.optional} disabled={protectedItem} onChange={event => setDraft({ ...draft, optional: event.target.checked })}/> Optional stop</label>}
      {protectedItem && <p className="pv2-warning">Booking, keep instructions or fixed times protect this arrangement. Its placement and protected details are locked here.</p>}
      {item.kind === "stay" && <p className="pv2-muted">Accommodation dates and coverage are preserved. To change these details, describe the change in chat.</p>}
      {item.kind === "travel" && <p className="pv2-muted">Travel endpoints and timing are preserved. To change these details, describe the change in chat.</p>}
      <ArrangementDetails item={item} plan={plan} places={places}/>
      <details className="pv2-evidence"><summary className="cursor-pointer">Place details and sources</summary>
        {place && <><p>{place.name}, {place.city}</p><p>Hours: {place.hours ?? "Unknown"}. Confirm for your travel dates.</p>{place.seasonal_notes && <p>{place.seasonal_notes.replace(/[\u2013\u2014]/g, "-")}</p>}<p>Booking: {place.booking_required === null ? "Unknown" : place.booking_required ? "Required" : "Not required"}</p></>}
        {!place && <p>No place details available.</p>}
        {sources.map((source, index) => <p key={index}>{source.type === "catalog" ? `Place information: ${places.find(place => place.id === source.placeId)?.name ?? "Unavailable place"}` : source.type === "web" ? <a href={source.url} target="_blank" rel="noreferrer">Research source, accessed {source.accessedAt.slice(0, 10)}</a> : source.type === "document" ? `Saved document, version ${source.revision}${source.section ? `, ${source.section}` : ""}` : source.type === "message" ? "Earlier chat message" : source.type === "attachment" ? `Uploaded file${source.locator ? `, ${source.locator}` : ""}` : source.type === "geo" ? "Map lookup evidence" : source.type === "direct_edit" ? "Entered directly in the plan" : "Original trip notes"}</p>)}
        <p>Day: {plan.days.findIndex(day => day.itemIds.includes(item.id)) + 1 || "Unscheduled"}</p>
      </details>
      {error && <p role="alert">{error}</p>}
      <div className="pv2-actions"><button className="cursor-pointer pv2-primary" type="submit">Save activity</button><button className="cursor-pointer pv2-button" type="button" onClick={close}>Cancel</button></div>
      {actions && <details className="pv2-more-actions">
        <summary className="cursor-pointer">More actions</summary>
        {dirty && <p className="pv2-muted">Save or cancel your changes before moving or removing this activity.</p>}
        <fieldset disabled={locked || dirty}>{actions}</fieldset>
      </details>}
    </fieldset>
  </form>;
}

function ArrangementDetails({ item, plan, places }: { item: PlanItem; plan: Plan; places: Place[] }) {
  function label(value: Location | null) {
    const location = resolveLocation(plan, value);
    return location?.type === "catalog" ? places.find(place => place.id === location.placeId)?.name ?? "Unknown place" : location?.label ?? "Unknown location";
  }
  const timing = itemTiming(item);
  const endpoint = item.kind === "travel" && item.timing.type !== "interval" ? item.timing : null;
  const coverage = item.kind === "stay" ? item.coverage : null;
  return <div className="pv2-evidence">
    {item.kind === "travel" && <p>{label(item.from)} to {label(item.to)}{item.mode ? ` · ${item.mode}` : ""}</p>}
    {endpoint && <p>{endpoint.type === "arrival" ? "Arrive" : "Depart"}: {endpoint.at.date ?? "Date unknown"} · {endpoint.at.time ?? "Time unknown"} ({endpoint.at.binding})</p>}
    {timing?.start && <p>Start: {timing.start.date ?? "Date flexible"} · {timing.start.time ?? "Time unknown"} ({timing.start.binding})</p>}
    {timing?.end && <p>End: {timing.end.date ?? "Date flexible"} · {timing.end.time ?? "Time unknown"} ({timing.end.binding})</p>}
    {item.kind === "travel" && timing?.duration && <p>Duration: {durationLabel(timing.duration.minMinutes, timing.duration.maxMinutes)}</p>}
    {coverage?.type === "dates" && <p>Check-in: {coverage.checkIn?.value ?? "Unknown"}. Check-out: {coverage.checkOut?.value ?? "Unknown"}.</p>}
    {coverage?.type === "nights" && <p>Nights after {coverage.afterDayIds.map(id => `Day ${plan.days.findIndex(day => day.id === id) + 1}`).join(", ")}.</p>}
    {item.keep && <p>Keep in plan{item.keep.basis.explanation ? `: ${item.keep.basis.explanation}` : ""}</p>}
    {item.reservation && <p>Reservation: {item.reservation.state.replaceAll("_", " ")}</p>}
    {item.kind !== "travel" && item.location && <p>Location: {label(item.location)}</p>}
  </div>;
}
