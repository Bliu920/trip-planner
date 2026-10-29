import type { PlanItem, TimePoint } from "./types";

/** Destination-local calendar minutes, with day-relative fallback for undated plans. */
export function activityWindow(item: PlanItem, date: string | null, dayIndex: number) {
  const point = (p: TimePoint | null, fallback = date): number | null => {
    if (!p?.time) return null;
    const calendar = p.date ?? fallback;
    return (calendar ? Date.parse(`${calendar}T00:00:00Z`) / 60000 : dayIndex * 1440) +
      Number(p.time.slice(0, 2)) * 60 + Number(p.time.slice(3));
  };
  if (item.kind === "stay") return { start: null, end: null };
  if (item.kind === "travel" && item.timing.type !== "interval") {
    const at = point(item.timing.at); return { start: at, end: at, dated: !!(date || item.timing.at.date) };
  }
  const timing = item.kind === "travel" && item.timing.type === "interval" ? item.timing.schedule : item.timing as import("./types").ActivityTiming;
  const start = point(timing.start, date ?? timing.end?.date ?? null);
  const end = point(timing.end, timing.start?.date ?? date);
  const duration = timing.duration?.maxMinutes;
  return { dated: !!(date || timing.start?.date || timing.end?.date), start: start ?? (end !== null && duration ? end - duration : null),
    end: end ?? (start !== null && duration ? start + duration : null) };
}
