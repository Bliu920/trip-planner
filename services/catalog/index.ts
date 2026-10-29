import "server-only";
export { loadDayCoverPhotos } from "./fallbacks";
import italy from "@/data/italy.json";
import photos from "@/data/place-photos.json";
import type { Place } from "@/lib/catalog";
import { readCatalog } from "./database";
import { photoSchema } from "./validation";

// Expose original source records.
const places: readonly Place[] = italy;
export function getPlaces(): readonly Place[] { return places; }

export function readPlaces(ids: string[], catalog: readonly Place[] = places) {
  return ids.map(id => {
    const place = catalog.find(record => record.id === id);
    if (!place) throw new Error(`Unknown catalog ID: ${id}`);
    return place;
  });
}

export async function loadCatalog(): Promise<readonly Place[]> {
  // Load configured SQL catalog.
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (base && key) {
    const stored = await readCatalog(base, key);
    if (stored !== null) {
      const expected = new Set(places.map(place => place.id));
      if (stored.length !== expected.size || stored.some(place => !expected.delete(place.id))) throw new Error("Catalog import is incomplete.");
      return stored;
    }
    console.warn("Catalog migration not applied; serving the bundled catalog preview.");
  }
  // Support pre-migration local previews.
  const images = new Map(photoSchema.array().parse(photos).map(photo => [photo.place_id, photo]));
  return places.map(place => ({ ...place, photo: images.get(place.id) ?? null }));
}
