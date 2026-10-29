import { durationLabel as formatDuration } from "@/lib/catalog";
import { dayDate, fixedPoints, itemTiming, resolveLocation, type Place } from "../model";
import type { Plan, PlanItem, PlanNote } from "../types";

export type ActivityKind = "food" | "sight" | "walk" | "stay" | "garden" | "departure" | "viewpoint";
export type Photo = { src: string; alt: string; credit: string; creditUrl: string };
export type Reminder = { id: string; text: string; sources?: { label: string; url: string }[] };
export type Stop = {
  id: string;
  kind: ActivityKind;
  title: string;
  time: string;
  duration: string;
  category: string;
  note: string;
  bookingLabel?: string;
  optional?: boolean;
  canToggle?: boolean;
  omitted?: boolean;
  endTime?: string | null;
  coordinates?: [number, number] | null;
  locationLabel?: string | null;
  photo?: Photo | null;
  description?: string;
  details?: { label: string; value: string }[];
  sources?: { label: string; url: string }[];
  priceLabel?: string;
  next?: string;
  reminders?: Reminder[];
};
export type Day = {
  id: string;
  title: string;
  date: string | null;
  photo: Photo | null;
  fallbackPhoto?: Photo | null;
  walkingLabel: string | null;
  stayLabel: string | null;
  stops: Stop[];
  endNote?: string;
  stays?: Stop[];
  reminders?: Reminder[];
};
export type Budget = {
  currency: string;
  scope: string;
  costs: { label: string; detail: string; min: number; max: number }[];
  excluded: string;
  note: string;
};
// A derived render model, never a second saved plan.
export type PlanPresentationData = {
  title: string;
  meta: string[];
  dateLabel: string | null;
  budget: Budget | null;
  days: Day[];
  otherItems: Stop[];
  notes: { id: string; text: string }[];
  footnote?: string;
  reminders?: Reminder[];
  pendingItems?: Stop[];
};
export function budgetTotal(budget: Budget) {
  return budget.costs.reduce((sum, cost) => ({ min: sum.min + cost.min, max: sum.max + cost.max }), { min: 0, max: 0 });
}
export function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}
export function moneyRange(budget: Budget) {
  const total = budgetTotal(budget);
  return `${money(total.min, budget.currency)} to ${money(total.max, budget.currency)}`;
}
export function findStop(data: PlanPresentationData, id: string) {
  return data.days.flatMap(day => day.stops).concat(data.otherItems).find(stop => stop.id === id);
}
// Group local display times.
export function overviewPeriod(time: string) {
  const value = time.trim().toLowerCase();
  if (value === "morning") return "Morning";
  if (value === "afternoon") return "Afternoon";
  if (value === "evening") return "Evening";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "Flexible";
  const hour = Number(value.slice(0, 2));
  return hour < 6 ? "Night" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
}
function itemKind(item: PlanItem): ActivityKind {
  if (item.kind === "meal") return "food";
  if (item.kind === "stay" || item.kind === "rest" || item.kind === "free_time") return "stay";
  if (item.kind === "travel") return item.mode === "walk" ? "walk" : "departure";
  return "sight";
}
function durationLabel(item: PlanItem) {
  const timing = itemTiming(item);
  if (timing?.start?.time && timing.end?.time) return `Until ${timing.end.time}`;
  if (!timing?.duration) return "Duration unknown";
  const { minMinutes, maxMinutes } = timing.duration;
  return formatDuration(minMinutes, maxMinutes);
}
function projectItem(item: PlanItem): Stop {
  const timing = itemTiming(item);
  const endpoint = item.kind === "travel" && item.timing.type !== "interval" ? item.timing.at : null;
  const fixed = fixedPoints(item).length > 0;
  const reservation = item.reservation?.state;
  const stay = item.kind === "stay" ? item.coverage : null;
  const stayDetail = stay?.type === "dates"
    ? `Check-in: ${stay.checkIn?.value ?? "unknown"}. Check-out: ${stay.checkOut?.value ?? "unknown"}.`
    : "";
  return {
    id: item.id, kind: itemKind(item), title: item.title,
    time: item.kind === "stay" ? "Overnight" : endpoint?.time ?? timing?.start?.time ?? timing?.period ?? "Flexible",
    duration: item.kind === "stay" ? "Accommodation" : durationLabel(item),
    category: `${item.kind.replaceAll("_", " ")}${fixed ? " · Fixed time" : ""}`,
    note: [item.reason, stayDetail].filter(Boolean).join(" ") || "No additional details recorded.",
    bookingLabel: reservation ? `Reservation: ${reservation.replaceAll("_", " ")}` : undefined,
    optional: item.optional,
    canToggle: item.optional && !item.keep && reservation !== "booked" && !fixed,
  };
}

