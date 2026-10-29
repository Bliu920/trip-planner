import { z } from "zod";
import { jsonSchema, type JSONSchema7 } from "ai";
import { planSchema, planOperationSchema } from "@/lib/plan";
import { budgetSchema, budgetOperationSchema } from "@/lib/budget";
import { documentOperationSchema } from "@/services/documents/edits";
import { MAX_TEXT_BYTES } from "@/lib/file-types";
import { budgetGapSchema } from "@/services/budgets";
import type { AgentEnvironment } from "./contracts";
import { actionTool, succeeded, blocked, type ActionRun } from "./actions";
import { stageFeedback, commitFeedback } from "./feedback";
const id = z.string().min(1).max(100);
const editToken = z.string().min(1).max(100);
const view = z.enum(["effective", "saved"]);
const authorizedItemIds = z.array(id).max(100);
// Retain local validation.
function wire<T extends z.ZodType>(schema: T) {
  const json = z.toJSONSchema(schema, { reused: "ref", target: "draft-7" });
  const clean = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(clean); return; }
    const object = value as Record<string, unknown>;
    delete object.propertyNames;
    Object.values(object).forEach(clean);
  };
  clean(json);
  return jsonSchema<z.infer<T>>(json as JSONSchema7, { validate: value => {
    const parsed = schema.safeParse(value);
    return parsed.success ? { success: true, value: parsed.data } : { success: false, error: parsed.error };
  } });
}
export function artifactTools(environment: AgentEnvironment, run: ActionRun) {
  const api = environment.artifacts!;
  return {
    readEnvironment: actionTool(run, "read", { description: "Read effective artifact summaries, current edit token, pending inputs and server conflict status. Does not rebase or discard drafts.",
      inputSchema: z.object({}),
      execute: async () => succeeded(await api.readEnvironment()) }),
    readPlan: actionTool(run, "read", { description: "Read full Plan, summary, selected days/items, stays or unscheduled arrangements. Effective includes accepted unsaved edits. Saved is this run's pinned base. Use current supplied content without ceremonial rereads.",
      inputSchema: z.object({ view, selector: z.enum(["full", "summary", "days", "items", "stays", "unscheduled"]), ids: z.array(id).max(100) }),
      execute: input => succeeded(api.readPlan(input)) }),
    readBudget: actionTool(run, "read", { description: "Read full Budget, summary or selected categories, entries or Plan item links. Includes price evidence, totals, unknown counts and review status. Effective includes accepted drafts; saved is pinned base.",
      inputSchema: z.object({ view, selector: z.enum(["full", "summary", "categories", "entries", "planItems"]), ids: z.array(id).max(100) }),
      execute: input => succeeded(api.readBudget(input)) }),
    listDocuments: actionTool(run, "read", { description: "List Library metadata, including effective new/renamed drafts and edit capabilities. Read exact files separately. Continue nextCursor until null. Restart paging if the view changes.",
      inputSchema: z.object({ view, kind: z.enum(["upload", "planning_context", "research", "working"]).nullable(), format: z.enum(["markdown", "text", "csv", "pdf", "png", "jpeg", "webp"]).nullable(), query: z.string().max(180).nullable(), cursor: z.string().max(2000).nullable(), limit: z.number().int().min(1).max(30) }),
      execute: input => succeeded(api.listDocuments(input)) }),
    readDocument: actionTool(run, "read", { description: "Read complete exact text, including accepted drafts. contentRevision null means current in chosen view. Historical revision requires saved view and cannot authorize current edits. Unselected PDF/images require selection in chat.",
      inputSchema: z.object({ id, view, contentRevision: z.number().int().positive().nullable() }),
      execute: async input => {
      const result = await api.readDocument(input) as { available?: boolean };
      return result.available === false ? blocked(result, "NEEDS_SELECTION", "Select the original file in chat to provide its contents.", "correct_input") : succeeded(result);
    } }),
    createPlan: actionTool(run, "stage", { description: "Create a full initial three-day Plan only when absent. Include complete daily activity, meals, movement and stay coverage. Validate, correct and commit. Use latest editToken. Protected changes need explicit current user authorization.",
      inputSchema: wire(z.object({ editToken, plan: planSchema, authorizedItemIds })),
      execute: async input => stageFeedback(await api.createPlan(input.editToken, input.plan, input.authorizedItemIds)) }),
    editPlan: actionTool(run, "stage", { description: "Atomically edit only requested Plan content. Preserve unrelated IDs, evidence and fields. Updates shallow-merge declared fields; nested values must be complete. Repair note/location references explicitly in the same batch. replacePlan is available for justified whole replacement. Sources require real evidence, never newly invented direct_edit. Consume each returned token before the next mutation.",
      inputSchema: wire(z.object({ editToken, operations: z.array(planOperationSchema).min(1).max(100), authorizedItemIds })),
      execute: async input => stageFeedback(await api.editPlan(input.editToken, input.operations, input.authorizedItemIds)) }),
    createBudget: actionTool(run, "stage", { description: "Create a Budget only when absent. Research routine numeric costs with researchWeb. Use real sources and explicit ranges/units/assumptions. reviewed acknowledges whole-estimate review against the effective Plan. Not saved until commit.",
      inputSchema: wire(z.object({ editToken, budget: budgetSchema, reviewed: z.boolean() })),
      execute: async input => stageFeedback(await api.createBudget(input.editToken, input.budget, input.reviewed)) }),
    editBudget: actionTool(run, "stage", { description: "Atomically edit specific Budget fields or costs. Preserve unrelated entries and original source timestamps. recordReview must come after content edits and acknowledges reviewing the whole estimate against the effective Plan. Repair dangling Plan links before commit. replaceBudget permits deliberate full replacement.",
      inputSchema: wire(z.object({ editToken, operations: z.array(budgetOperationSchema).min(1).max(100) })),
      execute: async input => stageFeedback(await api.editBudget(input.editToken, input.operations)) }),
    createDocument: actionTool(run, "stage", { description: "Create a Library Markdown, TXT or CSV file with a host-allocated ID. content is exact text. No upload-origin creation. planning_context is singleton Markdown; initial planning should call saveBrief directly for its early checkpoint. This tool only stages.",
      inputSchema: z.object({ editToken, name: z.string().min(1).max(180), kind: z.enum(["research", "working", "planning_context"]), content: z.string().max(MAX_TEXT_BYTES) }),
      execute: async input => stageFeedback(await api.createDocument(input.editToken, input.name, input.kind, input.content)) }),
    editDocument: actionTool(run, "stage", { description: "Atomically rename, replaceContent or replaceText in an effective text document. Exact replaceText must match once. Preserve unrelated bytes, format and kind. Read before editing unless current content was supplied. Edits are staged until commit.",
      inputSchema: z.object({ editToken, id, operations: z.array(documentOperationSchema).min(1).max(100) }),
      execute: async input => stageFeedback(await api.editDocument(input.editToken, input.id, input.operations)) }),
    saveBrief: actionTool(run, "checkpoint", { description: "Save the initial Travel brief before staging other work. Host chooses singleton identity. expectedRevision is saved metadata revision or 0. If drafts already exist this stages the correction for final commit. Inspect saved/effect. Continue planning after this checkpoint and use its new editToken.",
      inputSchema: z.object({ editToken, markdown: z.string().min(1).max(24576), expectedRevision: z.number().int().nonnegative() }),
      execute: async input => {
      const result = await api.saveBrief(input.editToken, input.markdown, input.expectedRevision) as { saved?: boolean; staged?: boolean; document?: { contentRevision?: number } };
      if (result.saved === false && result.staged) return succeeded(result, "staged", "Travel brief update prepared for final save.");
      if (!result.saved || !result.document?.contentRevision) throw new Error("Brief save is not confirmed.");
      return succeeded(result, "persisted", "Travel brief saved. Continue to the complete itinerary and final save.");
    } }),
    resolveBudgetGaps: actionTool(run, "stage", { description: "Explain exceptional remaining unpriced costs only after bounded direct and comparable research. Retains unknown amounts and marks the budget incomplete. Follow budget-gaps guidance. This does not substitute for routine researched estimates.",
      inputSchema: z.object({ editToken, gaps: z.array(budgetGapSchema).min(1).max(100) }),
      execute: async input => stageFeedback(await api.resolveBudgetGaps(input.editToken, input.gaps)) }),
    inspectChanges: actionTool(run, "read", { description: "Inspect effective changes, affected IDs, validation blockers, quality findings and authoritative final-save receipt. Readiness findings are advisory and respect explicit user exceptions. Also verifies ambiguous/lost saves without writing. Saved brief progress is not a completed Plan. A missing receipt alone does not prove an in-flight write failed.",
      inputSchema: z.object({}),
      execute: async () => { await run.verify(); return succeeded(await api.inspectChanges()); } }),
    reloadWorkspace: actionTool(run, "reset", { description: "Explicitly discard all unsaved drafts and load latest saved state after a conflict. Does not undo a saved brief or fulfill pending edits. Reading environment never performs this reset. Reconcile and restage before commit.",
      inputSchema: z.object({ editToken }),
      execute: async input => succeeded(await api.reload(input.editToken), "none", "Latest saved trip loaded. Reconcile the requested changes before saving.") }),
    commit: actionTool(run, "commit", { description: "Atomically save the whole accepted overlay once per turn, after correcting blockers. Use latest editToken. Host includes current input; handledInputIds may add only fully handled pending inputs. A verified final receipt closes this turn's writes. On uncertain response inspectChanges before retrying the same logical save.",
      inputSchema: z.object({ editToken, summary: z.string().min(1).max(2000), handledInputIds: z.array(id).max(40) }),
      execute: async input => commitFeedback(await api.commit(input.editToken, input.summary, [...new Set([...(environment.source.type === "message" ? [environment.source.messageId] : []), ...input.handledInputIds])])) }),
  };
}
