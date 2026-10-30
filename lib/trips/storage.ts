import { REFERENCE_PATTERN, type RecentTrip, type Trip } from "./types";

export const STORAGE_KEY = "italy-trips:recent:v1";

export function readRecent(): RecentTrip[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Invalid recent trips");
  return parsed
    .filter(
      (item): item is RecentTrip =>
        !!item &&
        typeof item.reference === "string" &&
        REFERENCE_PATTERN.test(item.reference) &&
        typeof item.name === "string" &&
        item.name.length <= 100 &&
        typeof item.lastOpened === "string" &&
        Number.isFinite(Date.parse(item.lastOpened)),
    )
    .slice(0, 100);
}

export function rememberTrip(trip: Trip): boolean {
  try {
    let recent: RecentTrip[];
    try {
      recent = readRecent();
    } catch {
      recent = [];
    }
    const entry = {
      reference: trip.reference,
      name: trip.name,
      lastOpened: new Date().toISOString(),
    };
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        [entry, ...recent.filter((t) => t.reference !== trip.reference)].slice(0, 100),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

export function forgetTrip(reference: string) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(readRecent().filter((t) => t.reference !== reference)),
  );
}
