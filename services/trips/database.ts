import "server-only";
import type { Trip } from "../../lib/trips/types";
import { TripError } from "./validation";

export async function queryTrip(method: "POST" | "GET" | "PATCH", reference: string, details?: { name: string; notes?: string }) {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    throw new TripError("Trips are temporarily unavailable. Please try again later.", 503);
  }
  const url = new URL("/rest/v1/trips", baseUrl);
  url.searchParams.set("select", "reference,name,notes,created_at,updated_at");
  if (method !== "POST") url.searchParams.set("reference", `eq.${reference}`);
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  // Legacy keys need bearer auth.
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method, headers, cache: "no-store", signal: AbortSignal.timeout(10000),
      body: method === "GET" ? undefined : JSON.stringify(method === "POST" ? { reference, ...details } : details),
    });
  } catch {
    throw new TripError("Could not reach your trip. Please try again shortly.", 503);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (detail.message === "PLANNING_NOTES_FROZEN") throw new TripError("Update the Travel brief in Trip details to change your preferences or requirements.", 409);
    throw new TripError("Your trip is temporarily unavailable. Please try again shortly.", 503);
  }
  const rows: Trip[] = await response.json();
  if (!rows[0]) throw new TripError("No trip matches that reference. Check the ID and try again.", 404);
  return rows[0];
}
