import { z } from "zod";
import { initializePlan } from "@/lib/plan";
import { initializeBudget } from "@/lib/budget";
import { documentOperationSchema } from "@/services/documents/edits";
import { MAX_TEXT_BYTES } from "@/lib/file-types";
import { budgetGapSchema } from "@/services/budgets";
import type { AgentEnvironment } from "../contracts";
import { actionTool, succeeded, blocked, type ActionRun } from "../actions";
import { readGuide } from "../guides";
import { createPlanInput, createBudgetInput, editPlanInput, editBudgetInput, mutationInput } from "./inputs";
import { authorPlan, authorBudget, authoringItem, userBasis, proposed } from "../authoring";
import type { Plan } from "@/lib/plan";
import type { Budget, BudgetEntry } from "@/lib/budget";
const id = z.string().min(1).max(100);
const view = z.enum(["effective", "saved"]);
export function artifactTools(environment: AgentEnvironment, run: ActionRun) {
  const api = environment.artifacts!;
  const token = () => (api.manifest() as { editToken: string }).editToken;
  return {
    readEnvironment: actionTool(run, "read", { description: "Read effective artifact summaries, pending inputs and server conflict status. Does not rebase or discard drafts.",
      inputSchema: z.object({}),
      execute: async () => succeeded(await api.readEnvironment()) }),
    readPlan: actionTool(run, "read", { description: "Read full Plan, summary, selected days/items, stays or unscheduled arrangements. Effective includes accepted unsaved edits. Saved is this run's pinned base. Use current supplied content without ceremonial rereads.",
      inputSchema: z.object({ view, selector: z.enum(["full", "summary", "days", "items", "stays", "unscheduled"]), ids: z.array(id).max(100) }),
      execute: input => {
        const result = api.readPlan(input) as { plan?: Plan; items?: Plan["items"][string][] };
        return succeeded({ ...result, ...(result.plan ? { plan: { ...result.plan, items: Object.fromEntries(Object.values(result.plan.items).map(item => [item.id, authoringItem(item, environment)])) } } : {}), ...(result.items ? { items: result.items.map(item => authoringItem(item, environment)) } : {}) });
      } }),
    readBudget: actionTool(run, "read", { description: "Read full Budget, summary or selected categories, entries or Plan item links. Includes price evidence, totals, unknown counts and review status. Effective includes accepted drafts; saved is pinned base.",
      inputSchema: z.object({ view, selector: z.enum(["full", "summary", "categories", "entries", "planItems"]), ids: z.array(id).max(100) }),
      execute: input => {
        const result = api.readBudget(input) as { budget?: Budget; entries?: BudgetEntry[]; scope?: Budget["scope"]; travelers?: number | null };
        const sources = environment.evidenceSources?.() ?? [];
        const project = (entry: BudgetEntry) => ({ id: entry.id, label: entry.label, category: entry.category, planItemIds: entry.planItemIds, unit: entry.unit, quantity: entry.quantity, min: entry.unitMin, max: entry.unitMax,
          priceScope: result.scope === "party" ? "whole_party" : "per_person", coveredTravelers: result.travelers ?? undefined, pricing: entry.pricing, assumptions: entry.assumptions,
          sources: entry.sources.map(source => ({ sourceId: sources.find(record => record.url === source.url && record.documentId === source.documentId && record.documentRevision === source.documentRevision && record.checkedAt === source.checkedAt)?.sourceId, title: source.title, detail: source.detail })) });
        return succeeded({ ...result, ...(result.budget ? { budget: { ...result.budget, entries: result.budget.entries.map(project) } } : {}), ...(result.entries ? { entries: result.entries.map(project) } : {}) });
      } }),
    listDocuments: actionTool(run, "read", { description: "List Library metadata, including effective new/renamed drafts and edit capabilities. Read exact files separately. Continue nextCursor until null. Restart paging if the view changes.",
      inputSchema: z.object({ view, kind: z.enum(["upload", "planning_context", "research", "working"]).nullable(), format: z.enum(["markdown", "text", "csv", "pdf", "png", "jpeg", "webp"]).nullable(), query: z.string().max(180).nullable(), cursor: z.string().max(2000).nullable(), limit: z.number().int().min(1).max(30) }),
      execute: input => succeeded(api.listDocuments(input)) }),
    readDocument: actionTool(run, "read", { description: "Read complete exact text, including accepted drafts. contentRevision null means current in chosen view. Historical revision requires saved view and cannot authorize current edits. Unselected PDF/images require selection in chat.",
      inputSchema: z.object({ id, view, contentRevision: z.number().int().positive().nullable() }),
      execute: async input => {
      const result = await api.readDocument(input) as { available?: boolean };
      return result.available === false ? blocked(result, "NEEDS_SELECTION", "Select the original file in chat to provide its contents.", "correct_input") : succeeded(result);
    } }),
    createPlan: actionTool(run, "stage", { description: "Initialize an absent Plan with startDate as YYYY-MM-DD (or null) and three stable day IDs/titles. userProvided true means the current user specified that date; otherwise it is a visible assumption. Then editPlan adds stays and activities. Initialization is not a finished itinerary or a save.",
      inputSchema: createPlanInput,
      execute: async input => {
        const plan = initializePlan({ ...input.plan, startDate: input.plan.startDate ? { value: input.plan.startDate, basis: input.userProvided ? userBasis(environment) : proposed("Provisional trip date.") } : null });
        return stageFeedback(await api.createPlan(token(), plan, []), "Empty itinerary initialized. Use editPlan addStay and addActivity commands. Nothing is saved yet.");
      } }),
    editPlan: actionTool(run, "stage", { description: "Create or modify up to twelve arrangements atomically using semantic commands. addActivity needs id/dayId/title/kind, startTime and durationMinutes or catalog duration; use placeId for supplied sights, venue {name,address,city,sourceId} for researched meals, or locationItemId to reuse a location. addTravel is for substantial journeys; from/to are location objects such as {locationItemId:'existing-id'}, with mode/startTime/durationMinutes. Use time gaps for short walks. Use area with free_time/rest/logistics for proposed neighborhoods. userLocation must quote an actual user location; userLocationMessageId selects an earlier user message, otherwise the current message is checked. Never attribute an agent-selected route to the user. addStay uses hotel {name,address,city,sourceId} or provisional area and afterDayIds. updateActivity/updateStay change only named fields and preserve all other facts. updateActivity may correct an uncommitted activity kind; replaceActivity supplies a complete corrected activity for that ID. afterItemId omitted places a timed addition chronologically, null prepends. Use setCommitment only for explicit user bookings/kept arrangements/fixed times. includedInStayId is only for user-confirmed hotel meals. Sources use returned sourceIds. The host constructs internal timing/evidence/coverage.",
      inputSchema: editPlanInput,
      execute: async input => {
        try {
          const plan = (api.readPlan({ view: "effective", selector: "full", ids: [] }) as { plan?: Plan }).plan;
          if (!plan) throw Object.assign(new Error("Initialize the itinerary first."), { status: 400, code: "PLAN_EMPTY" });
          const compiled = await authorPlan(plan, input.operations, environment);
          const result = await api.editPlan(token(), compiled.operations, compiled.authorizedItemIds, true) as { valid?: boolean; staged?: boolean };
          if (result.valid !== false || result.staged) api.resolveInput?.("editPlan", input);
          else api.rejectInput("editPlan", input);
          return stageFeedback(result);
        } catch (error) { api.rejectInput("editPlan", input); throw error; }
      } }),
    createBudget: actionTool(run, "stage", { description: "Initialize absent Budget settings only. Then editBudget adds researched cost ranges in small batches. Initialization is not a completed budget or a save.",
      inputSchema: createBudgetInput,
      execute: async input => stageFeedback(await api.createBudget(token(), initializeBudget(input.budget), false),
        "Empty budget initialized and unreviewed. Add researched costs with editBudget, then review the full estimate. Nothing is saved yet.") }),
    editBudget: actionTool(run, "stage", { description: "Add or modify up to twelve costs/settings commands atomically. addCost: id,label,category,planItemIds,unit,quantity,min,max,priceScope (per_person or whole_party),assumptions,sources [{sourceId,detail}]. coveredTravelers is required for shared-price conversion when group size is otherwise unknown. min/max are per charging unit; quantity counts occurrences, not party size. One admission or pass per adult uses quantity 1 with per_person, regardless of group size. Whole-party hotel total for two people/two nights: unit stay, quantity 1, coveredTravelers 2; host divides once for a per-person Budget. updateCost changes only named fields. Existing sources are reusable through their handles. Use review after the last change. Routine expenses require realistic researched estimates; exceptional unknown costs remain explicit. User-confirmed prices can cite the updated Travel brief's document sourceId.",
      inputSchema: editBudgetInput,
      execute: async input => {
        try {
          const budget = (api.readBudget({ view: "effective", selector: "full", ids: [] }) as { budget?: Budget }).budget;
          if (!budget) throw Object.assign(new Error("Initialize the budget first."), { status: 400, code: "BUDGET_EMPTY" });
          const result = await api.editBudget(token(), authorBudget(budget, input.operations, environment));
          api.resolveInput?.("editBudget", input);
          return stageFeedback(result);
        } catch (error) { api.rejectInput("editBudget", input); if (error instanceof Error && !("status" in error)) throw Object.assign(error, { status: 400, code: "AUTHORING_INVALID" }); throw error; }
      } }),
    createDocument: actionTool(run, "stage", { description: "Create a Library Markdown, TXT or CSV file with a host-allocated ID. content is exact text. No upload-origin creation. planning_context is singleton Markdown; initial planning should call saveBrief directly for its early checkpoint. This tool only stages.",
      inputSchema: mutationInput(z.object({ name: z.string().min(1).max(180), kind: z.enum(["research", "working", "planning_context"]), content: z.string().max(MAX_TEXT_BYTES) })),
      execute: async input => stageFeedback(await api.createDocument(token(), input.name, input.kind, input.content)) }),
    editDocument: actionTool(run, "stage", { description: "Atomically rename, replaceContent or replaceText in an effective text document. Exact replaceText must match once. Preserve unrelated bytes, format and kind. Read before editing unless current content was supplied. Edits are staged until commit.",
      inputSchema: mutationInput(z.object({ id, operations: z.array(documentOperationSchema).min(1).max(100) })),
      execute: async input => stageFeedback(await api.editDocument(token(), input.id, input.operations)) }),
    saveBrief: actionTool(run, "checkpoint", { description: "Save the initial Travel brief before staging other work. Host chooses singleton identity. expectedRevision is saved metadata revision or 0. If drafts already exist this stages the correction for final commit. Inspect saved/effect. Continue planning after this checkpoint.",
      inputSchema: mutationInput(z.object({ markdown: z.string().min(1).max(24576), expectedRevision: z.number().int().nonnegative() })),
      execute: async input => {
      const result = await api.saveBrief(token(), input.markdown, input.expectedRevision) as { saved?: boolean; staged?: boolean; document?: { contentRevision?: number } };
      if (result.saved === false && result.staged) return succeeded(result, "staged", "Travel brief update prepared for final save.");
      if (!result.saved || !result.document?.contentRevision) throw new Error("Brief save is not confirmed.");
      return succeeded(result, "persisted", "Travel brief saved. Continue to the complete itinerary and final save.");
    } }),
    resolveBudgetGaps: actionTool(run, "stage", { description: "Explain exceptional remaining unpriced costs only after bounded direct and comparable research. Retains unknown amounts and marks the budget incomplete. Follow budget-gaps guidance. This does not substitute for routine researched estimates.",
      inputSchema: mutationInput(z.object({ gaps: z.array(budgetGapSchema).min(1).max(100) })),
      execute: async input => stageFeedback(await api.resolveBudgetGaps(token(), input.gaps)) }),
    inspectChanges: actionTool(run, "read", { description: "Inspect effective changes, affected IDs, validation blockers, quality findings and authoritative final-save receipt. Readiness findings are advisory and respect explicit user exceptions. Also verifies ambiguous/lost saves without writing. Saved brief progress is not a completed Plan. A missing receipt alone does not prove an in-flight write failed.",
      inputSchema: z.object({}),
      execute: async () => { await run.verify(); return succeeded(await api.inspectChanges()); } }),
    reloadWorkspace: actionTool(run, "reset", { description: "Explicitly discard all unsaved drafts and load latest saved state after a conflict. Does not undo a saved brief or fulfill pending edits. Reading environment never performs this reset. Reconcile and restage before commit.",
      inputSchema: mutationInput(z.object({})),
      execute: async () => succeeded(await api.reload(token()), "none", "Latest saved trip loaded. Reconcile the requested changes before saving.") }),
    commit: actionTool(run, "commit", { description: "Atomically save the whole accepted overlay once per turn, after correcting blockers. Host includes current input; handledInputIds may add only fully handled pending inputs. A verified final receipt closes this turn's writes. On uncertain response inspectChanges before retrying the same logical save.",
      inputSchema: mutationInput(z.object({ summary: z.string().min(1).max(2000), handledInputIds: z.array(id).max(40) })),
      execute: async input => commitFeedback(await api.commit(token(), input.summary, [...new Set([...(environment.source.type === "message" ? [environment.source.messageId] : []), ...input.handledInputIds])])) }),
  };
}

