import { z } from "zod";

export const photoSchema = z.object({
  place_id: z.string().regex(/^place_[0-9]+$/),
  provider: z.enum(["pexels", "unsplash"]),
  provider_id: z.string().min(1),
  url: z.url(),
  source_url: z.url(),
  photographer: z.string().min(1),
  alt: z.string().min(1),
  match: z.enum(["place", "illustrative"]),
  verified_at: z.iso.date(),
}).superRefine((photo, context) => {
  let image: URL;
  let source: URL;
  try { image = new URL(photo.url); source = new URL(photo.source_url); }
  catch { context.addIssue({ code: "custom", message: "Photo URLs must be valid HTTPS addresses." }); return; }
  const imageHost = photo.provider === "pexels" ? "images.pexels.com" : "images.unsplash.com";
  const sourceHost = photo.provider === "pexels" ? "www.pexels.com" : "unsplash.com";
  if (image.protocol !== "https:" || source.protocol !== "https:" || image.hostname !== imageHost || source.hostname !== sourceHost || image.username || source.username || image.port || source.port) {
    context.addIssue({ code: "custom", message: "Photo URLs must belong to their provider." });
  }
});

export const placeSchema = z.object({
  id: z.string().regex(/^place_[0-9]+$/), name: z.string().min(1), type: z.string().min(1),
  city: z.string().min(1), region: z.string().min(1), neighborhood: z.string().nullable(),
  description: z.string(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  hours: z.string().nullable(), duration_minutes: z.number().int().positive().nullable(),
  price_range: z.string(), rating: z.number().min(0).max(5), tags: z.array(z.string()),
  seasonal_notes: z.string().nullable(), booking_required: z.boolean().nullable(),
  photo: photoSchema.nullable().optional(),
});

export const photoManifestSchema = photoSchema.array().superRefine((photos, context) => {
  const assets = new Set<string>();
  const urls = new Set<string>();
  for (const [index, photo] of photos.entries()) {
    const asset = `${photo.provider}:${photo.provider_id}`;
    const parsed = URL.canParse(photo.url) ? new URL(photo.url) : null;
    const url = parsed ? `${parsed.origin}${parsed.pathname}` : photo.url;
    if (assets.has(asset) || urls.has(url)) {
      context.addIssue({ code: "custom", path: [index], message: "Each place needs a distinct photo. Reusing an asset or changing its crop URL is not allowed." });
    }
    assets.add(asset);
    urls.add(url);
  }
});