function reminder(note: PlanNote): Reminder {
  const sources = note.sources.flatMap(source => source.type === "web" ? [{ label: "Source", url: source.url }] : []);
  return { id: note.id, text: note.text, ...(sources.length ? { sources } : {}) };
}

/** Pure projection of a validated saved Plan. Missing enrichment stays missing. */
export function presentPlan(plan: Plan, places: readonly Place[], photos: Readonly<Record<string, Photo>> = {}, fallbackPhotos: readonly Photo[] = []): PlanPresentationData {
  const placeById = new Map(places.map(place => [place.id, place]));
  const locationFor = (item: PlanItem) => resolveLocation(plan, item.kind === "travel" ? item.to : item.location);
  const photoFor = (item: PlanItem) => {
    const location = locationFor(item);
    return location?.type === "catalog" ? photos[location.placeId] ?? null : null;
  };
  function detailedItem(item: PlanItem): Stop {
    const result = projectItem(item);
    const resolved = locationFor(item);
    const place = resolved?.type === "catalog" ? placeById.get(resolved.placeId) : null;
    const point = place ?? (resolved?.type === "specified" || (resolved?.type === "restaurant" || resolved?.type === "hotel") ? resolved : null);
    const coordinates: [number, number] | null = point && point.latitude !== null && point.longitude !== null
      && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
      && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
      ? [point.latitude, point.longitude] : null;
    const timing = itemTiming(item);
    const notes = plan.notes.filter(note => note.relatedItemIds.includes(item.id));
    const details = notes.filter(note => note.kind === "assumption").map(note => ({ label: "Assumption", value: note.text }));
    if (place) {
      if (item.reason && place.description && item.reason !== place.description) details.push({ label: "About this place", value: place.description });
      details.push({ label: "Hours", value: place.hours || "Opening hours not recorded. Check before visiting." });
      if (place.seasonal_notes) details.push({ label: "Seasonal notes", value: place.seasonal_notes });
      if (place.booking_required !== null) details.push({ label: "Booking", value: place.booking_required ? "Booking required. Availability has not been checked." : "No booking requirement listed. Check before visiting." });
    }
    if (item.kind === "stay" && item.coverage?.type === "nights")
      details.push({ label: "Nights", value: item.coverage.afterDayIds.map(id => `After Day ${plan.days.findIndex(day => day.id === id) + 1}`).join(", ") });
    if (item.kind === "stay" && item.coverage?.type === "dates") {
      details.push({ label: "Check-in", value: item.coverage.checkIn?.value ?? "Not confirmed" });
      details.push({ label: "Check-out", value: item.coverage.checkOut?.value ?? "Not confirmed" });
    }
    if (item.kind === "stay" && !item.reservation) details.push({ label: "Booking", value: "Reservation and room availability are not confirmed." });
    if (result.bookingLabel) details.push({ label: "Reservation", value: result.bookingLabel.replace("Reservation: ", "") });
    if (item.keep) details.push({ label: "Keep in plan", value: "You asked to keep this arrangement." });
    if (fixedPoints(item).length) details.push({ label: "Timing", value: "This arrangement includes a fixed time." });
    const bases = [timing?.start?.basis, timing?.end?.basis, timing?.duration?.basis, item.reservation?.basis,
      resolved && "basis" in resolved ? resolved.basis : null,
      item.kind === "travel" && item.timing.type !== "interval" ? item.timing.at.basis : null];
    const sources = [...notes.flatMap(note => note.sources), ...bases.flatMap(basis => basis?.sources ?? [])]
      .flatMap(source => source.type === "web" && /^https?:\/\//i.test(source.url) ? [{ label: "Source", url: source.url }] : []);
    return { ...result, reminders: notes.filter(note => note.kind !== "assumption").map(reminder), endTime: timing?.end?.time ?? null, coordinates,
      locationLabel: place ? `${place.name}, ${place.city}` : (resolved?.type === "restaurant" || resolved?.type === "hotel")
        ? `${resolved.label}, ${resolved.address}, ${resolved.city}`
        : resolved && "label" in resolved ? resolved.label : null,
      photo: photoFor(item), description: item.reason || place?.description || "",
      details, sources: [...new Map(sources.map(source => [source.url, source])).values()],
    };
  }
  const cities = [...new Set(Object.values(plan.items).flatMap(item => {
    const location = locationFor(item);
    const place = location?.type === "catalog" ? placeById.get(location.placeId) : null;
    return place ? [place.city] : (location?.type === "restaurant" || location?.type === "hotel") ? [location.city] : [];
  }))];
  const scheduled = new Set(plan.days.flatMap(day => day.itemIds));
  const stays = Object.values(plan.items).filter(item => item.kind === "stay");
  const nightStays = plan.days.map((day, index) => {
    const date = dayDate(plan, index);
    return stays.filter(item => {
      const coverage = item.coverage;
      return coverage?.type === "nights" ? coverage.afterDayIds.includes(day.id)
        : !!date && !!coverage?.checkIn && !!coverage.checkOut && date >= coverage.checkIn.value && date < coverage.checkOut.value;
    });
  });
  const assigned = new Set([...scheduled, ...nightStays.flatMap(items => items.map(item => item.id))]);
  return {
    title: cities.join(" / ") || "Trip plan", meta: [`${plan.days.length} days`],
    dateLabel: plan.startDate ? `${plan.startDate.basis.kind === "assumption" ? "Provisional dates from" : "From"} ${plan.startDate.value}` : "Dates not set", budget: null,
    reminders: plan.notes.filter(note => note.kind !== "assumption" && !note.relatedItemIds.some(id => assigned.has(id))).map(reminder),
    pendingItems: Object.values(plan.items).filter(item => !assigned.has(item.id) &&
      (item.kind === "stay" || item.reservation?.state === "booked" || item.keep || fixedPoints(item).length)).map(detailedItem),
    days: plan.days.map((day, index) => {
      const date = dayDate(plan, index);
      const items = day.itemIds.map(id => plan.items[id]);
      const overnight = nightStays[index];
      const relatedIds = new Set([...day.itemIds, ...overnight.map(item => item.id)]);
      return {
        id: day.id, title: day.title, date,
        photo: items.map(photoFor).find(Boolean) ?? null,
        fallbackPhoto: fallbackPhotos[index] ?? null,
        walkingLabel: null, stayLabel: overnight.map(stay => stay.title).join(", ") || null,
        stays: overnight.map(detailedItem),
        reminders: plan.notes.filter(note => note.kind !== "assumption" && note.relatedItemIds.some(id => relatedIds.has(id))).map(reminder),
        stops: items.map(detailedItem),
      };
    }),
    otherItems: Object.values(plan.items).filter(item => item.kind === "stay" || !scheduled.has(item.id)).map(item => {
      const result = { ...detailedItem(item), canToggle: false };
      if (item.kind === "stay" && item.coverage?.type === "nights") {
        const labels = item.coverage.afterDayIds.map(id => `Day ${plan.days.findIndex(day => day.id === id) + 1}`);
        result.note += ` Nights after ${labels.join(", ")}.`;
      }
      return result;
    }),
    notes: plan.notes.map(note => ({ id: note.id, text: note.text })),
  };
}
