import "server-only";
import { sourcesIn, resolveLocation, type Location, type Plan, type PlanFinding, type Place } from "@/lib/plan";
import type { Coordinate, GeoEvidence, Position } from "@/lib/journeys";
import { readEvidence, resolvePlace, sameVenue } from "@/services/places/geo";

export async function inspectGeoSources(trip: string, plan: Plan, signal: AbortSignal): Promise<PlanFinding[]> {
  const findings: PlanFinding[] = [], evidence = new Map<string, GeoEvidence<Position> | null>();
  for (const source of sourcesIn(plan)) {
    if (source.type !== "geo" || evidence.has(source.evidenceId)) continue;
    const value = await readEvidence<Position>(trip, null, source.evidenceId, signal);
    evidence.set(source.evidenceId, value);
    if (!value) findings.push({ code: "geo_source", severity: "error", itemIds: [], message: "This map source is unavailable for your trip. Look up the place again." });
  }
  const entries = [
    ...Object.values(plan.items).flatMap(item => (item.kind === "travel" ? [item.from, item.to] : [item.location]).map(location => ({ location, itemIds: [item.id] }))),
    ...plan.days.flatMap(day => [day.startLocation, day.endLocation].map(location => ({ location, itemIds: [] as string[] }))),
  ];
  for (const { location, itemIds } of entries) {
    const loc = resolveLocation(plan, location);
    if ((loc?.type !== "restaurant" && loc?.type !== "hotel") || !loc.geoEvidenceId) continue;
    const source = evidence.get(loc.geoEvidenceId);
    if (!source || source.kind !== "position" || source.payload.status !== "matched" || !source.payload.coordinates ||
        !sameVenue(source.payload.query, { name: loc.label, address: loc.address, city: loc.city }) ||
        loc.longitude !== source.payload.coordinates[0] || loc.latitude !== source.payload.coordinates[1])
      findings.push({ code: "geo_source", severity: "error", itemIds, message: "The map position does not match this venue and address. Look it up again before saving." });
  }
  return findings;
}
export async function positionFor(trip: string, plan: Plan, location: Location | null, places: readonly Place[], signal: AbortSignal, online: boolean, canRequest: () => boolean): Promise<Coordinate | null> {
  const loc = resolveLocation(plan, location);
  if (loc?.type === "catalog") {
    const place = places.find(place => place.id === loc.placeId);
    return place ? [place.longitude, place.latitude] : null;
  }
  if (loc?.type === "specified") return loc.basis.kind === "user" && loc.latitude !== null && loc.longitude !== null ? [loc.longitude, loc.latitude] : null;
  if (loc?.type !== "restaurant" && loc?.type !== "hotel") return null;
  const evidence = loc.geoEvidenceId ? await readEvidence<Position>(trip, null, loc.geoEvidenceId, signal)
    : await resolvePlace(trip, { name: loc.label, address: loc.address, city: loc.city }, signal, online, canRequest);
  if (!evidence || evidence.kind !== "position" || Date.parse(evidence.expiresAt) <= Date.now() || evidence.payload.status !== "matched") return null;
  return evidence.payload.coordinates;
}
