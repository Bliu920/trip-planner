import { z } from "zod";

const assertion = z.discriminatedUnion("type", [
  z.object({ type: z.literal("saved_plan") }),
  z.object({ type: z.literal("saved_budget") }),
  z.object({ type: z.literal("no_saved_plan") }),
  z.object({ type: z.literal("no_saved_budget") }),
  z.object({ type: z.literal("no_final_receipt") }),
  z.object({ type: z.literal("fault_triggered") }),
  z.object({ type: z.literal("rejection_observed") }),
  z.object({ type: z.literal("zero_results_observed") }),
  z.object({ type: z.literal("duplicate_delivery_observed") }),
  z.object({ type: z.literal("late_brief_staged") }),
  z.object({ type: z.literal("saved_brief") }),
  z.object({ type: z.literal("final_receipt") }),
  z.object({ type: z.literal("unchanged_artifacts") }),
  z.object({ type: z.literal("three_days") }),
  z.object({ type: z.literal("valid_catalog_references") }),
  z.object({ type: z.literal("pending_input"), id: z.string() }),
  z.object({ type: z.literal("document_content"), name: z.string(), content: z.string() }),
  z.object({ type: z.literal("plan_budget_unchanged") }),
  z.object({ type: z.literal("plan_unchanged") }),
  z.object({ type: z.literal("preserve_day"), id: z.string() }),
  z.object({ type: z.literal("document_count"), name: z.string(), count: z.number().int().nonnegative() }),
  z.object({ type: z.literal("document_updated"), name: z.string() }),
  z.object({ type: z.literal("budget_category_total"), category: z.string(), min: z.number(), max: z.number(), pricing: z.enum(["estimated", "confirmed"]) }),
  z.object({ type: z.literal("budget_unchanged_stale") }),
  z.object({ type: z.literal("unknown_category"), category: z.string() }),
  z.object({ type: z.literal("budget_source_contains"), category: z.string(), text: z.string() }),
  z.object({ type: z.literal("budget_limit"), limit: z.number().nullable() }),
  z.object({ type: z.literal("budget_scope"), scope: z.enum(["party", "per_person"]), travelers: z.number().int().nullable(), limit: z.number().nullable() }),
  z.object({ type: z.literal("item_on_day"), id: z.string(), dayId: z.string() }),
  z.object({ type: z.literal("preserve_note"), id: z.string() }),
  z.object({ type: z.literal("preserve_item"), id: z.string() }),
  z.object({ type: z.literal("preserve_booking"), id: z.string() }),
  z.object({ type: z.literal("unscheduled"), id: z.string() }),
  z.object({ type: z.literal("tool_min_calls"), name: z.string(), count: z.number().int().positive() }),
  z.object({ type: z.literal("item_once"), id: z.string() }),
  z.object({ type: z.literal("successful_tool"), names: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("brief_before_plan") }),
  z.object({ type: z.literal("required_tool"), names: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("no_mutations") }),
]);

export const caseSchema = z.object({
  version: z.literal(1), id: z.string().regex(/^[A-Z][0-9]{2}$/), category: z.enum(["initial", "follow_up"]),
  title: z.string().min(1), prompt: z.string().min(1).max(4000),
  fixture: z.enum(["empty", "florence", "florence_packing", "florence_booking", "rome", "rome_booking", "rome_packing", "rome_packing_ambiguous", "empty_attachment", "empty_injection", "rome_history", "rome_pending", "rome_historical_pdf", "rome_receipt"]),
  research: z.enum(["live", "disabled", "fixture_prices", "fixture_links"]),
  fault: z.enum(["none", "provider_after_brief", "lost_commit_response", "concurrent_commit", "rejected_edit", "late_brief", "indeterminate_commit", "zero_search", "duplicate_edit"]).default("none"),
  assertions: z.array(assertion).min(1),
  followUps: z.array(z.object({ prompt: z.string().min(1).max(4000), assertions: z.array(assertion).min(1) }).strict()).min(1).max(8).optional(),
  expected: z.object({ reply_example: z.string().min(1), artifact_expectations: z.string().min(1) }).strict(),
  rubric: z.array(z.object({ id: z.string().min(1), criterion: z.string().min(1) })).min(1),
}).strict();
export type EvalCase = z.infer<typeof caseSchema>;
export type Assertion = z.infer<typeof assertion>;
export type Check = { id: string; outcome: "pass" | "fail" | "not_evaluable"; detail: string };
export type Trace = { type: string; toolName?: string; toolCallId?: string; input?: unknown; output?: unknown; errorText?: string };
export type Snapshot = { plan: unknown; budget: unknown; pendingInputs: unknown[]; documents: { id: string; name: string; kind: string; content: string | null; contentRevision?: number; previousVersion?: { contentRevision: number; content: string } | null }[] };
export type Observation = {
  caseId: string; startedAt: string; elapsedMs: number; responseStatus: number;
  before: Snapshot; after: Snapshot; reply: string; replyStatus: string | null;
  parts: unknown[]; trace: Trace[]; providerRequests: number; simulatedRequests: number; providerStatuses: number[]; commitCount: number; storageError: string | null; faultTriggered: boolean;
  turns?: { prompt: string; observation: Omit<Observation, "turns"> }[];
};
export type Verdict = { outcome: "pass" | "fail" | "not_evaluable"; results: { id: string; outcome: "pass" | "fail" | "not_evaluable"; evidence: string }[] };
