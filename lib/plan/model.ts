import { planSchema } from "./schema";
import type {
  ActivityTiming,
  Location,
  Plan,
  PlanFinding,
  PlanItem,
  SourceRef,
  TimePoint,
} from "./types";

export type Place = {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  duration_minutes: number | null;
  hours: string | null;
  price_range: string;
  booking_required: boolean | null;
  description: string;
  seasonal_notes: string | null;
  tags: string[];
  type: string;
};
export function dayDate(plan: Plan, index: number): string | null {
  if (!plan.startDate) return null;
  const date = new Date(`${plan.startDate.value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}
export function resolveLocation(
  plan: Plan,
  location: Location | null,
  seen: string[] = [],
): Exclude<Location, { type: "item" | "travel_endpoint" }> | null {
  if (
    !location ||
    (location.type !== "item" && location.type !== "travel_endpoint")
  )
    return location;
  if (seen.includes(location.itemId))
    throw new Error("These locations depend on each other. Set a place for one of them.");
  const item = plan.items[location.itemId];
  if (!item) throw new Error("A referenced arrangement does not exist.");
  const target =
    location.type === "item"
      ? item.kind !== "travel"
        ? item.location
        : null
      : item.kind === "travel"
        ? item[location.endpoint]
        : null;
  if (!target)
    throw new Error("The referenced arrangement has no matching location.");
  return resolveLocation(plan, target, [...seen, item.id]);
}
export function itemTiming(item: PlanItem): ActivityTiming | null {
  return item.kind === "stay"
    ? null
    : item.kind === "travel"
      ? item.timing.type === "interval"
        ? item.timing.schedule
        : null
      : item.timing;
}
export function fixedPoints(item: PlanItem): TimePoint[] {
  if (item.kind === "stay") return [];
  if (item.kind === "travel" && item.timing.type !== "interval")
    return item.timing.at.binding === "fixed" ? [item.timing.at] : [];
  const timing = itemTiming(item);
  return [timing?.start, timing?.end].filter(
    (p): p is TimePoint => !!p && p.binding === "fixed",
  );
}
export function sourcesIn(value: unknown): SourceRef[] {
  const found: SourceRef[] = [];
  function walk(v: unknown) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    const object = v as Record<string, unknown>;
    if (Array.isArray(object.sources))
      found.push(...(object.sources as SourceRef[]));
    Object.entries(object)
      .filter(([key]) => key !== "sources")
      .forEach(([, child]) => walk(child));
  }
  walk(value);
  return found;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function inspectPlan(
  value: unknown,
  places: readonly Place[],
  previous: Plan | null = null,
  authorizedChanges: string[] = [],
): { plan: Plan | null; findings: PlanFinding[] } {
  const parsed = planSchema.safeParse(value);
  if (!parsed.success)
    return {
      plan: null,
      findings: parsed.error.issues.map((i) => ({
        code: "shape",
        severity: "error",
        itemIds: [],
        message: `${i.path.join(".")}: ${i.message}`,
      })),
    };
  const plan = parsed.data;
  const findings: PlanFinding[] = [];
  const add = (
    code: string,
    message: string,
    itemIds: string[] = [],
    severity: "error" | "warning" = "error",
  ) => findings.push({ code, severity, itemIds, message });
  const catalog = new Map(places.map((p) => [p.id, p]));
  const dayIds = plan.days.map((d) => d.id);
  if (new Set(dayIds).size !== 3) add("days", "The plan contains a duplicate day. Reload the plan before editing.");
  const membership = new Map<string, number>();
  function location(loc: Location | null, itemIds: string[]) {
    try {
      const resolved = resolveLocation(plan, loc);
      if (resolved?.type === "catalog" && !catalog.has(resolved.placeId))
        add("catalog", "This place could not be found. Choose another place.", itemIds);
    } catch (e) {
      add("location", (e as Error).message, itemIds);
    }
  }
  for (const [index, day] of plan.days.entries()) {
    location(day.startLocation, []);
    location(day.endLocation, []);
    for (const id of day.itemIds) {
      if (!plan.items[id]) {
        add("reference", "A day references a missing item.", [id]);
        continue;
      }
      if (membership.has(id))
        add("duplicate", "An arrangement can appear in only one day.", [id]);
      membership.set(id, index);
      if (plan.items[id].kind === "stay")
        add("stay", "Accommodation is not an all-day activity.", [id]);
    }
  }
  for (const [id, item] of Object.entries(plan.items)) {
    if (id !== item.id) add("identity", "An activity could not be matched to the plan. Reload before editing.", [id]);
    if (item.keep && item.keep.basis.kind !== "user")
      add("source", "Keeping an arrangement requires a user source.", [id]);
    if (item.reservation && item.reservation.basis.kind !== "user")
      add("source", "Reservations require user evidence.", [id]);
    if (item.optional && (item.keep || item.reservation?.state === "booked"))
      add("optional", "Booked or kept arrangements cannot be optional.", [id]);
    if (
      ["rest", "free_time", "logistics"].includes(item.kind) &&
      item.reservation
    )
      add(
        "reservation",
        "Record the reservation on the booked visit, meal, travel or stay.",
        [id],
      );
    if (item.kind === "travel") {
      location(item.from, [id]);
      location(item.to, [id]);
    } else {
      location(item.location, [id]);
      if (item.kind === "visit" && !item.location)
        add("visit", "A visit needs a concrete location.", [id]);
      try {
        const loc = resolveLocation(plan, item.location);
        if (
          (item.kind === "visit" || item.kind === "meal") &&
          loc &&
          loc.type !== "catalog" &&
          !(item.kind === "meal" && loc.type === "area") &&
          (loc.type !== "specified" || loc.basis.kind !== "user")
        )
          add(
            "catalog",
            "Choose a place from Explore or one you have provided.",
            [id],
          );
        if (
          item.kind === "stay" &&
          loc?.type === "specified" &&
          loc.basis.kind !== "user"
        )
          add("stay_source", "Use a user-provided hotel or a proposed area.", [
            id,
          ]);
        if (loc?.type === "catalog") {
          const place = catalog.get(loc.placeId);
          if (place?.hours === null)
            add(
              "hours",
              "Opening hours are unknown. Confirm before visiting.",
              [id],
              "warning",
            );
          if (place?.booking_required && item.reservation?.state !== "booked")
            add(
              "booking",
              "Booking is required. Availability has not been checked.",
              [id],
              "warning",
            );
        }
      } catch {
        /* The location check reports invalid references. */
      }
    }
    if (item.kind === "stay") {
      if (
        item.coverage?.type === "nights" &&
        (new Set(item.coverage.afterDayIds).size !==
          item.coverage.afterDayIds.length ||
          item.coverage.afterDayIds.some((d) => !dayIds.includes(d)))
      )
        add("nights", "Stay nights must reference unique existing days.", [id]);
      if (
        item.coverage?.type === "dates" &&
        item.coverage.checkIn &&
        item.coverage.checkOut &&
        item.coverage.checkOut.value <= item.coverage.checkIn.value
      )
        add("stay_dates", "Check-out must follow check-in.", [id]);
      continue;
    }
    const index = membership.get(id);
    const timing = itemTiming(item);
    const start =
      timing?.start ??
      (item.kind === "travel" && item.timing.type !== "interval"
        ? item.timing.at
        : null);
    if (
      index !== undefined &&
      start?.date &&
      start.date !== dayDate(plan, index)
    )
      add(
        "date_membership",
        "This dated arrangement belongs on its actual date, or in unscheduled arrangements.",
        [id],
      );
    if (index === undefined)
      add(
        "unscheduled",
        "This arrangement has not been assigned to a day.",
        [id],
        "warning",
      );
    if (timing?.start?.time && timing.end?.time) {
      const startDate =
        timing.start.date ??
        (index === undefined ? null : dayDate(plan, index));
      const endDate = timing.end.date ?? startDate;
      if (
        (startDate &&
          endDate &&
          `${endDate}T${timing.end.time}` <=
            `${startDate}T${timing.start.time}`) ||
        ((!startDate || !endDate) && timing.end.time <= timing.start.time)
      )
        add(
          "interval",
          "The end must be after the start. For overnight travel, include both dates.",
          [id],
        );
    }
    if (timing && !timing.duration && !(timing.start?.time && timing.end?.time))
      add(
        "duration",
        "Duration is unknown. Check that this day leaves enough time.",
        [id],
        "warning",
      );
  }
  // Check schedule feasibility.
  for (const day of plan.days) {
    let minimum = 0;
    const intervals: { id: string; start: number; end: number }[] = [];
    const minutes = (clock: string) =>
      Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
    for (const id of day.itemIds) {
      const item = plan.items[id];
      if (!item) continue;
      const timing = itemTiming(item);
      if (timing?.duration && !item.optional)
        minimum += timing.duration.minMinutes;
      if (
        timing?.start?.time &&
        timing.end?.time &&
        timing.start.date === timing.end.date
      ) {
        const start = minutes(timing.start.time),
          end = minutes(timing.end.time);
        if (end > start) {
          intervals.push({ id, start, end });
          if (!item.optional) minimum += end - start;
        }
      }
    }
    if (minimum > 660)
      add(
        "capacity",
        "This day contains over eleven hours of required activities before any unrecorded transfers or breaks.",
        day.itemIds,
        "warning",
      );
    for (let a = 0; a < intervals.length; a++)
      for (let b = a + 1; b < intervals.length; b++) {
        const first = intervals[a],
          second = intervals[b];
        if (first.start < second.end && second.start < first.end) {
          const ids = [first.id, second.id];
          const acknowledged = plan.notes.some(
            (n) =>
              n.kind === "conflict" &&
              ids.every((id) => n.relatedItemIds.includes(id)),
          );
          add(
            "overlap",
            "These scheduled arrangements overlap. Reschedule suggestions or explicitly record the unresolved conflict.",
            ids,
            acknowledged ? "warning" : "error",
          );
        }
      }
  }
  for (const note of plan.notes)
    if (note.relatedItemIds.some((id) => !plan.items[id]))
      add(
        "note_reference",
        "A note references a missing arrangement.",
        note.relatedItemIds,
      );
  if (new Set(plan.notes.map((n) => n.id)).size !== plan.notes.length)
    add("notes", "The plan contains a duplicate note. Reload before editing.");
  for (const source of sourcesIn(plan))
    if (source.type === "catalog" && !catalog.has(source.placeId))
      add("source_catalog", "Details for a referenced place could not be found.");
  // Preserve reported arrangements.
  for (const old of Object.values(previous?.items ?? {})) {
    const next = plan.items[old.id];
    const authorized = authorizedChanges.includes(old.id);
    if (!next) {
      if (old.reservation?.state === "booked" || (old.keep && !authorized))
        add(
          "protected",
          "Keep this arrangement; unassign an active booking instead of deleting it.",
          [old.id],
        );
      continue;
    }
    const oldLocation =
      old.kind === "travel" ? [old.from, old.to] : old.location;
    const newLocation =
      next.kind === "travel" ? [next.from, next.to] : next.location;
    const oldDay = previous?.days.findIndex((d) => d.itemIds.includes(old.id));
    const newDay = plan.days.findIndex((d) => d.itemIds.includes(old.id));
    const relativeMoved =
      fixedPoints(old).some((p) => !p.date) &&
      (oldDay !== newDay ||
        (previous &&
          oldDay !== undefined &&
          oldDay >= 0 &&
          newDay >= 0 &&
          dayDate(previous, oldDay) !== dayDate(plan, newDay)));
    const bookingChanged =
      old.reservation?.state === "booked" &&
      (!equal(old.reservation, next.reservation) ||
        !equal(oldLocation, newLocation) ||
        (old.kind === "stay" &&
          next.kind === "stay" &&
          !equal(old.coverage, next.coverage)));
    if (
      !authorized &&
      (old.kind !== next.kind ||
        !equal(fixedPoints(old), fixedPoints(next)) ||
        relativeMoved ||
        bookingChanged ||
        (old.keep && (!next.keep || !equal(oldLocation, newLocation))))
    )
      add(
        "protected",
        "Changing this protected fact requires an explicit current user source.",
        [old.id],
      );
  }
  for (const note of previous?.notes ?? [])
    if (
      note.sources.some((s) =>
        ["message", "attachment", "document", "legacy_notes", "direct_edit"].includes(s.type),
      ) &&
      !plan.notes.some((n) => n.id === note.id && equal(n, note)) &&
      !authorizedChanges.includes(note.id)
    )
      add(
        "protected_note",
        "Resolve this user-sourced note explicitly before changing or removing it.",
        note.relatedItemIds,
      );
  return { plan, findings };
}
