import { randomUUID } from "node:crypto";
import { applyPlanOperations, sourcesIn, type Plan } from "@/lib/plan";
import { applyBudgetOperations, type Budget } from "@/lib/budget";
import { applyDocumentOperations, readTextDocument } from "@/services/documents";
import { createdTextFormat, fileFormat, fileRenameError } from "@/lib/file-types";
import type { DocumentEdit, TextDocument } from "@/lib/documents/text";
import type { DocumentSummary } from "@/lib/documents/types";
import type { AgentEnvironment, ArtifactEnvironment, ArtifactView } from "@/services/assistant/agent/contracts";
import type { WorkspaceSnapshot } from "./session";
import { workspaceRpc, WorkspaceError } from "./database";
import { DraftState } from "./draft";
import { visibleSources } from "./evidence";
import { planView, budgetView } from "./views";
import { reviewPlanning } from "@/lib/planning-review";
export type ArtifactState = {
  snapshot(): WorkspaceSnapshot;
  receipt(): { summary: string; revision: number; operation_id: string } | null;
  plan(): Plan | null;
  budget(): Budget | null;
  edits: Map<string, DocumentEdit>;
  contextId(): string;
  context(): TextDocument | null;
  review(): boolean;
  findings?(): import("@/lib/plan").PlanFinding[];
};
export function workspaceArtifacts(reference: string, environment: AgentEnvironment, state: ArtifactState): ArtifactEnvironment {
  const draft = new DraftState();
  const knownPlan = new Set(Object.keys(state.snapshot().plan?.items ?? {}));
  const knownCosts = new Set(state.snapshot().budget?.entries.map(entry => entry.id) ?? []);
  let headRevision = state.snapshot().revision;
  const selectedDocuments = new Set<string>();
  const availability = (doc: { id: string; mediaType: string }) => fileFormat(doc.mediaType)?.editor === "text" ? "readable" : selectedDocuments.has(doc.id) ? "provided_in_current_request" : "select_original_in_chat";
  const cache = new Map<string, Promise<TextDocument>>();
  const metadata = (id: string) => state.snapshot().documents.find(doc => doc.id === id);
  const effectivePlan = () => state.plan() ?? state.snapshot().plan;
  const effectiveBudget = () => state.budget() ?? state.snapshot().budget ?? null;
  const stamp = (view: ArtifactView = "effective") => ({ view, baseRevision: state.snapshot().revision, currentHeadRevision: headRevision, changedSinceBase: headRevision !== state.snapshot().revision, editToken: draft.token });
  const documents = (view: ArtifactView): (DocumentSummary & { draft?: boolean; proposedContentRevision?: number })[] => {
    const saved = state.snapshot().documents;
    if (view === "saved") return saved;
    const result = new Map(saved.map(doc => [doc.id, doc]));
    for (const edit of state.edits.values()) {
      const old = result.get(edit.id), format = old ? fileFormat(old.mediaType) : createdTextFormat(edit.name, edit.kind);
      result.set(edit.id, { ...old, id: edit.id, name: edit.name, kind: edit.kind, originalName: old?.originalName ?? edit.name, mediaType: format!.mime, size: Buffer.byteLength(edit.markdown), status: "ready", createdAt: old?.createdAt ?? "", updatedAt: old?.updatedAt ?? "", revision: old?.revision ?? 0, contentRevision: old?.contentRevision ?? 0, usages: old?.usages ?? [], draft: true, proposedContentRevision: (old?.contentRevision ?? 0) + 1 } as DocumentSummary);
    }
    return [...result.values()];
  };
  const links = () => effectiveBudget()?.entries.flatMap(entry => entry.planItemIds.filter(id => !effectivePlan()?.items[id]).map(id => ({ code: "BUDGET_LINK", entryId: entry.id, itemId: id }))) ?? [];
  const manifest = () => {
    const docs = documents("effective"), brief = docs.find(doc => doc.id === state.contextId());
    const review = reviewPlanning(effectivePlan(), effectiveBudget(), !!environment.initialGeneration, draft.token, state.findings?.(), state.review(), !!state.plan() && !!state.budget());
    return {
      ...stamp(), currentInput: environment.source, pendingInputs: state.snapshot().pendingInputs,
      brief: brief ? { id: brief.id, name: brief.name, revision: brief.revision, contentRevision: brief.contentRevision, proposedContentRevision: brief.proposedContentRevision, draft: brief.draft ?? false, ...environment.documentEvidence?.(brief.id, brief.proposedContentRevision ?? brief.contentRevision!, brief.name) } : null,
      plan: planView(effectivePlan(), { view: "effective", selector: "summary", ids: [] }),
      budget: { ...budgetView(effectiveBudget(), { view: "effective", selector: "summary", ids: [] }), needsReview: state.review() },
      documents: docs.map(({ id, name, kind, mediaType, size, revision, contentRevision, draft, proposedContentRevision }) => ({ id, name, kind, mediaType, size, revision, contentRevision, draft, proposedContentRevision, availability: availability({ id, mediaType }) })),
      hasWorkingChanges: !!state.plan() || !!state.budget() || state.edits.size > 0,
      pendingCorrections: draft.pendingCorrections(),
      rejectedEdits: [...draft.failures].map(([artifact, message]) => ({ artifact, message })),
      requiredBeforeSave: review.blockers,
      review,
      lastVerifiedFinalSave: state.receipt(),
      ...visibleSources(environment.evidenceSources?.() ?? [], effectivePlan(), effectiveBudget()),
    };
  };
  const readDocument: ArtifactEnvironment["readDocument"] = async ({ id, view, contentRevision }) => {
    if (contentRevision !== null && view !== "saved") throw new WorkspaceError("Historical content requires saved view.", 400);
    const base = metadata(id), edit = view === "effective" && contentRevision === null ? state.edits.get(id) : undefined;
    if (edit) return { ...stamp(view), exists: true, id, name: edit.name, kind: edit.kind, content: edit.markdown, revision: base?.revision ?? 0, contentRevision: base?.contentRevision ?? 0, proposedContentRevision: (base?.contentRevision ?? 0) + 1, draft: true, ...environment.documentEvidence?.(id, (base?.contentRevision ?? 0) + 1, edit.name) };
    if (!base) return { ...stamp(view), exists: false, id };
    if (fileFormat(base.mediaType)?.editor !== "text" && selectedDocuments.has(id)) return { ...stamp(view), exists: true, id, name: base.name, available: true, providedInCurrentRequest: true, instruction: "The original file was successfully supplied in this request. Use that attached content; no extracted text is returned here." };
    if (fileFormat(base.mediaType)?.editor !== "text") return { ...stamp(view), exists: true, id, name: base.name, available: false, code: "NEEDS_SELECTION", instruction: "Select the original file in chat to provide its contents." };
    const revision = contentRevision ?? base.contentRevision!;
    const key = `${id}:${revision}`;
    let reading = cache.get(key);
    if (!reading) { reading = readTextDocument(reference, id, revision); cache.set(key, reading); reading.catch(() => cache.delete(key)); }
    const text = await reading;
    return { ...stamp(view), exists: true, ...text, name: base.name, revision: base.revision, content: text.markdown, markdown: undefined, ...environment.documentEvidence?.(id, revision, base.name), ...(contentRevision !== null ? { editToken: undefined, historical: true } : {}) };
  };
  const invalidateEvidence = (id: string) => {
    const revision = (metadata(id)?.contentRevision ?? 0) + 1;
    if (state.plan() && sourcesIn(state.plan()!).some(source => source.type === "document" && source.documentId === id && source.revision === revision)) draft.reject("plan", "A cited draft document changed. Revalidate the Plan against its current text.");
    if (state.budget()?.entries.some(entry => entry.sources.some(source => source.documentId === id && source.documentRevision === revision))) draft.reject("budget", "A cited draft document changed. Revalidate the Budget against its current text.");
  };
  const stageText = async (edit: DocumentEdit) => {
    const result = await environment.stageDocument(edit) as { staged: boolean; id: string; contentRevision: number };
    return { ...result, draft: true, contentRevision: metadata(edit.id)?.contentRevision ?? 0, proposedContentRevision: result.contentRevision, ...environment.documentEvidence?.(edit.id, result.contentRevision, edit.name) };
  };
  const mutation = <T>(token: string, key: string, work: () => Promise<T>, persistent = false) => draft.mutate(token, key, work, persistent);
  return {
    snapshotWork: () => ({ draft: draft.snapshot(), knownPlan: [...knownPlan], knownCosts: [...knownCosts] }),
    restoreWork(value) { draft.restore(value.draft); knownPlan.clear(); value.knownPlan.forEach(id => knownPlan.add(id)); knownCosts.clear(); value.knownCosts.forEach(id => knownCosts.add(id)); },
    wasKnown: (artifact, id) => (artifact === "plan" ? knownPlan : knownCosts).has(id),
    provideSelectedDocuments(ids) { selectedDocuments.clear(); ids.forEach(id => selectedDocuments.add(id)); },
    manifest,
    async readEnvironment() {
      const latest = await workspaceRpc<WorkspaceSnapshot>("planning_snapshot", { p_trip: reference });
      headRevision = latest.revision;
      return { ...manifest(), conflictDetected: latest.revision !== state.snapshot().revision };
    },
    readPlan(input) { return { ...stamp(input.view), ...planView(input.view === "saved" ? state.snapshot().plan : effectivePlan(), input) }; },
    readBudget(input) { return { ...stamp(input.view), ...budgetView(input.view === "saved" ? state.snapshot().budget ?? null : effectiveBudget(), input), needsReview: input.view === "saved" ? state.snapshot().budgetNeedsReview : state.review(), linkFindings: input.view === "effective" ? links() : [] }; },
    listDocuments(input) {
      const token = `${input.view}:${state.snapshot().revision}:${draft.token}:${JSON.stringify([input.kind, input.format, input.query])}`;
      let offset = 0;
      if (input.cursor) {
        const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString()) as { token: string; offset: number };
        if (decoded.token !== token || !Number.isSafeInteger(decoded.offset) || decoded.offset < 0) throw new WorkspaceError("The document list changed. Restart from the first page.", 409);
        offset = decoded.offset;
      }
      const all = documents(input.view).filter(doc => (!input.kind || doc.kind === input.kind) && (!input.format || fileFormat(doc.mediaType)?.id === input.format) && (!input.query || doc.name.toLowerCase().includes(input.query.toLowerCase())));
      const page = all.slice(offset, offset + input.limit).map(doc => ({ ...doc, editable: fileFormat(doc.mediaType)?.editor === "text", availability: availability(doc) }));
      return { ...stamp(input.view), documents: page, total: all.length, nextCursor: offset + page.length < all.length ? Buffer.from(JSON.stringify({ token, offset: offset + page.length })).toString("base64url") : null };
    },
    readDocument,
    createPlan: (token, plan, authorized) => mutation(token, "plan", async () => {
      if (effectivePlan()) throw new WorkspaceError("A Plan already exists. Use editPlan.", 400, "ALREADY_EXISTS");
      const result = await environment.propose(plan, authorized);
      if (result.valid || result.staged) Object.keys(plan.items).forEach(id => knownPlan.add(id));
      return result;
    }),
    editPlan: (token, operations, authorized, allowScheduleConflicts = false) => mutation(token, "plan", async () => {
      if (!effectivePlan()) throw new WorkspaceError("Create a Plan first.", 400);
      if (!operations.length) return { valid: true, staged: true, unchanged: true, applied: { itemIds: [], dayIds: [] } };
      const before = effectivePlan()!, candidate = applyPlanOperations(before, operations);
      const result = await environment.propose(candidate, authorized, allowScheduleConflicts);
      const accepted = result.valid || result.staged;
      if (accepted) [...Object.keys(before.items), ...Object.keys(candidate.items)].forEach(id => knownPlan.add(id));
      return { ...result, applied: accepted ? { itemIds: [...new Set([...Object.keys(before.items), ...Object.keys(candidate.items)])].filter(id => JSON.stringify(before.items[id]) !== JSON.stringify(candidate.items[id])), dayIds: candidate.days.filter((day, index) => JSON.stringify(day) !== JSON.stringify(before.days[index])).map(day => day.id) } : null, previousAcceptedContentRetained: !accepted };
    }),
    createBudget: (token, budget, reviewed) => mutation(token, "budget", async () => {
      if (effectiveBudget()) throw new WorkspaceError("A Budget already exists. Use editBudget.", 400, "ALREADY_EXISTS");
      const result = await environment.proposeBudget!(budget, reviewed);
      budget.entries.forEach(entry => knownCosts.add(entry.id));
      return result;
    }),
    editBudget: (token, operations) => mutation(token, "budget", async () => {
      if (!effectiveBudget()) throw new WorkspaceError("Create a Budget first.", 400);
      if (!operations.length) return { valid: true, staged: true, unchanged: true, applied: { entryIds: [] } };
      const result = applyBudgetOperations(effectiveBudget()!, operations);
      const before = effectiveBudget()!;
      const accepted = await environment.proposeBudget!(result.budget, result.reviewed);
      [...before.entries, ...result.budget.entries].forEach(entry => knownCosts.add(entry.id));
      return { ...accepted as object, applied: { entryIds: [...new Set([...before.entries, ...result.budget.entries].map(entry => entry.id))].filter(id => JSON.stringify(before.entries.find(entry => entry.id === id)) !== JSON.stringify(result.budget.entries.find(entry => entry.id === id))) } };
    }),
    createDocument: (token, name, kind, content) => mutation(token, "documents", async () => {
      const id = kind === "planning_context" ? state.contextId() : randomUUID();
      if (metadata(id) || state.edits.has(id)) throw new WorkspaceError(`This Travel brief already exists. Edit document ${id}.`, 400, "ALREADY_EXISTS");
      return stageText({ id, name, kind, markdown: content, expectedRevision: 0 });
    }),
    editDocument: (token, id, operations) => mutation(token, metadata(id) || state.edits.has(id) ? `documents:${id}` : "documents", async () => {
      const before = await readDocument({ id, view: "effective", contentRevision: null }) as { exists: boolean; content?: string; name?: string; kind?: DocumentEdit["kind"]; revision?: number };
      if (!before.exists || before.content === undefined) throw new WorkspaceError("Read an available text document before editing it.", 400);
      const edit = applyDocumentOperations({ id, name: before.name!, kind: before.kind!, expectedRevision: before.revision!, markdown: before.content }, operations);
      const originalFormat = metadata(id) ? fileFormat(metadata(id)!.mediaType) : createdTextFormat(before.name!, before.kind!);
      const renameError = originalFormat ? fileRenameError(edit.name, originalFormat.mime) : "Unknown text format.";
      if (renameError) throw new WorkspaceError(renameError, 400);
      const result = await stageText(edit);
      if (edit.markdown !== before.content) invalidateEvidence(id);
      return result;
    }),
    saveBrief: (token, content, expected) => mutation(token, `documents:${state.contextId()}`, async () => {
      const result = await environment.saveBrief(content, expected) as { staged?: boolean; contentRevision?: number };
      headRevision = state.snapshot().revision;
      invalidateEvidence(state.contextId());
      return result.staged ? { ...result, draft: true, proposedContentRevision: result.contentRevision, contentRevision: metadata(state.contextId())?.contentRevision ?? 0 } : result;
    }, true),
    resolveBudgetGaps: (token, gaps) => mutation(token, "budget", () => environment.resolveBudgetGaps!(gaps)),
    async inspectChanges() {
      const verified = await environment.verifyCommit();
      headRevision = verified.snapshot && typeof verified.snapshot === "object" && "revision" in verified.snapshot ? Number(verified.snapshot.revision) : headRevision;
      const before = state.snapshot(), plan = effectivePlan(), budget = effectiveBudget();
      const review = reviewPlanning(plan, budget, !!environment.initialGeneration, draft.token, state.findings?.(), state.review(), !!state.plan() && !!state.budget());
      return {
        ...manifest(), saved: verified.saved, receipt: verified.receipt,
        changed: { plan: !!state.plan(), budget: !!state.budget(), documents: [...state.edits.keys()] },
        diff: {
          boundedSummary: true,
          plan: changedIds(before.plan?.items ?? {}, plan?.items ?? {}),
          days: changedIds(Object.fromEntries((before.plan?.days ?? []).map(day => [day.id, day])), Object.fromEntries((plan?.days ?? []).map(day => [day.id, day]))),
          notes: changedIds(Object.fromEntries((before.plan?.notes ?? []).map(note => [note.id, note])), Object.fromEntries((plan?.notes ?? []).map(note => [note.id, note]))),
          startDate: { before: before.plan?.startDate ?? null, after: plan?.startDate ?? null },
          budget: changedIds(Object.fromEntries((before.budget?.entries ?? []).map(entry => [entry.id, entry])), Object.fromEntries((budget?.entries ?? []).map(entry => [entry.id, entry]))),
          budgetFields: { before: summarize(before.budget), after: summarize(budget) },
          documents: [...state.edits.values()].map(edit => ({ id: edit.id, before: metadata(edit.id) ? { name: metadata(edit.id)!.name, contentRevision: metadata(edit.id)!.contentRevision } : null, after: { name: edit.name, proposedContentRevision: (metadata(edit.id)?.contentRevision ?? 0) + 1, bytes: Buffer.byteLength(edit.markdown) } })),
        },
        blockers: [...draft.failures].map(([artifact, message]) => ({ artifact, message })).concat(review.blockers),
        readiness: { ready: review.qualityComplete, findings: [...review.blockers, ...review.findings].map(issue => issue.message), advisory: true },
      };
    },
    reload: token => mutation(token, "reload", async () => {
      const pendingDocuments = [...state.edits.keys()];
      const result = await environment.reload();
      for (const id of pendingDocuments) {
        draft.failures.delete(`documents:${id}`);
        draft.reject("documents", "Reconcile and restage the discarded document changes before saving.");
      }
      cache.clear(); headRevision = state.snapshot().revision;
      return { workspace: result };
    }),
    async commit(token, summary, handled) {
      // Verify before stale-token checks.
      const verified = await environment.verifyCommit();
      if (verified.saved) return { ...verified, editToken: draft.token };
      draft.assert(token); draft.assertReady();
      if (links().length && state.budget()) throw new WorkspaceError("Repair linked Budget costs before saving.", 400, "BUDGET_LINK");
      return mutation(token, "commit", () => environment.commit(summary, handled), true);
    },
    rejectInput(tool, input) {
      if (draft.input(tool, input)) return;
      const object = input && typeof input === "object" ? input as { id?: string } : {};
      const key = /Plan$|^addDayActivities$|^addStay$/.test(tool) ? "plan" : /Budget$|BudgetGaps$|^addBudgetCosts$/.test(tool) ? "budget" : tool === "saveBrief" ? `documents:${state.contextId()}` : /Document$/.test(tool) ? object.id && (metadata(object.id) || state.edits.has(object.id)) ? `documents:${object.id}` : "documents" : null;
      if (key) draft.reject(key, "Correct the malformed tool input before saving.");
    },
    resolveInput(tool, input) { draft.input(tool, input, true); },
  };
}
function changedIds(before: Record<string, unknown>, after: Record<string, unknown>) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(id => JSON.stringify(before[id]) !== JSON.stringify(after[id])).map(id => ({ id, change: !(id in before) ? "added" : !(id in after) ? "removed" : "updated", before: summarize(before[id]), after: summarize(after[id]) }));
}

function summarize(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(["id", "title", "label", "kind", "category", "quantity", "unitMin", "unitMax", "pricing", "scope", "travelers", "limit", "itemIds", "relatedItemIds"].filter(key => key in object).map(key => [key, object[key]]));
}
