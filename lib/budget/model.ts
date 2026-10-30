import { z } from "zod";
import type { Plan } from "@/lib/plan/types";

const text = z.string().trim().min(1).max(2000);
const money = z
  .number()
  .finite()
  .min(0)
  .max(10000000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimal places.",
  );
const link = z
  .string()
  .url()
  .max(3000)
  .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS source link.");
export const evidenceSchema = z
  .object({
    title: text,
    url: link.nullable(),
    documentId: z.uuid().nullable(),
    documentRevision: z.number().int().positive().nullable(),
    checkedAt: z.iso.datetime(),
    detail: text,
  })
  .strict()
  .refine(
    (s) => !!s.url || !!s.documentId,
    "A price needs a web link or a saved document reference.",
  )
  .refine(
    (s) => s.documentRevision === null || !!s.documentId,
    "Link the document used for this price.",
  );
export const entrySchema = z
  .object({
    id: z.string().min(1).max(100),
    label: text,
    category: z.enum(["stay", "transport", "food", "activities", "other"]),
    planItemIds: z.array(z.string().min(1).max(100)).max(100),
    pricing: z.enum(["estimated", "confirmed", "unknown"]),
    unit: text,
    quantity: z.number().int().min(1).max(10000),
    unitMin: money.nullable(),
    unitMax: money.nullable(),
    assumptions: z.string().max(4000),
    sources: z.array(evidenceSchema).max(12),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (entry.pricing === "unknown") {
      if (entry.unitMin !== null || entry.unitMax !== null)
        issue("Unknown prices must not contain an amount.");
      if (!entry.assumptions.trim()) issue("Explain why the price is missing.");
    } else {
      if (entry.unitMin === null || entry.unitMax === null || entry.unitMax < entry.unitMin)
        issue("Provide a valid price range.");
      if (!entry.sources.length) issue("Every priced item needs a source.");
      if (entry.pricing === "confirmed" && entry.unitMin !== entry.unitMax)
        issue("A confirmed price must be an exact amount.");
      if (entry.pricing === "estimated" && !entry.assumptions.trim())
        issue("Explain the estimate and its assumptions.");
    }
  });
export const budgetSchema = z
  .object({
    currency: z.literal("EUR"),
    scope: z.enum(["party", "per_person"]),
    travelers: z.number().int().min(1).max(100).nullable(),
    limit: money.nullable(),
    assumptions: z.string().max(6000),
    exclusions: z.array(text).max(20),
    entries: z.array(entrySchema).max(100),
  })
  .strict()
  .superRefine((budget, ctx) => {
    if (budget.scope === "party" && !budget.travelers)
      ctx.addIssue({
        code: "custom",
        message: "State how many travelers the party estimate covers.",
      });
    if (new Set(budget.entries.map((e) => e.id)).size !== budget.entries.length)
      ctx.addIssue({
        code: "custom",
        message: "The budget contains a duplicate cost. Reload before editing.",
      });
  });
export type Budget = z.infer<typeof budgetSchema>;
export type BudgetEntry = z.infer<typeof entrySchema>;
export type BudgetSnapshot = { revision: number; budget: Budget | null; needsReview: boolean };
export type BudgetView = BudgetSnapshot & { plan: Plan | null };
export function inspectBudget(value: unknown, plan: Plan | null) {
  const budget = budgetSchema.parse(value);
  for (const entry of budget.entries) {
    for (const id of entry.planItemIds)
      if (!plan?.items[id])
        throw new Error(
          `A linked activity is no longer in the plan. Unlink it from “${entry.label}” before saving.`,
        );
    for (const source of entry.sources)
      if (Date.parse(source.checkedAt) > Date.now() + 300000)
        throw new Error("Source checks cannot be dated in the future.");
  }
  return budget;
}
export function budgetTotals(budget: Budget) {
  let min = 0,
    max = 0,
    confirmed = 0,
    priced = 0;
  for (const entry of budget.entries) {
    if (entry.pricing === "unknown") continue;
    const low = Math.round(entry.unitMin! * 100) * entry.quantity;
    const high = Math.round(entry.unitMax! * 100) * entry.quantity;
    min += low;
    max += high;
    priced++;
    if (entry.pricing === "confirmed") confirmed += low;
  }
  return {
    min: min / 100,
    max: max / 100,
    confirmed: confirmed / 100,
    priced,
    unknown: budget.entries.length - priced,
  };
}
export const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
export function totalLabel(budget: Budget) {
  const total = budgetTotals(budget);
  return !total.priced
    ? "Not estimated yet"
    : total.min === total.max
      ? formatMoney(total.min)
      : `${formatMoney(total.min)} to ${formatMoney(total.max)}`;
}
export function emptyBudget(): Budget {
  return {
    currency: "EUR",
    scope: "per_person",
    travelers: null,
    limit: null,
    assumptions: "",
    exclusions: [],
    entries: [],
  };
}
