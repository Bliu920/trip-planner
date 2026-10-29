import type { Place } from "@/lib/catalog";

export type PlaceReference = Pick<Place, "id" | "name" | "city" | "photo">;
export const MAX_PLACE_REFERENCES = 103;

export function parsePlaceIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_PLACE_REFERENCES || new Set(value).size !== value.length || value.some(id => typeof id !== "string" || !/^place_\d{3}$/.test(id))) {
    throw new Error("Select valid, distinct places from Explore.");
  }
  return value as string[];
}

export function togglePlace(places: Place[], place: Place): Place[] {
  return places.some(item => item.id === place.id) ? places.filter(item => item.id !== place.id) : [...places, place];
}

export async function loadPlaceReferences(ids: string[], signal?: AbortSignal): Promise<Place[]> {
  parsePlaceIds(ids);
  if (!ids.length) return [];
  const response = await fetch("/api/places", { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Could not load selected places. Please try again.");
  const places: Place[] = await response.json();
  return ids.map(id => {
    const place = places.find(item => item.id === id);
    if (!place) throw new Error("A selected place is unavailable. Return to Explore and update your selection.");
    return place;
  });
}
