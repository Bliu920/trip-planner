import { activityWindow, applyPlanOperations, dayDate, resolveLocation, type ActivityItem, type ActivityTiming, type Location, type Plan, type PlanItem, type PlanOperation, type StayItem, type TimePoint, type TravelItem } from "@/lib/plan";
import type { Place } from "@/lib/catalog";
import type { AgentEnvironment } from "../contracts";
import { authoringError, evidence, proposed, userBasis, userLocationBasis } from "./index";
import { planAuthoringInput, type PlanCommand, type ActivityInput, type LocationInput } from "./inputs";

const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
function point(time: string, date: string | null = null): TimePoint { return { time, date, binding: "suggested", basis: proposed("Suggested local time, not a fixed booking.") }; }
function timing(input: Partial<ActivityInput>, old?: ActivityTiming, place?: Place): ActivityTiming {
  const result: ActivityTiming = old ? structuredClone(old) : { period: null, start: null, end: null, duration: null };
  if (input.endTime && (input.durationMinutes || input.durationRange) || input.durationMinutes && input.durationRange) throw new Error("Use endTime or one duration, not both.");
  if (owns(input, "startTime")) result.start = input.startTime ? input.startTime === result.start?.time && (input.startDate === undefined || input.startDate === result.start.date) ? result.start : point(input.startTime, input.startDate ?? result.start?.date) : null;
  else if (owns(input, "startDate") && result.start) result.start = { ...result.start, date: input.startDate! };
  if (owns(input, "endTime")) { result.end = input.endTime ? input.endTime === result.end?.time && (input.endDate === undefined || input.endDate === result.end.date) ? result.end : point(input.endTime, input.endDate ?? result.end?.date) : null; if (result.end) result.duration = null; }
  else if (owns(input, "endDate") && result.end) result.end = { ...result.end, date: input.endDate! };
  if (owns(input, "durationMinutes") || owns(input, "durationRange")) {
    const range = input.durationRange ?? (input.durationMinutes ? { min: input.durationMinutes, max: input.durationMinutes } : null);
    if (range && range.max < range.min) throw new Error("Duration maximum must be at least its minimum.");
    result.duration = range ? { minMinutes: range.min, maxMinutes: range.max, basis: proposed("Proposed time allowance.") } : null;
    if (range) result.end = null;
  }
  if (!old && !result.duration && !result.end && place?.duration_minutes) result.duration = { minMinutes: place.duration_minutes, maxMinutes: place.duration_minutes, basis: { kind: "catalog", sources: [{ type: "catalog", placeId: place.id, field: "duration_minutes" }], explanation: null } };
  if (!old && (!result.start || !result.duration && !result.end)) throw new Error("Give the arrangement a startTime and a duration or endTime. Catalog duration can be reused when available.");
  result.period = null;
  return result;
}
async function location(input: LocationInput, plan: Plan, env: AgentEnvironment, type: "restaurant" | "hotel" = "restaurant"): Promise<Location | null | undefined> {
  const fields = ["placeId", "venue", "locationItemId", "userLocation", "area", "includedInStayId"] as const;
  const provided = fields.filter(key => owns(input, key));
  if (!provided.length) return undefined;
  if (provided.filter(key => input[key] !== null && input[key] !== undefined).length > 1) throw new Error("Choose one location reference.");
  if (input.placeId) return { type: "catalog", placeId: input.placeId };
  if (input.locationItemId) { if (!plan.items[input.locationItemId]) throw new Error("The referenced arrangement was not found."); return { type: "item", itemId: input.locationItemId }; }
  if (input.includedInStayId) {
    const stay = plan.items[input.includedInStayId];
    if (stay?.kind !== "stay") throw new Error("Included breakfast needs an existing stay.");
    const loc = resolveLocation(plan, stay.location);
    const label = loc && "label" in loc ? loc.label : stay.title;
    return { type: "specified", label, latitude: null, longitude: null, basis: await userLocationBasis(env, label, input.userLocationMessageId) };
  }
  if (input.userLocation) return { type: "specified", label: input.userLocation, latitude: null, longitude: null, basis: await userLocationBasis(env, input.userLocation, input.userLocationMessageId) };
  if (input.area) return { type: "area", label: input.area, basis: proposed("Suggested area, not a user-provided location or confirmed venue.") };
  if (input.venue) {
    const source = evidence(env, input.venue.sourceId);
    if (!source.url) throw new Error("A newly researched venue needs a retrieved web source.");
    const { name, address, city, geoEvidenceId } = input.venue;
    if (geoEvidenceId && !env.venuePosition) throw new Error("Map evidence cannot be checked in this environment.");
    const position = await env.venuePosition?.({ name, address, city }, geoEvidenceId);
    return { type, label: name, address, city, latitude: position?.payload.coordinates?.[1] ?? null, longitude: position?.payload.coordinates?.[0] ?? null,
      ...(position ? { geoEvidenceId: position.id } : {}),
      basis: { kind: "research", sources: [{ type: "web", url: source.url, accessedAt: source.checkedAt }, ...(position ? [{ type: "geo" as const, evidenceId: position.id }] : [])], explanation: "Venue identity from retrieved evidence; availability is unconfirmed." } };
  }
  return null;
}
function at(plan: Plan, dayId: string, after: string | null | undefined, moving?: string, candidate?: PlanItem) {
  const day = plan.days.find(day => day.id === dayId);
  if (!day) throw new Error("Choose an existing day.");
  const ids = day.itemIds.filter(id => id !== moving);
  if (after === undefined) {
    const dayIndex = plan.days.indexOf(day), date = dayDate(plan, dayIndex);
    const start = candidate ? activityWindow(candidate, date, dayIndex).start : null;
    const index = start === null ? -1 : ids.findIndex(id => { const next = activityWindow(plan.items[id], date, dayIndex).start; return next !== null && next > start; });
    return index < 0 ? ids.length : index;
  }
  if (after === null) return 0;
  const index = ids.indexOf(after);
  if (index < 0) throw new Error("afterItemId must belong to the destination day and differ from the moved item.");
  return index + 1;
}
export async function authorPlan(plan: Plan, commands: PlanCommand[], env: AgentEnvironment): Promise<{ operations: PlanOperation[]; authorizedItemIds: string[] }> {
  planAuthoringInput.parse({ operations: commands });
  let current = structuredClone(plan);
  const known = new Set(Object.keys(plan.items));
  const operations: PlanOperation[] = [], authorizedItemIds: string[] = [];
  const ids = commands.flatMap(command => command.type === "addActivity" || command.type === "replaceActivity" ? command.placeId ? [command.placeId] : [] : command.type === "updateActivity" && command.changes.placeId ? [command.changes.placeId] : []);
  const places = ids.length ? await env.places([...new Set(ids)]) as Place[] : [];
  const get = (id: string) => { const item = current.items[id]; if (!item) throw new Error("The arrangement was not found. Read the current day."); return item; };
  // Normalize one atomic batch.
  for (const command of commands) {
    const next: PlanOperation[] = [];
    try {
      if (command.type === "removeItem" && !current.items[command.id] && (known.has(command.id) || env.artifacts?.wasKnown?.("plan", command.id))) continue;
      switch (command.type) {
        case "addActivity": case "replaceActivity": case "updateActivity": {
          const old = command.type === "addActivity" ? undefined : get(command.id);
          if (old && ["stay", "travel"].includes(old.kind)) throw new Error("Use the matching stay or travel command.");
          const input = command.type === "updateActivity" ? command.changes : command;
          const place = input.placeId ? places.find(place => place.id === input.placeId) : undefined;
          if (input.placeId && !place) throw new Error("Use an existing supplied place ID.");
          const value: ActivityItem = { id: command.id, kind: command.type === "updateActivity" ? command.changes.kind ?? old!.kind as ActivityItem["kind"] : command.kind,
            title: input.title ?? old!.title, reason: owns(input, "reason") ? input.reason ?? null : old?.reason ?? null, optional: input.optional ?? old?.optional ?? false,
            keep: old?.keep ?? null, reservation: old?.reservation ?? null, location: await location(input, current, env) ?? (["placeId", "venue", "locationItemId", "userLocation", "area", "includedInStayId"].some(key => owns(input, key)) ? null : old && "location" in old ? old.location : null),
            timing: timing(input, old?.kind !== "travel" && old?.kind !== "stay" ? old?.timing : undefined, place) };
          if (old && old.kind !== "travel" && old.kind !== "stay" && JSON.stringify(value.location) !== JSON.stringify(old.location) && old.timing.duration?.basis.kind === "catalog" && !owns(input, "durationMinutes") && !owns(input, "durationRange")) {
            if (!place?.duration_minutes) throw new Error("The old duration belongs to the previous place. Supply a duration for the replacement.");
            value.timing.duration = { minMinutes: place.duration_minutes, maxMinutes: place.duration_minutes, basis: { kind: "catalog", sources: [{ type: "catalog", placeId: place.id, field: "duration_minutes" }], explanation: null } };
          }
          next.push(command.type === "addActivity" ? { type: "addItem", item: value, dayId: command.dayId, index: at(current, command.dayId, command.afterItemId, undefined, value) } : { type: "replaceItem", item: value });
          if (command.type === "updateActivity" && owns(input, "startTime")) {
            const day = current.days.find(day => day.itemIds.includes(value.id));
            if (day) next.push({ type: "moveItem", id: value.id, dayId: day.id, index: at(current, day.id, undefined, value.id, value) });
          }
          break;
        }
        case "addTravel": case "updateTravel": {
          const old = command.type === "updateTravel" ? get(command.id) : undefined;
          if (old && old.kind !== "travel") throw new Error("This arrangement is not travel.");
          const input = command.type === "updateTravel" ? command.changes : command;
          const prior = old as TravelItem | undefined, mode = input.timingMode ?? prior?.timing.type ?? "interval";
          const priorPoint = prior && prior.timing.type !== "interval" ? prior.timing.at : null;
          const schedule = timing(input, prior?.timing.type === "interval" ? prior.timing.schedule : mode !== "interval" ? { period: null, start: priorPoint, end: null, duration: null } : undefined);
          if (mode !== "interval" && !schedule.start) throw new Error("An arrival or departure requires startTime.");
          const value: TravelItem = { id: command.id, kind: "travel", title: input.title ?? prior!.title, reason: input.reason ?? prior?.reason ?? null, optional: input.optional ?? prior?.optional ?? false, keep: prior?.keep ?? null, reservation: prior?.reservation ?? null,
            from: owns(input, "from") ? input.from ? await location(input.from, current, env) ?? null : null : prior?.from ?? null,
            to: owns(input, "to") ? input.to ? await location(input.to, current, env) ?? null : null : prior?.to ?? null,
            mode: owns(input, "mode") ? input.mode ?? null : prior?.mode ?? null,
            timing: mode === "interval" ? { type: "interval", schedule } : { type: mode, at: schedule.start ?? (prior?.timing.type !== "interval" ? prior?.timing.at : null)! } };
          next.push(command.type === "addTravel" ? { type: "addItem", item: value, dayId: command.dayId, index: at(current, command.dayId, command.afterItemId, undefined, value) } : { type: "replaceItem", item: value });
          break;
        }
        case "addStay": case "updateStay": {
          const old = command.type === "updateStay" ? get(command.id) : undefined;
          if (old && old.kind !== "stay") throw new Error("This arrangement is not lodging.");
          const input = command.type === "updateStay" ? command.changes : command;
          const prior = old as StayItem | undefined;
          if ([input.hotel, input.area, input.userLocation].filter(Boolean).length > 1) throw new Error("Choose a researched hotel, a user property or an area.");
          const loc = await location({ ...(input.hotel ? { venue: input.hotel } : {}), ...(input.area ? { area: input.area } : {}), ...(input.userLocation ? { userLocation: input.userLocation, userLocationMessageId: input.userLocationMessageId } : {}) }, current, env, "hotel") ?? prior?.location;
          if (!loc) throw new Error("Give this stay a hotel or provisional area.");
          const nights = input.afterDayIds ?? (prior?.coverage?.type === "nights" ? prior.coverage.afterDayIds : []);
          const value: StayItem = { id: command.id, kind: "stay", title: input.title ?? (input.hotel?.name ?? input.userLocation ?? input.area ?? prior!.title).slice(0, 160), reason: input.reason ?? prior?.reason ?? "Proposed overnight base; not booked.", optional: false, keep: prior?.keep ?? null, reservation: prior?.reservation ?? null, location: loc,
            coverage: prior?.coverage?.type === "nights" && JSON.stringify(prior.coverage.afterDayIds) === JSON.stringify(nights) ? prior.coverage : input.afterDayIds || !prior ? { type: "nights", afterDayIds: nights, basis: proposed("Suggested nights for this base.") } : prior.coverage };
          next.push(command.type === "addStay" ? { type: "addItem", item: value, dayId: null, index: null } : { type: "replaceItem", item: value });
          for (let index = 0; index < current.days.length; index++) {
            const day = current.days[index], end = nights.includes(day.id), start = index > 0 && nights.includes(current.days[index - 1].id);
            const owned = (loc: Location | null) => loc?.type === "item" && loc.itemId === command.id;
            const fields: Partial<Plan["days"][number]> = {};
            if (end && !day.endLocation || end && owned(day.endLocation)) fields.endLocation = { type: "item", itemId: command.id };
            else if (!end && owned(day.endLocation)) fields.endLocation = null;
            if (start && !day.startLocation || start && owned(day.startLocation)) fields.startLocation = { type: "item", itemId: command.id };
            else if (!start && owned(day.startLocation)) fields.startLocation = null;
            if (Object.keys(fields).length) next.push({ type: "updateDay", id: day.id, fields });
          }
          break;
        }
        case "moveItem": next.push({ type: "moveItem", id: command.id, dayId: command.dayId, index: at(current, command.dayId, command.afterItemId, command.id) }); break;
        case "reorderItems": case "removeItem": next.push(command); break;
        case "setDate": next.push({ type: "setStartDate", value: command.value ? { value: command.value, basis: command.userProvided ? userBasis(env) : proposed("Suggested departure date.") } : null }); break;
        case "updateDay": {
          const fields: Partial<Plan["days"][number]> = { ...(command.changes.title ? { title: command.changes.title } : {}) };
          for (const key of ["startLocation", "endLocation"] as const) if (owns(command.changes, key)) fields[key] = command.changes[key] ? await location(command.changes[key]!, current, env) ?? null : null;
          next.push({ type: "updateDay", id: command.id, fields }); break;
        }
        case "setCommitment": {
          if (command.messageId) await env.readMessage(command.messageId);
          const value = structuredClone(get(command.id)), basis = userBasis(env, command.messageId);
          if (command.reservation) value.reservation = { state: command.reservation, basis };
          if (command.keep !== undefined) value.keep = command.keep ? { basis } : null;
          const schedule = value.kind === "stay" ? null : value.kind === "travel" ? value.timing.type === "interval" ? value.timing.schedule : null : value.timing;
          for (const [flag, key] of [[command.fixedStart, "start"], [command.fixedEnd, "end"]] as const) if (flag !== undefined) {
            if (value.kind === "travel" && value.timing.type !== "interval" && key === "start") { value.timing.at = { ...value.timing.at, binding: flag ? "fixed" : "suggested", basis: flag ? basis : proposed() }; continue; }
            const p = schedule?.[key];
            if (!p) throw new Error("Set the actual time before recording its fixed status.");
            schedule![key] = { ...p, binding: flag ? "fixed" : "suggested", basis: flag ? basis : proposed() };
          }
          if (value.reservation?.state === "booked" || value.keep) value.optional = false;
          authorizedItemIds.push(command.id); next.push({ type: "replaceItem", item: value }); break;
        }
        case "upsertReminder": {
          const note = { id: command.id, kind: command.kind, text: command.text, relatedItemIds: command.itemIds, sources: [] };
          next.push(current.notes.some(note => note.id === command.id) ? { type: "updateNote", id: command.id, fields: note } : { type: "addNote", note }); break;
        }
        case "removeReminder": next.push({ type: "removeNote", id: command.id }); break;
      }
      current = applyPlanOperations(current, next);
      Object.keys(current.items).forEach(id => known.add(id));
      operations.push(...next);
    } catch (error) {
      throw authoringError(error, commands.indexOf(command), command);
    }
  }
  return { operations, authorizedItemIds };
}
