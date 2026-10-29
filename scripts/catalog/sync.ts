import assert from "node:assert/strict";
import type { Place, PlacePhoto } from "../../lib/catalog";
import { photoManifestSchema } from "../../services/catalog/validation";

function credentials() {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase URL and service key are required.");
  return { base, key };
}
async function request(table: string, method: string, body?: unknown) {
  const { base, key } = credentials();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  if (method === "POST") headers.Prefer = "resolution=merge-duplicates,return=minimal";
  const response = await fetch(new URL(`/rest/v1/${table}`, base), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Catalog ${method} failed (${response.status}). Apply the catalog migration first.`);
  return response;
}
export async function syncCatalog(places: readonly Place[], photos: readonly PlacePhoto[]) {
  photoManifestSchema.parse(photos);
  // Seed facts, then enrichment.
  await request("places?on_conflict=id", "POST", places.map((place, source_order) => ({ ...place, source_order })));
  await request("place_photos?on_conflict=place_id", "POST", photos);
  await verifyCatalog(places, photos);
}
export async function syncPhotos(photos: readonly PlacePhoto[]) {
  // Validate before writing.
  const validated = photoManifestSchema.parse(photos);
  const before = await (await request("place_photos?select=*&order=place_id.asc&limit=1000", "GET")).json() as PlacePhoto[];
  assert.deepEqual(before.map(photo => photo.place_id).sort(), validated.map(photo => photo.place_id).sort(), "Photo updates require the existing catalog's complete place coverage.");
  const current = new Map(before.map(photo => [photo.place_id, photo]));
  const changed = validated.filter(photo => !Object.entries(photo).every(([key, value]) => current.get(photo.place_id)?.[key as keyof PlacePhoto] === value));
  // Update enrichment only.
  if (changed.length) await request("place_photos?on_conflict=place_id", "POST", changed);
  const after = await (await request("place_photos?select=*&order=place_id.asc&limit=1000", "GET")).json();
  assert.deepEqual(after, [...validated].sort((a, b) => a.place_id.localeCompare(b.place_id)));
  console.log(`Updated ${changed.length} photo records; verified ${after.length} distinct photo assignments. Place facts were not written.`);
}
export async function verifyCatalog(places: readonly Place[], photos: readonly PlacePhoto[]) {
  const rows = await (await request("places?select=*&order=source_order.asc&limit=1000", "GET")).json();
  const images = await (await request("place_photos?select=*&order=place_id.asc&limit=1000", "GET")).json();
  assert.deepEqual(rows, places.map((place, source_order) => ({ ...place, source_order })));
  assert.deepEqual(images, [...photos].sort((a, b) => a.place_id.localeCompare(b.place_id)));
  console.log(`Verified ${rows.length} original place records and ${images.length} photo records in Supabase.`);
}
export async function checkImages(photos: readonly PlacePhoto[]) {
  const urls = [...new Set(photos.map(photo => photo.url))];
  const failed: string[] = [];
  for (let start = 0; start < urls.length; start += 6) {
    await Promise.all(urls.slice(start, start + 6).map(async url => {
      try {
        const response = await fetch(`${url}?auto=compress&w=400`, { method: "HEAD", signal: AbortSignal.timeout(20000) });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) failed.push(url);
      } catch { failed.push(url); }
    }));
  }
  if (failed.length) throw new Error(`Images unavailable: ${failed.join(", ")}`);
  console.log(`Verified ${urls.length} unique image URLs.`);
}
