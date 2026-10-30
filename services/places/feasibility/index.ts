import "server-only";
import { resolveLocation, inspectPlan, type Plan, type Place, type PlanFinding } from "@/lib/plan";
import { bufferedMinutes, deriveJourneys, locationKey, staysAfter, type CheckedLeg, type JourneyReport } from "@/lib/journeys";
import { cacheKey, getRoute } from "@/services/places/geo";
import { positionFor } from "./routes";
export { handleJourneys } from "./http";
export { inspectGeoSources } from "./routes";

export function journeyFingerprint(plan: Plan) {
  return cacheKey([plan.startDate?.value, plan.days.map(day => [day.id, day.itemIds, day.startLocation, day.endLocation]),
    Object.values(plan.items).sort((a, b) => a.id.localeCompare(b.id)).map(item => [item.id, item.kind, item.kind === "travel" ? [item.from, item.to, item.mode, item.timing] : [item.location, item.kind === "stay" ? item.coverage : item.timing]]),
    plan.notes.filter(note => note.kind === "conflict").map(note => [note.relatedItemIds])]);
}
/** Current Plan determines the required legs; tool-selected subsets cannot bypass final validation. */
export async function checkJourneys(trip: string, plan: Plan, places: readonly Place[], parent: AbortSignal, online = true, dayIds: readonly string[] = []): Promise<JourneyReport> {
  parent.throwIfAborted();
  const signal = AbortSignal.any([parent, AbortSignal.timeout(12000)]);
  const requiredIds = new Set(plan.days.filter(day => !dayIds.length || dayIds.includes(day.id)).flatMap(day => day.itemIds));
  const requested = deriveJourneys(plan).filter(leg => !dayIds.length || dayIds.includes(leg.dayId)), legs: CheckedLeg[] = new Array(requested.length);
  const findings: PlanFinding[] = inspectPlan(plan, places, plan).findings.filter(finding =>
    (finding.code === "overlap" || finding.code === "interval") && (!dayIds.length || finding.itemIds.some(id => requiredIds.has(id))));
  let remainingRequests = 24;
  const canRequest = () => remainingRequests-- > 0;
  const positions = new Map<string, ReturnType<typeof positionFor>>();
  const point = (location: import("@/lib/plan").Location | null) => {
    const key = locationKey(plan, location);
    if (!positions.has(key)) positions.set(key, positionFor(trip, plan, location, places, signal, online, canRequest));
    return positions.get(key)!;
  };
  const label = (location: import("@/lib/plan").Location | null) => {
    const resolved = resolveLocation(plan, location);
    return resolved?.type === "catalog" ? places.find(place => place.id === resolved.placeId)?.name ?? "Place" : resolved && "label" in resolved ? resolved.label : "Location to confirm";
  };
  let next = 0;
  // Bound independent route requests.
  await Promise.all(Array.from({ length: Math.min(3, requested.length) }, async () => {
    while (next < requested.length) {
      const index = next++, leg = requested[index];
      const result: CheckedLeg = { id: leg.id, dayId: leg.dayId, fromItemId: leg.from.id, toItemId: leg.to.id, mode: leg.mode, fromLabel: label(leg.from.location), toLabel: label(leg.to.location),
        status: "unverified", distanceMeters: null, durationSeconds: null, reservedMinutes: null, availableMinutes: leg.availableMinutes,
        evidenceId: null, checkedAt: null, reason: null };
      legs[index] = result;
      try {
        if (leg.mode === "unsupported") { result.reason = "Check the service timetable, waiting time and full journey separately."; continue; }
        signal.throwIfAborted();
        const [from, to] = await Promise.all([point(leg.from.location), point(leg.to.location)]);
        if (!from || !to) { result.reason = "A precise position is missing. Check the address or confirm the proposed base."; continue; }
        const samePosition = from[0] === to[0] && from[1] === to[1];
        const route = samePosition ? { id: null, checkedAt: null, payload: { distanceMeters: 0, durationSeconds: 0, geometry: [from, to], snapMeters: 0 } }
          : await getRoute(trip, from, to, leg.mode, signal, online, canRequest);
        if (!route) { result.reason = "A map estimate has not been obtained for this journey."; continue; }
        const reserved = samePosition ? 0 : bufferedMinutes(route.payload.durationSeconds);
        Object.assign(result, { distanceMeters: route.payload.distanceMeters, durationSeconds: route.payload.durationSeconds, reservedMinutes: reserved,
          evidenceId: route.id, checkedAt: route.checkedAt, geometry: route.payload.geometry, fromCoordinates: from, toCoordinates: to });
        if (route.payload.snapMeters > 100) { result.reason = "The route endpoint is away from the supplied position. Confirm the entrance."; continue; }
        const available = leg.allocatedMinutes !== null && leg.availableMinutes !== null ? Math.min(leg.allocatedMinutes, leg.availableMinutes) : leg.allocatedMinutes ?? leg.availableMinutes;
        if (available === null) { result.reason = "Map estimate obtained; departure or arrival timing still needs review."; continue; }
        if (available < reserved || leg.allocatedMinutes !== null && leg.availableMinutes !== null && leg.allocatedMinutes > leg.availableMinutes) {
          result.status = "conflict"; result.reason = leg.allocatedMinutes !== null && leg.availableMinutes !== null && leg.allocatedMinutes > leg.availableMinutes
            ? `This journey is allocated ${leg.allocatedMinutes} minutes, but only ${Math.max(0, leg.availableMinutes)} minutes fit between its surrounding arrangements.`
            : `Allow ${reserved} minutes for this journey; only ${Math.max(0, available)} minutes are available.`;
          const ids = [...new Set([leg.from.id, leg.to.id, ...leg.travelItemIds])].filter(id => !!plan.items[id]);
          const acknowledged = plan.notes.some(note => note.kind === "conflict" && ids.every(id => note.relatedItemIds.includes(id)));
          findings.push({ code: "journey_time", severity: acknowledged ? "warning" : "error", itemIds: ids, message: result.reason });
        } else result.status = "checked";
      } catch {
        parent.throwIfAborted();
        result.reason = "The route could not be verified. Its travel time remains uncertain.";
      }
    }
  }));
  // Preserve incomplete coverage explicitly.
  for (let index = 0; index < 2; index++) if ((!dayIds.length || (dayIds.includes(plan.days[index].id) || dayIds.includes(plan.days[index + 1].id))) && !staysAfter(plan, index).length)
    findings.push({ code: "stay_coverage", severity: "warning", itemIds: [], message: `An overnight base is not assigned after Day ${index + 1}. Confirm lodging or explain why no stay is needed.` });
  for (const leg of legs) if (leg.status === "unverified") findings.push({ code: "journey_unverified", severity: "warning",
    itemIds: [...new Set([leg.fromItemId, leg.toItemId])].filter(id => !!plan.items[id]), message: leg.reason! });
  const conflict = legs.some(leg => leg.status === "conflict") || findings.some(finding => finding.code === "overlap" || finding.code === "interval"), unknown = !legs.length || legs.some(leg => leg.status === "unverified") || findings.some(finding => finding.code === "stay_coverage");
  return { fingerprint: journeyFingerprint(plan), status: conflict ? "conflict" : unknown ? "unverified" : "checked", legs, findings,
    walkingMeters: legs.reduce((sum, leg) => sum + (leg.mode === "walk" ? leg.distanceMeters ?? 0 : 0), 0),
    movingMinutes: legs.reduce((sum, leg) => sum + (leg.reservedMinutes ?? 0), 0) };
}
export function journeySummary(report: JourneyReport) {
  return { ...report, legs: report.legs.map(({ geometry: _geometry, ...leg }) => { void _geometry; return leg; }) };
}
