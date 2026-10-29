import "server-only";
import { z } from "zod";
import type { Coordinate, PositionQuery, Route } from "@/lib/journeys";
import { coordinate, distance, matchPosition } from "./matching";
export async function heigit(path: string, signal: AbortSignal, body?: unknown) {
  const key = process.env.HEIGIT_API_KEY;
  if (!key) throw new Error("Map lookup is unavailable.");
  const response = await fetch(`https://api.heigit.org${path}`, {
    method: body ? "POST" : "GET", headers: { Authorization: key, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "Map lookup is temporarily busy." : "No usable map result was returned.");
  const text = await response.text();
  if (text.length > 2000000) throw new Error("Map result is too large.");
  return JSON.parse(text) as unknown;
}
export async function searchPosition(query: PositionQuery, signal: AbortSignal) {
  const params = new URLSearchParams({ text: `${query.name}, ${query.address}, ${query.city}`, "boundary.country": "ITA", size: "5" });
  return matchPosition(query, await heigit(`/pelias/v1/search?${params}`, signal));
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
