import { z } from "zod";
import { budgetSchema, entrySchema, type Budget } from "./model";
const id = z.string().min(1).max(100);
export const budgetOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("setScope"), scope: z.enum(["party", "per_person"]), travelers: z.number().int().min(1).max(100).nullable() }),
  z.strictObject({ type: z.literal("setLimit"), value: budgetSchema.shape.limit }),
  z.strictObject({ type: z.literal("setAssumptions"), value: budgetSchema.shape.assumptions }),
  z.strictObject({ type: z.literal("setExclusions"), value: budgetSchema.shape.exclusions }),
  z.strictObject({ type: z.literal("addEntry"), entry: entrySchema }),
  z.strictObject({ type: z.literal("updateEntry"), id, fields: z.strictObject(entrySchema.shape).omit({ id: true }).partial() }),
  z.strictObject({ type: z.literal("removeEntry"), id }),
  z.strictObject({ type: z.literal("recordReview") }),
  z.strictObject({ type: z.literal("replaceBudget"), budget: budgetSchema, reviewed: z.boolean() }),
]);
export type BudgetOperation = z.infer<typeof budgetOperationSchema>;
export function applyBudgetOperations(current: Budget, input: BudgetOperation[]) {
  const operations = z.array(budgetOperationSchema).min(1).max(100).parse(input);
  let budget = structuredClone(current), reviewed = false;
  for (const op of operations) {
    if (op.type !== "recordReview") reviewed = false;
    switch (op.type) {
      case "replaceBudget": budget = structuredClone(op.budget); reviewed = op.reviewed; break;
      case "setScope": budget.scope = op.scope; budget.travelers = op.travelers; break;
      case "setLimit": budget.limit = op.value; break;
      case "setAssumptions": budget.assumptions = op.value; break;
      case "setExclusions": budget.exclusions = op.value; break;
      case "addEntry":
        if (budget.entries.some(entry => entry.id === op.entry.id)) throw new Error("Cost ID already exists.");
        budget.entries.push(structuredClone(op.entry)); break;
      case "updateEntry": {
        const entry = budget.entries.find(entry => entry.id === op.id);
        if (!entry) throw new Error("Cost was not found.");
        Object.assign(entry, op.fields); break;
      }
      case "removeEntry":
        if (!budget.entries.some(entry => entry.id === op.id)) throw new Error("Cost was not found.");
        budget.entries = budget.entries.filter(entry => entry.id !== op.id); break;
      case "recordReview": reviewed = true; break;
    }
  }
  return { budget: budgetSchema.parse(budget), reviewed };
}
