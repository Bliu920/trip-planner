import { z } from "zod";
import type { Place } from "./model";

const selections = z.array(z.string().trim().min(1).max(100)).max(40).default([]);
export const catalogQuerySchema = z.object({
  query: z.string().trim().max(200).default(""),
  cities: selections,
  regions: selections,
  types: selections,
  tagsAny: selections,
  tagsAll: selections,
  excludeTags: selections,
  priceRanges: z.array(z.enum(["€", "€€", "€€€", "€€€€"])).max(4).default([]),
  maxDurationMinutes: z.number().int().positive().max(1440).nullable().default(null),
  bookingRequired: z.boolean().nullable().default(null),
  sort: z.enum(["source", "rating", "duration"]).default("source"),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(200).default(20),
}).strict();
export type CatalogQuery = z.input<typeof catalogQuerySchema>;
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const tagKey = (value: string) => normalize(value).replaceAll("_", "-");
const selected = (values: string[], actual: string) => !values.length || values.some(value => normalize(value) === normalize(actual));
const counts = (values: string[]) => {
  const totals = new Map<string, number>();
  for (const value of values) totals.set(value, (totals.get(value) ?? 0) + 1);
  return Object.fromEntries([...totals].sort(([a], [b]) => a.localeCompare(b)));
};

export function describeCatalog(places: readonly Place[]) {
  return {
    total: places.length,
    cities: counts(places.map(place => place.city)),
    regions: counts(places.map(place => place.region)),
    types: counts(places.map(place => place.type)),
    tags: counts(places.flatMap(place => [...new Set(place.tags.map(tagKey))])),
    priceRanges: counts(places.map(place => place.price_range)),
    semantics: {
      filters: "Different filters intersect. Cities, regions, types and priceRanges accept any listed value. Query words must all match across searchable fields. Empty selections impose no restriction.",
      tags: "tagsAny matches any listed tag; tagsAll requires every tag; excludeTags rejects listed tags. Underscore and hyphen spellings are equivalent.",
      unknowns: "Unknown duration or booking requirements do not satisfy an explicit filter on that field. Without that filter they remain included and unknown.",
      prices: "Price ranges are catalog tiers, not EUR amounts. They cannot establish a trip total or an exact price ceiling.",
      limits: "Cities and tags describe dataset coverage, not comprehensive city quality. Tags are clues, not proof of accessibility or suitability. Hours are supplied facts, not live ticket availability. Straight-line location does not establish travel time.",
    },
  };
}

export function queryCatalog(places: readonly Place[], input: CatalogQuery = {}) {
  // Validate query semantics.
  const filters = catalogQuerySchema.parse(input);
  const words = normalize(filters.query).split(/\s+/).filter(Boolean);
  const anyTags = filters.tagsAny.map(tagKey), allTags = filters.tagsAll.map(tagKey), excluded = filters.excludeTags.map(tagKey);
  // Apply shared filters.
  const matches = places.filter(place => {
    if (!selected(filters.cities, place.city) || !selected(filters.regions, place.region) || !selected(filters.types, place.type) || !selected(filters.priceRanges, place.price_range)) return false;
    const tags = place.tags.map(tagKey);
    if (anyTags.length && !anyTags.some(tag => tags.includes(tag))) return false;
    if (!allTags.every(tag => tags.includes(tag)) || excluded.some(tag => tags.includes(tag))) return false;
    if (filters.maxDurationMinutes !== null && (place.duration_minutes === null || place.duration_minutes > filters.maxDurationMinutes)) return false;
    if (filters.bookingRequired !== null && place.booking_required !== filters.bookingRequired) return false;
    const text = normalize([place.name, place.city, place.region, place.neighborhood, place.description, place.type.replaceAll("_", " "), ...place.tags.map(tagKey)].join(" "));
    return words.every(word => text.includes(word));
  });
  if (filters.sort === "rating") matches.sort((a, b) => b.rating - a.rating);
  if (filters.sort === "duration") matches.sort((a, b) => (a.duration_minutes ?? Infinity) - (b.duration_minutes ?? Infinity));
  // Summarize before pagination.
  const cities = [...new Set(matches.map(place => place.city))].sort().map(city => {
    const local = matches.filter(place => place.city === city);
    return { city, count: local.length, types: counts(local.map(place => place.type)), priceRanges: counts(local.map(place => place.price_range)) };
  });
  const page = matches.slice(filters.offset, filters.offset + filters.limit);
  return {
    total: matches.length, cities, places: page,
    nextOffset: filters.offset + page.length < matches.length ? filters.offset + page.length : null,
    evidence: page.map(place => ({
      id: place.id,
      matchedTags: place.tags.filter(tag => [...anyTags, ...allTags].includes(tagKey(tag))),
      unknownFields: [place.hours === null ? "hours" : "", place.duration_minutes === null ? "duration_minutes" : "", place.booking_required === null ? "booking_required" : ""].filter(Boolean),
    })),
  };
}
