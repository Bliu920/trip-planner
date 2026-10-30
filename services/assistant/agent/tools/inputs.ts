import { z } from "zod";
import { jsonSchema, type JSONSchema7 } from "ai";
import { initialPlanSchema } from "@/lib/plan";
import { initialBudgetSchema } from "@/lib/budget";
import { planAuthoringInput, budgetAuthoringInput } from "../authoring";

/** Advertise and validate the same strict public input. */
export function mutationInput<T extends z.ZodObject>(schema: T) {
  const visible = schema.strict();
  const json = z.toJSONSchema(visible, { reused: "ref", target: "draft-7", io: "input" });
  // Normalize provider schema keywords.
  const clean = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(clean); return; }
    const object = value as Record<string, unknown>;
    delete object.propertyNames;
    Object.values(object).forEach(clean);
  };
  clean(json);
  return jsonSchema<z.infer<T>>(json as JSONSchema7, { validate: value => {
    const parsed = visible.safeParse(value);
    return parsed.success ? { success: true, value: parsed.data as z.infer<T> } : { success: false, error: parsed.error };
  } });
}

// Bind semantic artifact contracts.
export const createPlanInput = mutationInput(z.strictObject({
  plan: z.strictObject({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), days: initialPlanSchema.shape.days }),
  userProvided: z.boolean().default(false),
}));
export const createBudgetInput = mutationInput(z.strictObject({ budget: initialBudgetSchema }));
export const editPlanInput = mutationInput(planAuthoringInput);
export const editBudgetInput = mutationInput(budgetAuthoringInput);
