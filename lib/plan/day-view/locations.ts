import type { CheckedLeg } from "@/lib/journeys";
import type { Day, Stop } from "../presentation/model";

export type MapPlace = {
  id: string;
  title: string;
  coordinates: [number, number];
  number: number | "H";
};
export type LabelBox = { left: number; top: number; right: number; bottom: number };
const positioned = (point: Stop["coordinates"]): point is [number, number] =>
  !!point && point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;

/** One position view for the map and selected details. */
export function dayLocations(day: Day, routes: readonly CheckedLeg[] = []) {
  const positions = new Map<string, [number, number]>();
  for (const route of routes.filter((route) => route.dayId === day.id)) {
    if (route.fromCoordinates)
      positions.set(route.fromItemId, [route.fromCoordinates[1], route.fromCoordinates[0]]);
    if (route.toCoordinates)
      positions.set(route.toItemId, [route.toCoordinates[1], route.toCoordinates[0]]);
  }
  const stops = [...day.stops, ...(day.stays ?? [])].map((stop) => {
    const resolved = positions.get(stop.id);
    const coordinates = stop.omitted
      ? null
      : positioned(resolved)
        ? resolved
        : positioned(stop.coordinates)
          ? stop.coordinates
          : null;
    return { ...stop, coordinates };
  });
  const places: MapPlace[] = stops.flatMap((stop, index) =>
    stop.coordinates
      ? [
          {
            id: stop.id,
            title: stop.title,
            coordinates: stop.coordinates,
            number: index < day.stops.length ? index + 1 : "H",
          },
        ]
      : [],
  );
  return { stops, places };
}

export function locationNotice(stop: Stop) {
  if (positioned(stop.coordinates) || stop.locationState === "not_applicable") return null;
  if (stop.locationState === "undecided") return "Place not chosen yet";
  if (stop.locationState === "unmapped" || stop.locationLabel) return "Not located on map";
  return /^(rest|free time)\b/.test(stop.category) ? null : "Place not chosen yet";
}

const overlaps = (a: LabelBox, b: LabelBox) =>
  a.left < b.right + 4 && a.right + 4 > b.left && a.top < b.bottom + 4 && a.bottom + 4 > b.top;
/** Keep a selected name visible without crowding neighboring pins. */
export function visibleMapLabels(
  labels: { id: string; box: LabelBox }[],
  pins: LabelBox[],
  frame: LabelBox,
  selected: string | null,
) {
  const visible = new Set<string>(),
    occupied: LabelBox[] = [];
  const chosen = labels.find((label) => label.id === selected);
  if (chosen) {
    visible.add(chosen.id);
    occupied.push(chosen.box);
  }
  for (const label of labels) {
    if (label === chosen) continue;
    const box = label.box;
    if (
      box.left < frame.left + 4 ||
      box.right > frame.right - 4 ||
      box.top < frame.top + 4 ||
      box.bottom > frame.bottom - 4
    )
      continue;
    if ([...occupied, ...pins].some((other) => overlaps(box, other))) continue;
    visible.add(label.id);
    occupied.push(box);
  }
  return visible;
}
