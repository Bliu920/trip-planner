import { z } from "zod";
import { dateChoiceSchema, daySchema, planSchema } from "./schema";
import type { Plan } from "./types";

const day = daySchema.pick({ id: true, title: true });
export const initialPlanSchema = z.strictObject({
  startDate: dateChoiceSchema.nullable(),
  days: z.tuple([day, day, day]),
});

/** Allocate empty collections on the host, then assemble with scoped operations. */
export function initializePlan(input: z.infer<typeof initialPlanSchema>): Plan {
  const header = initialPlanSchema.parse(input);
  return planSchema.parse({
    ...header,
    days: header.days.map((day) => ({
      ...day,
      itemIds: [],
      startLocation: null,
      endLocation: null,
    })),
    items: {},
    notes: [],
  });
}
