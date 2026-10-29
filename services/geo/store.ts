import "server-only";
import { createHash } from "node:crypto";
import type { GeoEvidence, Position, Route } from "@/lib/journeys";
export function cacheKey(value: unknown) { return createHash("sha256").update(JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest("hex"); }
async function rpc<T>(operation: string, parameters: object, signal: AbortSignal): Promise<T> {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Map evidence storage is unavailable.");
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(new URL(`/rest/v1/rpc/${operation}`, base), { method: "POST", headers,
    body: JSON.stringify(parameters), signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]), cache: "no-store" });
  if (!response.ok) throw new Error("Map evidence storage is unavailable.");
  return response.json();
}
export function readEvidence<T extends Position | Route>(trip: string, key: string | null, id: string | null, signal: AbortSignal) {
  return rpc<GeoEvidence<T> | null>("geo_read", { p_trip: trip, p_key: key, p_id: id }, signal);
}
export function saveEvidence<T extends Position | Route>(trip: string, key: string, kind: "position" | "route", payload: T, signal: AbortSignal) {
  return rpc<GeoEvidence<T>>("geo_record", { p_trip: trip, p_key: key, p_kind: kind, p_payload: payload }, signal);
}
