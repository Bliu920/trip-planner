import { z } from "zod";
import type { Plan } from "./types";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().trim().min(1).max(2000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a real calendar date.");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const sourceSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("message"),
    conversationId: id,
    messageId: id,
  }),
  z.strictObject({ type: z.literal("legacy_notes") }),
  z.strictObject({ type: z.literal("direct_edit") }),
  z.strictObject({
    type: z.literal("attachment"),
    attachmentId: id,
    locator: text.nullable(),
  }),
  z.strictObject({
    type: z.literal("document"),
    documentId: id,
    revision: z.number().int().positive(),
    section: text.nullable(),
  }),
  z.strictObject({
    type: z.literal("catalog"),
    placeId: id,
    field: text.nullable(),
  }),
  z.strictObject({
    type: z.literal("web"),
    url: z.url().refine((s) => /^https?:\/\//.test(s)),
    accessedAt: z.iso.datetime(),
  }),
]);
const basis = z
  .strictObject({
    kind: z.enum(["user", "catalog", "research", "assumption"]),
    sources: z.array(sourceSchema).max(12),
    explanation: text.nullable(),
  })
  .superRefine((b, ctx) => {
    if (b.kind === "assumption" && !b.explanation)
      ctx.addIssue({ code: "custom", message: "Explain the assumption." });
    if (b.kind !== "assumption" && !b.sources.length)
      ctx.addIssue({ code: "custom", message: "A source is required." });
    if (
      b.kind === "user" &&
      !b.sources.some((s) =>
        ["message", "attachment", "document", "legacy_notes", "direct_edit"].includes(s.type),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "User facts require a user source.",
      });
  });
export const dateChoiceSchema = z.strictObject({ value: date, basis });
export const locationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("catalog"), placeId: id }),
  z.strictObject({ type: z.literal("item"), itemId: id }),
  z.strictObject({
    type: z.literal("travel_endpoint"),
    itemId: id,
    endpoint: z.enum(["from", "to"]),
  }),
  z.strictObject({
    type: z.literal("specified"),
    label: text,
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    basis,
  }),
  z.strictObject({ type: z.literal("area"), label: text, basis }),
]);
const point = z
  .strictObject({
    date: date.nullable(),
    time: clock.nullable(),
    binding: z.enum(["suggested", "fixed"]),
    basis,
  })
  .refine((p) => p.date !== null || p.time !== null, "Supply a date or time.")
  .refine(
    (p) => p.binding !== "fixed" || p.basis.kind === "user",
    "Fixed timing requires user evidence.",
  );
const duration = z
  .strictObject({
    minMinutes: z.number().int().positive().max(4320),
    maxMinutes: z.number().int().positive().max(4320),
    basis,
  })
  .refine((d) => d.maxMinutes >= d.minMinutes, "Duration range is reversed.");
const timing = z
  .strictObject({
    period: z.enum(["morning", "afternoon", "evening"]).nullable(),
    start: point.nullable(),
    end: point.nullable(),
    duration: duration.nullable(),
  })
  .refine(
    (t) => !(t.start && t.end && t.duration),
    "Derive duration from two endpoints.",
  );
const common = {
  id,
  title: z.string().trim().min(1).max(160),
  reason: text.nullable(),
  optional: z.boolean(),
  keep: z.strictObject({ basis }).nullable(),
  reservation: z
    .strictObject({
      state: z.enum(["booked", "cancelled", "not_booked"]),
      basis,
    })
    .nullable(),
};
export const itemSchema = z.union([
  z.strictObject({
    ...common,
    kind: z.enum(["visit", "meal", "rest", "free_time", "logistics"]),
    location: locationSchema.nullable(),
    timing,
  }),
  z.strictObject({
    ...common,
    kind: z.literal("travel"),
    from: locationSchema.nullable(),
    to: locationSchema.nullable(),
    mode: z
      .enum(["walk", "transit", "train", "car", "flight", "other"])
      .nullable(),
    timing: z.discriminatedUnion("type", [
      z.strictObject({ type: z.literal("interval"), schedule: timing }),
      z.strictObject({ type: z.literal("arrival"), at: point }),
      z.strictObject({ type: z.literal("departure"), at: point }),
    ]),
  }),
  z.strictObject({
    ...common,
    kind: z.literal("stay"),
    location: locationSchema,
    coverage: z
      .union([
        z.strictObject({
          type: z.literal("nights"),
          afterDayIds: z.array(id).min(1).max(3),
          basis,
        }),
        z.strictObject({
          type: z.literal("dates"),
          checkIn: dateChoiceSchema.nullable(),
          checkOut: dateChoiceSchema.nullable(),
        }),
      ])
      .nullable(),
  }),
]);
export const daySchema = z.strictObject({
  id,
  title: z.string().trim().min(1).max(160),
  itemIds: z.array(id).max(40),
  startLocation: locationSchema.nullable(),
  endLocation: locationSchema.nullable(),
});
export const noteSchema = z.strictObject({
  id, kind: z.enum(["assumption", "uncertainty", "conflict", "action"]),
  text, relatedItemIds: z.array(id).max(20), sources: z.array(sourceSchema).max(12),
});
export const planSchema: z.ZodType<Plan> = z.strictObject({
  startDate: dateChoiceSchema.nullable(),
  days: z.tuple([daySchema, daySchema, daySchema]),
  items: z
    .record(id, itemSchema)
    .refine(
      (v) => Object.keys(v).length <= 100,
      "Use no more than 100 arrangements.",
    ),
  notes: z.array(noteSchema).max(40),
});
