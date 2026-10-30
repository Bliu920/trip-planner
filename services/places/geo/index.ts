import "server-only";
import type { Coordinate, GeoEvidence, Position, PositionQuery, Route } from "@/lib/journeys";
import { fetchRoute, searchPosition } from "./client";
import { cacheKey, readEvidence, saveEvidence } from "./store";
import { normalize, sameVenue } from "./matching";
export { readEvidence, cacheKey } from "./store";
export { distance, normalize, sameVenue } from "./matching";
export const geoConfigured = () => !!process.env.HEIGIT_API_KEY;
export async function resolvePlace(trip: string, query: PositionQuery, signal: AbortSignal, online = true, canRequest: () => boolean = () => true): Promise<GeoEvidence<Position> | null> {
  // Reuse fresh positioning.
  const key = cacheKey(["position-v2-address-fallback", normalize(query.name), normalize(query.address), normalize(query.city)]);
  let cached = await readEvidence<Position>(trip, key, null, signal);
  if (!cached) {
    const legacy = await readEvidence<Position>(trip, cacheKey(["position-v1", normalize(query.name), normalize(query.address), normalize(query.city)]), null, signal);
    if (legacy?.kind === "position" && legacy.payload.status === "matched") cached = legacy;
  }
  console.info(JSON.stringify({ event: "geo_cache", kind: "position", hit: !!cached, status: cached?.payload.status ?? null }));
  if (cached || !online || !geoConfigured()) return cached;
  // Persist provider evidence.
  const position = await searchPosition(query, signal, canRequest);
  return position ? saveEvidence(trip, key, "position", position, signal) : null;
}
export async function getRoute(trip: string, from: Coordinate, to: Coordinate, mode: "walk" | "car", signal: AbortSignal, online = true, canRequest: () => boolean = () => true): Promise<GeoEvidence<Route> | null> {
  // Select directional evidence.
  const key = cacheKey(["route-v1-no-ferries", from, to, mode]);
  const cached = await readEvidence<Route>(trip, key, null, signal);
  console.info(JSON.stringify({ event: "geo_cache", kind: "route", hit: !!cached }));
  if (cached || !online || !geoConfigured() || !canRequest()) return cached;
  return saveEvidence(trip, key, "route", await fetchRoute(from, to, mode, signal), signal);
}

/** Bind only server-issued positions to the exact researched venue. No network search. */
export async function readVenuePosition(trip: string, query: PositionQuery, evidenceId: string | undefined, signal: AbortSignal): Promise<GeoEvidence<Position> | null> {
  let result: GeoEvidence<Position> | null;
  try { result = evidenceId ? await readEvidence<Position>(trip, null, evidenceId, signal) : await resolvePlace(trip, query, signal, false); }
  catch (error) {
    signal.throwIfAborted();
    if (evidenceId) throw error;
    console.info(JSON.stringify({ event: "geo_binding", status: "cache_unavailable" }));
    return null;
  }
  const valid = result?.kind === "position" && result.payload.status === "matched" && result.payload.coordinates &&
    Date.parse(result.expiresAt) > Date.now() && sameVenue(query, result.payload.query);
  if (valid) return result;
  if (evidenceId) throw new Error("This map reference is missing, expired or does not match the venue. Resolve its name, address and city again and use the matched evidence ID.");
  return null;
}
