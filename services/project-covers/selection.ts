import type { Place } from "@/lib/catalog";
import type { ProjectCoverPhoto } from "@/lib/project-cover/types";
import { resolveLocation, type Plan } from "@/lib/plan";

export function selectCoverPhotos(plan: Plan | null, places: readonly Place[]): ProjectCoverPhoto[] {
  if (!plan) return [];
  const catalog = new Map(places.map(place => [place.id, place]));
  // Resolve scheduled places.
  const days = plan.days.map(day => day.itemIds.flatMap(id => {
    const item = plan.items[id];
    if (!item || item.kind === "travel" || item.reservation?.state === "cancelled") return [];
    try {
      const location = resolveLocation(plan, item.location);
      const place = location?.type === "catalog" ? catalog.get(location.placeId) : undefined;
      return place?.photo ? [{ placeId: place.id, name: place.name, photo: place.photo }] : [];
    } catch {
      return []; // Older invalid references stay blank.
    }
  }));
  const selected: ProjectCoverPhoto[] = [];
  const assets = new Set<string>();
  const ids = new Set<string>();
  const paths = new Set<string>();
  const add = (candidate: ProjectCoverPhoto) => {
    const asset = `${candidate.photo.provider}:${candidate.photo.provider_id}`;
    const url = new URL(candidate.photo.url);
    const path = `${url.origin}${url.pathname}`;
    if (selected.length >= 3 || ids.has(candidate.placeId) || assets.has(asset) || paths.has(path)) return false;
    selected.push(candidate);
    ids.add(candidate.placeId); assets.add(asset); paths.add(path);
    return true;
  };
  // Represent each day first.
  for (const day of days) day.some(add);
  for (const candidate of days.flat()) add(candidate);
  // Preserve itinerary order.
  const order = days.flat().map(place => place.placeId);
  return selected.sort((a, b) => order.indexOf(a.placeId) - order.indexOf(b.placeId));
}
