import "server-only";
import { placeSchema } from "./validation";

export async function readCatalog(base: string, key: string) {
  const url = new URL("/rest/v1/places", base);
  url.searchParams.set("select", "*,photo:place_photos(*)");
  url.searchParams.set("order", "source_order.asc");
  url.searchParams.set("limit", "1000");
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (response.status === 404) {
    const error = await response.json().catch(() => null);
    if (error?.code === "PGRST205") return null;
  }
  if (!response.ok) throw new Error(`Catalog unavailable (${response.status}).`);
  const places = placeSchema.array().parse(await response.json());
  if (places.some(place => place.photo && place.photo.place_id !== place.id)) throw new Error("Catalog photo does not match its place.");
  return places;
}
