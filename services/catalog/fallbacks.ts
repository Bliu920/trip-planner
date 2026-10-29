import "server-only";
import { z } from "zod";

const coversSchema = z.array(z.object({
  slot: z.number().int().min(1).max(3),
  url: z.string().regex(/^https:\/\/images\.pexels\.com\/photos\/[0-9]+\/pexels-photo-[0-9]+\.jpeg$/),
  source_url: z.url().refine(value => { const url = new URL(value); return url.origin === "https://www.pexels.com" && url.pathname.startsWith("/photo/") && !url.username && !url.password; }),
  photographer: z.string().min(1),
  alt: z.string().min(1),
})).length(3).refine(rows => rows.every((row, index) => row.slot === index + 1) && new Set(rows.map(row => row.url)).size === 3, "Three distinct, ordered day covers are required.");

export async function loadDayCoverPhotos() {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return [];
  try {
    // Read the shared pool.
    const url = new URL("/rest/v1/day_cover_photos", base);
    url.searchParams.set("select", "slot,url,source_url,photographer,alt");
    url.searchParams.set("order", "slot.asc");
    const headers: Record<string, string> = { apikey: key };
    if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Day cover pool unavailable.");
    // Expose display metadata only.
    return coversSchema.parse(await response.json()).map(photo => ({
      src: `${photo.url}?auto=compress&fit=crop&w=650&h=240`,
      alt: photo.alt, credit: photo.photographer, creditUrl: photo.source_url,
    }));
  } catch {
    // Keep the itinerary usable.
    console.warn("Day cover photos unavailable. Check the photo pool and its migration.");
    return [];
  }
}
