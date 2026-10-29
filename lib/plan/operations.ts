import { z } from "zod";
import { daySchema, dateChoiceSchema, itemSchema, noteSchema, planSchema } from "./schema";
import type { Plan, PlanItem } from "./types";
const id = z.string().min(1).max(100);
const index = z.number().int().min(0).max(40);
const itemFields = z.union(itemSchema.options.map(schema => z.strictObject(schema.shape).omit({ id: true, kind: true }).partial()) as unknown as [z.ZodType, z.ZodType, z.ZodType]);
export const planOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("setStartDate"), value: dateChoiceSchema.nullable() }),
  z.strictObject({ type: z.literal("updateDay"), id, fields: daySchema.omit({ id: true, itemIds: true }).partial() }),
  z.strictObject({ type: z.literal("reorderDays"), ids: z.array(id).length(3) }),
  z.strictObject({ type: z.literal("addItem"), item: itemSchema, dayId: id.nullable(), index: index.nullable() }),
  z.strictObject({ type: z.literal("updateItem"), id, fields: itemFields }),
  z.strictObject({ type: z.literal("replaceItem"), item: itemSchema }),
  z.strictObject({ type: z.literal("moveItem"), id, dayId: id, index }),
  z.strictObject({ type: z.literal("reorderItems"), dayId: id, ids: z.array(id).max(40) }),
  z.strictObject({ type: z.literal("unscheduleItem"), id }),
  z.strictObject({ type: z.literal("removeItem"), id }),
  z.strictObject({ type: z.literal("addNote"), note: noteSchema }),
  z.strictObject({ type: z.literal("updateNote"), id, fields: noteSchema.omit({ id: true }).partial() }),
  z.strictObject({ type: z.literal("removeNote"), id }),
  z.strictObject({ type: z.literal("replacePlan"), plan: planSchema }),
]);
export type PlanOperation = z.infer<typeof planOperationSchema>;
function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} was not found.`);
  return value;
}
function permutation(before: string[], after: string[]) {
  if (before.length !== after.length || new Set(after).size !== after.length || after.some(id => !before.includes(id)))
    throw new Error("Supply an exact permutation of the existing IDs.");
}
/** Applies an atomic batch to a clone. Host validates sources and protected facts. */
export function applyPlanOperations(current: Plan, input: PlanOperation[]): Plan {
  const operations = z.array(planOperationSchema).min(1).max(100).parse(input);
  let plan = structuredClone(current);
  const day = (id: string) => requireValue(plan.days.find(day => day.id === id), "Day");
  const item = (id: string) => requireValue(plan.items[id], "Arrangement");
  const unassign = (id: string) => plan.days.forEach(day => { day.itemIds = day.itemIds.filter(value => value !== id); });
  const insert = (id: string, dayId: string, at: number | null) => {
    if (item(id).kind === "stay") throw new Error("Stays cannot appear in daily sequences.");
    const ids = day(dayId).itemIds;
    if (at !== null && at > ids.length) throw new Error("Insertion index is outside this day.");
    ids.splice(at ?? ids.length, 0, id);
  };
  for (const op of operations) {
    switch (op.type) {
      case "replacePlan": plan = structuredClone(op.plan); break;
      case "setStartDate": plan.startDate = op.value; break;
      case "updateDay": Object.assign(day(op.id), op.fields); break;
      case "reorderDays": permutation(plan.days.map(day => day.id), op.ids); plan.days = op.ids.map(id => day(id)) as Plan["days"]; break;
      case "addItem":
        if (plan.items[op.item.id]) throw new Error("Arrangement ID already exists.");
        plan.items[op.item.id] = structuredClone(op.item) as PlanItem;
        if (op.dayId !== null) insert(op.item.id, op.dayId, op.index);
        break;
      case "updateItem": {
        const existing = item(op.id);
        const fields = z.strictObject(itemSchema.options.find(schema => schema.safeParse(existing).success)!.shape).omit({ id: true, kind: true }).partial().parse(op.fields);
        plan.items[op.id] = { ...existing, ...fields } as PlanItem; break;
      }
      case "replaceItem": item(op.item.id); plan.items[op.item.id] = structuredClone(op.item) as PlanItem; break;
      case "moveItem": item(op.id); day(op.dayId); unassign(op.id); insert(op.id, op.dayId, op.index); break;
      case "reorderItems": permutation(day(op.dayId).itemIds, op.ids); day(op.dayId).itemIds = [...op.ids]; break;
      case "unscheduleItem": item(op.id); unassign(op.id); break;
      case "removeItem": item(op.id); unassign(op.id); delete plan.items[op.id]; break;
      case "addNote":
        if (plan.notes.some(note => note.id === op.note.id)) throw new Error("Note ID already exists.");
        plan.notes.push(structuredClone(op.note)); break;
      case "updateNote": Object.assign(requireValue(plan.notes.find(note => note.id === op.id), "Note"), op.fields); break;
      case "removeNote": requireValue(plan.notes.find(note => note.id === op.id), "Note"); plan.notes = plan.notes.filter(note => note.id !== op.id); break;
    }
  }
  return planSchema.parse(plan);
}
