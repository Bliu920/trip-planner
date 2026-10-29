import type { Trip } from "./types";
export type { Trip, RecentTrip } from "./types";
export { normalizeReference, REFERENCE_PATTERN } from "./types";
export { readRecent, rememberTrip, forgetTrip, STORAGE_KEY } from "./storage";

export async function requestTrip(method: "GET" | "POST" | "PATCH", reference?: string, details?: { name: string; notes?: string } | { prompt: string }, signal?: AbortSignal): Promise<Trip> {
  // Send trip operation.
  let response: Response;
  try {
    response = await fetch(reference ? `/api/trips/${encodeURIComponent(reference)}` : "/api/trips", {
      method, headers: { "Content-Type": "application/json" }, cache: "no-store", signal,
      body: details ? JSON.stringify(details) : undefined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Could not connect. Check your connection and try again.");
  }
  // Surface actionable errors.
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load or save the trip.");
  return body;
}

export { notifyTripChanged, subscribeTripChanges } from "./events";
