import type { Place as PlanningPlace } from "@/lib/plan";
import type { PlacePhoto } from "./photo";
import { queryCatalog } from "./query";

// Extend the existing contract.
export type Place = PlanningPlace & {
  region: string;
  neighborhood: string | null;
  rating: number;
  photo?: PlacePhoto | null;
};

export function filterPlaces(places: readonly Place[], query: string, city: string, type: string): Place[] {
  return queryCatalog(places, { query, cities: city ? [city] : [], types: type ? [type] : [], limit: 200 }).places;
}
export function typeLabel(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function catalogText(value: string) { return value.replace(/[\u2013\u2014]/g, "-"); }
export function durationLabel(minutes: number | null, maxMinutes: number | null = minutes): string {
  if (minutes === null) return "Not available";
  if (maxMinutes !== null && maxMinutes !== minutes) return `${durationLabel(minutes)} to ${durationLabel(maxMinutes)}`;
  const hours = Math.floor(minutes / 60); const remainder = minutes % 60;
  return [hours ? `${hours} hr` : "", remainder || !hours ? `${remainder} min` : ""].filter(Boolean).join(" ");
}
