import "server-only";
import { z } from "zod";
import type { Coordinate, Position, PositionQuery, Route } from "@/lib/journeys";
import { coordinate, distance, positionMatch, streetAddress } from "./matching";
export async function heigit(path: string, signal: AbortSignal, body?: unknown, strategy?: "venue" | "address") {
  const key = process.env.HEIGIT_API_KEY;
  if (!key) throw new Error("Map lookup is unavailable.");
  const started = Date.now(), deadline = AbortSignal.timeout(6000);
  let status: number | null = null, outcome = "ok";
  try {
    const response = await fetch(`https://api.heigit.org${path}`, {
      method: body ? "POST" : "GET", headers: { Authorization: key, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store",
      signal: AbortSignal.any([signal, deadline]),
    });
    status = response.status;
    if (!response.ok) { outcome = "http_error"; throw new Error(status === 429 ? "Map lookup is temporarily busy." : "No usable map result was returned."); }
    const text = await response.text();
    if (text.length > 2000000) { outcome = "oversized"; throw new Error("Map result is too large."); }
    try { return JSON.parse(text) as unknown; }
    catch { outcome = "invalid_json"; throw new Error("Map result could not be read."); }
  } catch (error) {
    if (outcome === "ok") outcome = signal.aborted ? "cancelled" : deadline.aborted ? "timeout" : "network_error";
    throw error;
  } finally {
    // Log facts without locations.
    console.info(JSON.stringify({ event: "geo_request", operation: body ? "directions" : "position", strategy, httpStatus: status, outcome, elapsedMs: Date.now() - started }));
  }
}
export async function searchPosition(query: PositionQuery, signal: AbortSignal, canRequest: () => boolean = () => true): Promise<Position | null> {
  // Try identity, then address.
  for (const strategy of ["venue", "address"] as const) {
    signal.throwIfAborted();
    if (!canRequest()) { console.info(JSON.stringify({ event: "geo_lookup", kind: "position", status: "request_budget", strategy })); return null; }
    const text = strategy === "venue" ? `${query.name}, ${query.address}, ${query.city}` : `${streetAddress(query)}, ${query.city}`;
    const params = new URLSearchParams({ text, "boundary.country": "ITA", size: "5" });
    const raw = await heigit(`/pelias/v1/search?${params}`, signal, undefined, strategy);
    let result: ReturnType<typeof positionMatch>;
    try { result = positionMatch(query, raw); }
    catch { console.info(JSON.stringify({ event: "geo_position_match", strategy, status: "invalid_response" })); throw new Error("Map position result could not be validated."); }
    console.info(JSON.stringify({ event: "geo_position_match", strategy, status: result.position.status, conflictingMatches: result.conflictingMatches }));
    if (result.position.status === "matched" || result.conflictingMatches || strategy === "address") return result.position;
  }
  return null;
}
const routeSchema = z.object({ features: z.array(z.object({ properties: z.object({ summary: z.object({ distance: z.number().nonnegative().max(5000000), duration: z.number().nonnegative().max(10000000) }) }),
  geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(coordinate).min(2).max(50000) }) })).min(1) });
export async function fetchRoute(from: Coordinate, to: Coordinate, mode: "walk" | "car", signal: AbortSignal): Promise<Route> {
  const raw = await heigit(`/openrouteservice/v2/directions/${mode === "walk" ? "foot-walking" : "driving-car"}/geojson`, signal,
    { coordinates: [from, to], instructions: false, units: "m", options: { avoid_features: ["ferries"] } });
  const feature = routeSchema.parse(raw).features[0], geometry = feature.geometry.coordinates;
  return { from, to, mode, distanceMeters: feature.properties.summary.distance, durationSeconds: feature.properties.summary.duration,
    geometry, snapMeters: Math.max(distance(from, geometry[0]), distance(to, geometry.at(-1)!)) };
}
