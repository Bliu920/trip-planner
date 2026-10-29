"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { JourneyReport } from "./types";
const Context = createContext<{ reference: string; revision: number; pending: boolean } | null>(null);
export function JourneyProvider({ reference, revision, pending, children }: { reference: string; revision: number; pending: boolean; children: ReactNode }) {
  return <Context.Provider value={{ reference, revision, pending }}>{children}</Context.Provider>;
}
export function useDayJourneys(dayId: string, visible: boolean) {
  const context = useContext(Context), reference = context?.reference, revision = context?.revision, pending = context?.pending;
  const [state, setState] = useState<{ key: string; report: JourneyReport | null; failed: boolean } | null>(null);
  const key = `${reference}:${revision}:${dayId}:${pending}`;
  useEffect(() => {
    if (!reference || !visible || pending) return;
    const abort = new AbortController();
    const query = new URLSearchParams({ day: dayId, revision: String(revision) });
    fetch(`/api/trips/${encodeURIComponent(reference)}/journeys?${query}`, { signal: abort.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<{ revision: number; report: JourneyReport | null }>; })
      .then(body => { if (!abort.signal.aborted) setState({ key, report: body.revision === revision ? body.report : null, failed: body.revision !== revision }); })
      .catch(() => { if (!abort.signal.aborted) setState({ key, report: null, failed: true }); });
    return () => abort.abort();
  }, [reference, revision, dayId, pending, key, visible]);
  if (!context) return null;
  return { report: !pending && state?.key === key ? state.report : null, pending: !!pending, failed: state?.key === key && state.failed, loading: !pending && state?.key !== key };
}
export function JourneyStatus({ state }: { state: ReturnType<typeof useDayJourneys> }) {
  if (!state) return null;
  const report = state.report;
  const reminders = report?.findings.filter(finding => finding.code !== "journey_time" && finding.code !== "journey_unverified") ?? [];
  const heading = state.pending ? "Journeys for these edits are not yet saved" : state.loading ? "Loading journey checks" : report?.status === "checked" ? "Journeys fit the suggested times" : report?.status === "conflict" ? "Some journeys need more time" : "Some journeys still need checking";
  const walking = report?.legs.filter(leg => leg.mode === "walk" && leg.distanceMeters !== null) ?? [];
  return <section className="dp-journeys" aria-label="Journey checks"><h3>{heading}</h3>
    {!!report?.legs.some(leg => leg.distanceMeters !== null) && <p>{!!walking.length && <>{(report.walkingMeters / 1000).toFixed(1)} km mapped walking · </>}{Math.round(report.movingMinutes)} min suggested for mapped journeys{report.status !== "checked" ? " (partial check)" : ""}</p>}
    {state.failed && <p>Map checks could not be loaded. Travel times remain unverified.</p>}
    {(!!report?.legs.some(leg => leg.status !== "checked") || !!reminders.length) && <ul>
      {report?.legs.filter(leg => leg.status !== "checked").map(leg => <li key={leg.id}>{leg.fromLabel && leg.toLabel && <strong>{leg.fromLabel} to {leg.toLabel}: </strong>}{leg.reason}</li>)}
      {reminders.map((finding, index) => <li key={`reminder-${index}`}>{finding.message}</li>)}
    </ul>}
    {!!report?.legs.some(leg => leg.evidenceId) && <p>Map estimates by <a href="https://openrouteservice.org" target="_blank" rel="noreferrer">openrouteservice</a>.</p>}
    {!state.loading && !state.pending && report && !report.legs.length && <p>No connecting journeys have been verified yet.</p>}
  </section>;
}
