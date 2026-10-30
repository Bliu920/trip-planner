import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().trim().min(1).max(2000);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minutes = z.number().int().min(1).max(4320);
const userLocationFields = {
  userLocation: text.nullable().optional().describe("Exact location text from a real user message. Never use for an agent-proposed neighborhood or route; use area instead."),
  userLocationMessageId: id.optional().describe("Source user message ID for userLocation or the property named for includedInStayId. Omit to use the current user message."),
};
export const venueInput = z.strictObject({ name: z.string().trim().min(1).max(160).describe("Exact venue name only; keep address and research notes in their own fields."), address: text, city: text, sourceId: id, geoEvidenceId: z.uuid().optional().describe("Matched position ID from resolvePlace. The host validates it and supplies coordinates; omit when unresolved.") });
const locationFields = {
  placeId: id.nullable().optional(), venue: venueInput.nullable().optional(), locationItemId: id.nullable().optional(),
  ...userLocationFields, area: text.nullable().optional().describe("Agent-proposed area for free time, rest, logistics or travel. Not a named attraction or meal venue."), includedInStayId: id.nullable().optional(),
};
const timeFields = {
  startTime: clock.nullable().optional(), endTime: clock.nullable().optional(), startDate: date.nullable().optional(), endDate: date.nullable().optional(),
  durationMinutes: minutes.nullable().optional(), durationRange: z.strictObject({ min: minutes, max: minutes }).nullable().optional(),
};
const activityFields = { title: z.string().trim().min(1).max(160), reason: text.nullable().optional(), optional: z.boolean().optional(), ...locationFields, ...timeFields };
const activityKind = z.enum(["visit", "meal", "rest", "free_time", "logistics"]);
const activity = z.strictObject({ ...activityFields, kind: activityKind.default("visit") });
const travelLocation = z.strictObject(locationFields);
const travelFields = { title: activityFields.title, reason: text.nullable().optional(), optional: z.boolean().optional(),
  from: travelLocation.nullable().optional(), to: travelLocation.nullable().optional(), mode: z.enum(["walk", "transit", "train", "car", "flight", "other"]).nullable().optional(),
  timingMode: z.enum(["interval", "arrival", "departure"]).optional(), ...timeFields };
const stayFields = { title: activityFields.title.optional(), reason: text.nullable().optional(), hotel: venueInput.optional(), area: text.optional(), ...userLocationFields, afterDayIds: z.array(id).min(1).max(3).optional() };
export const planCommand = z.discriminatedUnion("type", [
  activity.extend({ type: z.literal("addActivity"), id, dayId: id, afterItemId: id.nullable().optional(), startTime: clock }),
  z.strictObject({ type: z.literal("updateActivity"), id, changes: z.strictObject({ ...activityFields, kind: activityKind.optional() }).partial() }),
  activity.extend({ type: z.literal("replaceActivity"), id }),
  z.strictObject({ type: z.literal("addTravel"), id, dayId: id, afterItemId: id.nullable().optional(), ...travelFields, startTime: clock }),
  z.strictObject({ type: z.literal("updateTravel"), id, changes: z.strictObject(travelFields).partial() }),
  z.strictObject({ type: z.literal("addStay"), id, ...stayFields, afterDayIds: z.array(id).min(1).max(3) }),
  z.strictObject({ type: z.literal("updateStay"), id, changes: z.strictObject(stayFields) }),
  z.strictObject({ type: z.literal("moveItem"), id, dayId: id, afterItemId: id.nullable().optional() }),
  z.strictObject({ type: z.literal("reorderItems"), dayId: id, ids: z.array(id).max(40) }),
  z.strictObject({ type: z.literal("removeItem"), id }),
  z.strictObject({ type: z.literal("setDate"), value: date.nullable(), userProvided: z.boolean().default(false) }),
  z.strictObject({ type: z.literal("updateDay"), id, changes: z.strictObject({ title: activityFields.title.optional(), startLocation: travelLocation.nullable().optional(), endLocation: travelLocation.nullable().optional() }) }),
  z.strictObject({ type: z.literal("setCommitment"), id, messageId: id.optional(), reservation: z.enum(["booked", "cancelled", "not_booked"]).optional(), keep: z.boolean().optional(), fixedStart: z.boolean().optional(), fixedEnd: z.boolean().optional() }),
  z.strictObject({ type: z.literal("upsertReminder"), id, kind: z.enum(["assumption", "uncertainty", "conflict", "action"]), text, itemIds: z.array(id).max(20).default([]) }),
  z.strictObject({ type: z.literal("removeReminder"), id }),
]);
export const planAuthoringInput = z.strictObject({ operations: z.array(planCommand).min(1).max(12) });
export type PlanCommand = z.infer<typeof planCommand>;
export type ActivityInput = z.infer<typeof activity>;
export type LocationInput = z.infer<typeof travelLocation>;

const money = z.number().finite().nonnegative().max(10000000);
const costFields = {
  label: text, category: z.enum(["stay", "transport", "food", "activities", "other"]), planItemIds: z.array(id).max(100),
  unit: text, quantity: z.number().int().min(1).max(10000).describe("Occurrences of the quoted unit, not the party size. One admission or pass per adult has quantity 1 with priceScope per_person. A three-day daily food allowance has quantity 3; nine one-meal prices have quantity 9. Linked item count does not set quantity. Two room nights have quantity 2 with priceScope whole_party; the host handles sharing."), min: money.nullable(), max: money.nullable(),
  priceScope: z.enum(["per_person", "whole_party"]), coveredTravelers: z.number().int().min(1).max(100).optional(),
  pricing: z.enum(["estimated", "confirmed", "unknown"]).default("estimated"), assumptions: text,
  sources: z.array(z.strictObject({ sourceId: id, detail: text, title: text.optional() })).max(12),
};
export const budgetCommand = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("addCost"), id, ...costFields }),
  z.strictObject({ type: z.literal("updateCost"), id, changes: z.strictObject(costFields).partial() }),
  z.strictObject({ type: z.literal("removeCost"), id }),
  z.strictObject({ type: z.literal("updateSettings"), scope: z.enum(["party", "per_person"]).optional(), travelers: z.number().int().min(1).max(100).nullable().optional(), limit: money.nullable().optional(), assumptions: text.optional(), exclusions: z.array(text).max(20).optional() }),
  z.strictObject({ type: z.literal("review") }),
]);
export const budgetAuthoringInput = z.strictObject({ operations: z.array(budgetCommand).min(1).max(12) });
export type BudgetCommand = z.infer<typeof budgetCommand>;
