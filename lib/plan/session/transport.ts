"use client";
import type { Plan, PlanSnapshot } from "../types";
import type { Place } from "../model";
import type { Photo } from "../presentation/model";
export type PlanView = PlanSnapshot & { places: Place[]; fallbackPhotos?: Photo[] };
const url = (reference: string) =>
  `/api/trips/${encodeURIComponent(reference)}/plan`;
export class PlanRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "PlanRequestError"; }
}
async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new PlanRequestError(body.error || "Could not update the plan.", response.status);
  return body;
}
export function loadPlan(reference: string, signal?: AbortSignal) {
  return fetch(url(reference), {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  }).then(json<PlanView>);
}
export function updatePlan(
  reference: string,
  revision: number,
  plan: Plan,
  requestId: string,
) {
  return fetch(url(reference), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, plan, requestId }),
    signal: AbortSignal.timeout(30000),
  }).then(json<{ savedRevision: number; snapshot: PlanSnapshot }>);
}
