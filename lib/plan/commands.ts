import { fixedPoints, type Place } from "./model";
import type { Plan, PlanItem, ActivityItem, Basis } from "./types";

export const userBasis: Basis = {
  kind: "user",
  sources: [{ type: "direct_edit" }],
  explanation: "Edited directly in the plan.",
};
export type PlanEdit =
  | { type: "day"; id: string; title: string }
  | { type: "date"; date: string }
  | { type: "item"; item: PlanItem }
  | { type: "add"; dayId: string; item: PlanItem }
  | { type: "move"; id: string; dayId: string }
  | { type: "reorder"; id: string; offset: -1 | 1 }
  | { type: "remove"; id: string };

export function isProtected(item: PlanItem) {
  return !!item.keep || item.reservation?.state === "booked" || fixedPoints(item).length > 0;
}
export function catalogItem(place: Place, id: string): ActivityItem {
  return {
    id,
    kind: ["restaurant", "cafe"].includes(place.type) ? "meal" : "visit",
    title: place.name,
    location: { type: "catalog", placeId: place.id },
    reason: null,
    optional: false,
    keep: null,
    reservation: null,
    timing: {
      period: null,
      start: null,
      end: null,
      duration:
        place.duration_minutes === null
          ? null
          : {
              minMinutes: place.duration_minutes,
              maxMinutes: place.duration_minutes,
              basis: {
                kind: "catalog",
                sources: [{ type: "catalog", placeId: place.id, field: "duration_minutes" }],
                explanation: null,
              },
            },
    },
  };
}

/** Mutates only a session-owned clone. Validation follows before persistence. */
export function applyEdit(plan: Plan, edit: PlanEdit) {
  if (edit.type === "date") {
    plan.startDate = edit.date ? { value: edit.date, basis: userBasis } : null;
    return;
  }
  if (edit.type === "day") {
    const day = plan.days.find((day) => day.id === edit.id);
    if (!day || !edit.title.trim()) throw new Error("Give this day a title.");
    day.title = edit.title.trim();
    return;
  }
  if (edit.type === "add") {
    const day = plan.days.find((day) => day.id === edit.dayId);
    if (!day || plan.items[edit.item.id] || edit.item.kind === "stay")
      throw new Error("Choose a valid day and a new activity.");
    plan.items[edit.item.id] = structuredClone(edit.item);
    day.itemIds.push(edit.item.id);
    return;
  }
  const id = edit.type === "item" ? edit.item.id : edit.id;
  const item = plan.items[id];
  if (!item) throw new Error("This activity is no longer in the plan.");
  if (edit.type === "item") {
    if (!edit.item.title.trim()) throw new Error("Give this activity a title.");
    plan.items[id] = structuredClone(edit.item);
    return;
  }
  if (isProtected(item))
    throw new Error(
      "This arrangement has protected details. Review them before changing its placement.",
    );
  if (edit.type === "reorder") {
    const ids = plan.days.find((day) => day.itemIds.includes(id))?.itemIds;
    if (!ids) return;
    const from = ids.indexOf(id),
      to = from + edit.offset;
    if (to >= 0 && to < ids.length) [ids[from], ids[to]] = [ids[to], ids[from]];
    return;
  }
  if (edit.type === "move" && edit.dayId && !plan.days.some((day) => day.id === edit.dayId))
    throw new Error("Choose an existing day.");
  if (item.kind === "stay" && edit.type === "move")
    throw new Error("Accommodation stays outside the daily activity list.");
  plan.days.forEach((day) => {
    day.itemIds = day.itemIds.filter((itemId) => itemId !== id);
  });
  if (edit.type === "move") plan.days.find((day) => day.id === edit.dayId)?.itemIds.push(id);
  else {
    delete plan.items[id];
    plan.notes.forEach((note) => {
      note.relatedItemIds = note.relatedItemIds.filter((itemId) => itemId !== id);
    });
  }
}
