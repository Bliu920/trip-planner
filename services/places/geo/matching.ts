import { z } from "zod";
import type { Coordinate, Position, PositionQuery } from "@/lib/journeys";
export const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string> = { roma: "rome", firenze: "florence", venezia: "venice", milano: "milan", napoli: "naples", torino: "turin" };
const cityKey = (value: string) => aliases[normalize(value)] ?? normalize(value);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Remove postal locality suffixes, never words inside the street name. */
export function streetAddress(query: PositionQuery) {
  const cities = [query.city, cityKey(query.city), ...Object.keys(aliases).filter(city => cityKey(city) === cityKey(query.city))];
  let address = query.address.trim().replace(/[,\s]+(?:italy|italia|ita|it)\s*$/i, "").replace(/\s*\(([A-Z]{2})\)\s*$/i, " $1");
  address = address.replace(new RegExp(`[,\\s]+(?:\\d{5}[,\\s]+)?(?:${cities.map(escapeRegex).join("|")})(?:[,\\s]+[A-Z]{2})?\\s*$`, "i"), "");
  return address.replace(/[,\s]+\d{5}\s*$/, "").trim();
}
function addressParts(query: PositionQuery) {
  const address = streetAddress(query);
  const match = address.match(/^(.*\S)[,\s]+(\d{1,4}(?:\s*\/\s*[a-z]|[a-z])?)$/i);
  return match ? { street: normalize(match[1].replace(/,$/, "")), house: normalize(match[2]) } : null;
}
const property = z.object({ name: z.string().default(""), label: z.string().default(""), locality: z.string().default(""), localadmin: z.string().default(""),
  country_a: z.string().default(""), layer: z.string(), street: z.string().default(""), housenumber: z.string().default(""), confidence: z.number().nullable().optional() });
const responseSchema = z.object({ features: z.array(z.object({ geometry: z.object({ type: z.literal("Point"), coordinates: coordinate }), properties: property })).max(20) });
export function positionMatch(query: PositionQuery, raw: unknown) {
  const features = responseSchema.parse(raw).features, address = addressParts(query);
  const matched = features.filter(({ properties: p }) => address && p.country_a === "ITA" && ["address", "venue"].includes(p.layer) &&
    [p.locality, p.localadmin].some(city => cityKey(city) === cityKey(query.city)) && normalize(p.housenumber) === address.house && normalize(p.street) === address.street);
  const unique = new Map(matched.map(feature => [feature.geometry.coordinates.map(n => n.toFixed(5)).join(","), feature]));
  const position: Position = { query, status: unique.size === 1 ? "matched" : features.length ? "ambiguous" : "not_found",
    coordinates: unique.size === 1 ? [...unique.values()][0].geometry.coordinates : null,
    candidates: features.slice(0, 5).map(({ geometry, properties: p }) => ({ name: p.name, address: p.label, city: p.locality || p.localadmin,
      layer: p.layer, score: p.confidence ?? null, coordinates: geometry.coordinates })) };
  return { position, conflictingMatches: unique.size > 1 };
}
export function matchPosition(query: PositionQuery, raw: unknown): Position { return positionMatch(query, raw).position; }
export function sameVenue(query: PositionQuery, other: PositionQuery) {
  return normalize(query.name) === normalize(other.name) && normalize(query.address) === normalize(other.address) && cityKey(query.city) === cityKey(other.city);
}
export function distance(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180, lat = (b[1] - a[1]) * rad, lon = (b[0] - a[0]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
