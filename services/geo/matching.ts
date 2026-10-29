import { z } from "zod";
import type { Coordinate, Position, PositionQuery } from "@/lib/journeys";
export const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string> = { roma: "rome", firenze: "florence", venezia: "venice", milano: "milan", napoli: "naples", torino: "turin" };
const cityKey = (value: string) => aliases[normalize(value)] ?? normalize(value);
const stopWords = new Set(["via", "viale", "piazza", "piazzale", "calle", "campo", "fondamenta", "della", "delle", "dei", "del", "di", "san", "santa", "italy", "italia", "ita", "it"]);
const property = z.object({ name: z.string().default(""), label: z.string().default(""), locality: z.string().default(""), localadmin: z.string().default(""),
  country_a: z.string().default(""), layer: z.string(), street: z.string().default(""), housenumber: z.string().default(""), confidence: z.number().nullable().optional() });
const responseSchema = z.object({ features: z.array(z.object({ geometry: z.object({ type: z.literal("Point"), coordinates: coordinate }), properties: property })).max(20) });
export function matchPosition(query: PositionQuery, raw: unknown): Position {
  const features = responseSchema.parse(raw).features;
  const numbers = [...query.address.matchAll(/\b(\d{1,4}(?:\s*\/\s*[a-z]|[a-z])?)\b/gi)].map(match => normalize(match[1]));
  const house = numbers.at(-1);
  const cityWords = new Set(query.city.toLowerCase().split(/[^a-z]+/));
  const words = query.address.replace(/\([A-Za-z]{2}\)/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 1 && !/\d/.test(word) && !stopWords.has(word) && !cityWords.has(word) && cityKey(word) !== cityKey(query.city));
  const matched = features.filter(({ properties: p }) => p.country_a === "ITA" && ["address", "venue"].includes(p.layer) &&
    [p.locality, p.localadmin].some(city => cityKey(city) === cityKey(query.city)) && !!house && normalize(p.housenumber) === house &&
    words.length > 0 && words.every(word => normalize(p.street).includes(word)));
  const unique = new Map(matched.map(feature => [feature.geometry.coordinates.map(n => n.toFixed(5)).join(","), feature]));
  return { query, status: unique.size === 1 ? "matched" : features.length ? "ambiguous" : "not_found",
    coordinates: unique.size === 1 ? [...unique.values()][0].geometry.coordinates : null,
    candidates: features.slice(0, 5).map(({ geometry, properties: p }) => ({ name: p.name, address: p.label, city: p.locality || p.localadmin,
      layer: p.layer, score: p.confidence ?? null, coordinates: geometry.coordinates })) };
}
export function distance(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180, lat = (b[1] - a[1]) * rad, lon = (b[0] - a[0]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
