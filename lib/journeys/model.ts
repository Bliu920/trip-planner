import {
  activityWindow,
  dayDate,
  resolveLocation,
  type Location,
  type Plan,
  type PlanItem,
} from "@/lib/plan";
import type { JourneyLeg, JourneyStop } from "./types";

export function locationKey(plan: Plan, location: Location | null): string {
  try {
    const loc = resolveLocation(plan, location);
    if (!loc) return "unresolved";
    if (loc.type === "catalog") return `catalog:${loc.placeId}`;
    if (loc.type === "restaurant" || loc.type === "hotel")
      return JSON.stringify([
        loc.type,
        loc.label,
        loc.address,
        loc.city,
        loc.geoEvidenceId ?? null,
      ]);
    if (loc.type === "specified")
      return JSON.stringify([loc.type, loc.label, loc.latitude, loc.longitude]);
    return JSON.stringify([loc.type, loc.label]);
  } catch {
    return "unresolved";
  }
}
export function bufferedMinutes(seconds: number) {
  return Math.ceil(((seconds / 60) * 1.2 + 5) / 5) * 5;
}
export function staysAfter(plan: Plan, index: number) {
  const day = plan.days[index],
    date = dayDate(plan, index);
  return Object.values(plan.items).filter(
    (item) =>
      item.kind === "stay" &&
      (item.coverage?.type === "nights"
        ? item.coverage.afterDayIds.includes(day.id)
        : !!date &&
          !!item.coverage?.checkIn &&
          !!item.coverage.checkOut &&
          date >= item.coverage.checkIn.value &&
          date < item.coverage.checkOut.value),
  );
}
/** Derive movement even without travel items. Explicit travel replaces, rather than duplicates, its connection. */
export function deriveJourneys(plan: Plan): JourneyLeg[] {
  const legs: JourneyLeg[] = [];
  type Node = JourneyStop & {
    outgoing?: { mode: JourneyLeg["mode"]; ids: string[]; allocated: number | null };
  };
  plan.days.forEach((day, dayIndex) => {
    const nodes: Node[] = [];
    const push = (node: Node) => {
      const last = nodes.at(-1);
      if (
        last?.location &&
        node.location &&
        locationKey(plan, last.location) === locationKey(plan, node.location)
      ) {
        if (node.end !== null) {
          last.end = Math.max(last.end ?? node.end, node.end);
          last.dated = node.dated;
        }
        if (last.start === null && node.start !== null) last.start = node.start;
        if (node.outgoing) last.outgoing = node.outgoing;
      } else nodes.push(node);
    };
    const previousStays = dayIndex > 0 ? staysAfter(plan, dayIndex - 1) : [];
    const followingStays = staysAfter(plan, dayIndex);
    const start =
      day.startLocation ??
      (previousStays.length === 1 ? { type: "item" as const, itemId: previousStays[0].id } : null);
    const end =
      day.endLocation ??
      (followingStays.length === 1
        ? { type: "item" as const, itemId: followingStays[0].id }
        : null);
    if (start)
      push({
        id: previousStays[0]?.id ?? `${day.id}:start`,
        location: start,
        start: null,
        end: null,
      });
    const items = day.itemIds
      .map((id) => plan.items[id])
      .filter((item): item is PlanItem => !!item);
    items.forEach((item, index) => {
      const time = activityWindow(item, dayDate(plan, dayIndex), dayIndex);
      if (item.kind === "stay") return;
      if (item.kind === "travel") {
        const next = items
          .slice(index + 1)
          .find((next) => next.kind !== "travel" && next.kind !== "stay" && next.location);
        const to = item.to ?? (next && next.kind !== "travel" ? next.location : end);
        const from = item.from ?? nodes.at(-1)?.location ?? start;
        const departure = item.timing.type === "arrival" ? null : time.start;
        const arrival = item.timing.type === "departure" ? null : time.end;
        const allocated =
          departure !== null && arrival !== null && arrival > departure
            ? arrival - departure
            : item.timing.type === "interval"
              ? (item.timing.schedule.duration?.maxMinutes ?? null)
              : null;
        push({
          id: item.id,
          location: from,
          dated: time.dated,
          start: departure,
          end: departure,
          outgoing: {
            mode: item.mode === "walk" || item.mode === "car" ? item.mode : "unsupported",
            ids: [item.id],
            allocated,
          },
        });
        push({ id: item.id, location: to, dated: time.dated, start: arrival, end: arrival });
      } else if (!item.location && (item.kind === "rest" || item.kind === "free_time")) {
        const last = nodes.at(-1);
        if (last && time.end !== null) {
          last.end = Math.max(last.end ?? time.end, time.end);
          last.dated = time.dated;
        }
      } else push({ id: item.id, location: item.location, ...time });
    });
    if (end)
      push({ id: followingStays[0]?.id ?? `${day.id}:end`, location: end, start: null, end: null });
    for (let i = 1; i < nodes.length; i++) {
      const from = nodes[i - 1],
        to = nodes[i],
        explicit = from.outgoing;
      legs.push({
        id: `${day.id}:${i}`,
        dayId: day.id,
        from,
        to,
        mode: explicit?.mode ?? "walk",
        travelItemIds: explicit?.ids ?? [],
        allocatedMinutes: explicit?.allocated ?? null,
        availableMinutes:
          from.end !== null && to.start !== null && !!from.dated === !!to.dated
            ? to.start - from.end
            : null,
      });
    }
  });
  return legs;
}