// Deliver guidance with findings.
async function stageFeedback(value: unknown, successMessage?: string) {
  const data = value as { valid?: boolean; staged?: boolean; budgetCheck?: { readyToCommit: boolean } };
  if (data.budgetCheck?.readyToCommit === false)
    return { ...blocked({ ...data, guidance: readGuide("budget-gaps") }, "BUDGET_GAPS", "Research or explicitly resolve the listed missing prices before committing.", "research"), effect: "staged" as const };
  if (data.valid === false && data.staged) return { ...blocked(data, "PLAN_NEEDS_REVIEW", "These arrangements are accepted in the working draft. Fix the listed time conflicts by updating their existing IDs before final save. Do not add duplicates.", "correct_input"), effect: "staged" as const };
  if (data.valid === false) return blocked(data, "PLAN_INVALID", "Batch rejected: none of its commands were applied. The previous accepted content is unchanged. Correct and resubmit rejected creations; do not update IDs that were never accepted.", "correct_input");
  if (!data.staged && data.valid !== true) throw new Error("Invalid stage result.");
  return succeeded(data, "staged", successMessage ?? (data.budgetCheck?.readyToCommit
    ? "Budget checks passed. Preserve the researched amounts and evidence unless new facts or scope changes require correction. Complete the final review and commit. Nothing is saved yet."
    : "Changes staged. They are not saved yet."));
}
async function commitFeedback(value: unknown) {
  const data = value as { saved?: boolean; receipt?: { revision?: number; operation_id?: string }; budgetCheck?: { readyToCommit: boolean } };
  if (data.saved === false) return stageFeedback(data);
  if (data.saved !== true || !Number.isSafeInteger(data.receipt?.revision) || !data.receipt?.operation_id)
    throw new Error("Save response has no valid receipt.");
  return succeeded(data, "persisted", "Changes saved. Receipt confirmed.");
}
