import { isDeepStrictEqual } from "node:util";
import type { Location, Plan, PlanFinding } from "@/lib/plan";

type Venue = Extract<Location, { type: "restaurant" | "hotel" }>;

function venues(plan: Plan | null): Venue[] {
  if (!plan) return [];
  const locations = [
    ...plan.days.flatMap(day => [day.startLocation, day.endLocation]),
    ...Object.values(plan.items).flatMap(item => item.kind === "travel"
      ? [item.from, item.to] : [item.location]),
  ];
  return locations.filter((location): location is Venue => (location?.type === "restaurant" || location?.type === "hotel"));
}

/** New researched venue facts need observed sources; saved facts retain their original evidence. */
export function inspectVenueSources(
  plan: Plan,
  previous: Plan | null,
  retrievedUrls: ReadonlySet<string>,
): PlanFinding[] {
  const saved = venues(previous);
  const findings: PlanFinding[] = [];
  for (const restaurant of venues(plan)) {
    const reused = saved.some(old => isDeepStrictEqual(old, restaurant));
    if (!reused && restaurant.latitude !== null && !restaurant.geoEvidenceId)
      findings.push({ code: "venue_position", severity: "error", itemIds: [], message: "Use a returned map position before saving venue coordinates, or leave both coordinates unknown." });
    for (const source of restaurant.basis.sources) {
      if (source.type !== "web") continue;
      if (Date.parse(source.accessedAt) > Date.now() + 300000)
        findings.push({ code: "restaurant_source", severity: "error", itemIds: [],
          message: "A venue source check cannot be dated in the future." });
      else if (!reused && !retrievedUrls.has(source.url))
        findings.push({ code: "restaurant_source", severity: "error", itemIds: [],
          message: `Look up this ${restaurant.type} source before saving its name and address. Existing evidence can be reused only with its original details and checked date.` });
    }
  }
  return findings;
}
