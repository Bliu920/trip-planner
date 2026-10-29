import "server-only";
import type { Coordinate, GeoEvidence, Position, PositionQuery, Route } from "@/lib/journeys";
import { fetchRoute, searchPosition } from "./client";
import { cacheKey, readEvidence, saveEvidence } from "./store";
import { normalize } from "./matching";
export { readEvidence, cacheKey } from "./store";
export { distance, normalize } from "./matching";
export const geoConfigured = () => !!process.env.HEIGIT_API_KEY;
export async function resolvePlace(trip: string, query: PositionQuery, signal: AbortSignal, online = true, canRequest: () => boolean = () => true): Promise<GeoEvidence<Position> | null> {
  // Reuse fresh positioning.
  const key = cacheKey(["position-v1", normalize(query.name), normalize(query.address), normalize(query.city)]);
  const cached = await readEvidence<Position>(trip, key, null, signal);
  if (cached || !online || !geoConfigured() || !canRequest()) return cached;
  // Persist provider evidence.
  return saveEvidence(trip, key, "position", await searchPosition(query, signal), signal);
}
export async function getRoute(trip: string, from: Coordinate, to: Coordinate, mode: "walk" | "car", signal: AbortSignal, online = true, canRequest: () => boolean = () => true): Promise<GeoEvidence<Route> | null> {
  // Select directional evidence.
  const key = cacheKey(["route-v1-no-ferries", from, to, mode]);
  const cached = await readEvidence<Route>(trip, key, null, signal);
  if (cached || !online || !geoConfigured() || !canRequest()) return cached;
  return saveEvidence(trip, key, "route", await fetchRoute(from, to, mode, signal), signal);
}
