import { z } from "zod";
import { budgetSchema, type Budget } from "./model";

export const initialBudgetSchema = z
  .strictObject({
    currency: budgetSchema.shape.currency,
    scope: budgetSchema.shape.scope,
    travelers: budgetSchema.shape.travelers,
    limit: budgetSchema.shape.limit,
    assumptions: budgetSchema.shape.assumptions,
    exclusions: budgetSchema.shape.exclusions,
  })
  .refine(
    (budget) => budget.scope !== "party" || budget.travelers !== null,
    "State how many travelers the party estimate covers.",
  );

export function initializeBudget(input: z.infer<typeof initialBudgetSchema>): Budget {
  return budgetSchema.parse({ ...initialBudgetSchema.parse(input), entries: [] });
}
