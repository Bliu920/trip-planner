import "server-only";
import { checkJourneys, inspectGeoSources, journeySummary } from "@/services/places/feasibility";
import { geoConfigured, resolvePlace, readVenuePosition } from "@/services/places/geo";
import type { JourneyReport } from "@/lib/journeys";
import { budgetSchema, inspectBudget, type Budget } from "@/lib/budget";
import { BudgetReview } from "@/services/budgets";
import { randomUUID } from "node:crypto";
import {
  inspectPlan,
  sourcesIn,
  type Plan,
  type PlanSnapshot,
  type SourceRef,
} from "@/lib/plan";
import {
  type DocumentEdit,
  type TextDocument,
} from "@/lib/documents/text";
import type { DocumentSummary } from "@/lib/documents/types";
import { places, inspectVenueSources } from "@/services/plans";
import { loadCatalog, readPlaces } from "@/services/places/catalog";
import { describeCatalog, queryCatalog } from "@/lib/catalog";
import { validateDocumentEdit, prepareDocument, readTextDocument } from "@/services/documents";
import type { AgentEnvironment } from "@/services/assistant/agent/contracts";
import { workspaceRpc, WorkspaceError } from "./database";
import { briefWriter } from "./brief";
import { workspaceArtifacts } from "./artifacts";
import { actionStateSchema } from "@/lib/actions";
import { EvidenceIndex } from "./evidence";
import { openDraft, type WorkingPayload } from "./drafts";
import { journeyContext } from "./views";
import { reviewPlanning, groupFindings } from "@/lib/planning-review";
export type WorkspaceSnapshot = PlanSnapshot & {
  tripReference: string;
  legacyNotes: string;
  initialized: boolean;
  budget?: Budget | null;
  budgetNeedsReview?: boolean;
  documents: DocumentSummary[];
  contextDocumentId: string | null;
  pendingInputs: { id: string; conversationId: string; parts: unknown[] }[];
};
type Receipt = { summary: string; revision: number; operation_id: string };
export async function openSession(
  reference: string,
  conversation: string,
  reply: string,
  generation: string,
  signal: AbortSignal,
): Promise<AgentEnvironment> {
  const start = await workspaceRpc<{
    snapshot: WorkspaceSnapshot;
    inputId: string;
    receipt: Receipt | null;
  }>("planning_begin", {
    p_trip: reference,
    p_conversation: conversation,
    p_reply: reply,
    p_generation: generation,
  });
  let snapshot = start.snapshot;
  let durable: Awaited<ReturnType<typeof openDraft>> = null;
  const priorAction = await workspaceRpc<{ action: unknown }>("planning_run_result", { p_trip: reference, p_operation: reply });
  let receipt = start.receipt;
  let context: TextDocument | null = snapshot.contextDocumentId
    ? await readTextDocument(reference, snapshot.contextDocumentId)
    : null;
  let proposed: Plan | null = null;
  let planFindings: import("@/lib/plan").PlanFinding[] = [];
  let journeys: JourneyReport | null = null;
  let planRequired = false;
  let budgetRequired = false;
  const documentRequirements = new Set<string>();
  const rejected = new Set<string>();
  let authorized: string[] = [];
  let proposedBudget: Budget | null = null;
  let budgetReviewed = false;
  let reviewedPlan = "";
  const budgetReview = new BudgetReview(process.env.AGENT_WEB_SEARCH !== "false");
  const budgetCheck = () => budgetReview.inspect(
    proposedBudget!, JSON.stringify(proposed ?? snapshot.plan), snapshot.budget ?? null,
    !budgetReviewed && JSON.stringify(proposed ?? snapshot.plan) === JSON.stringify(snapshot.plan),
  );
  const briefCheckpoints = new Map<string, number>();
  const initialGeneration = !snapshot.plan || Object.keys(snapshot.plan.items).length === 0;
  const retrievedUrls = new Set<string>();
  const evidenceIndex = new EvidenceIndex();
  evidenceIndex.saved(snapshot.plan, snapshot.budget ?? null);
  let catalog: ReturnType<typeof loadCatalog> | null = null;
  const readCatalog = () => catalog ??= loadCatalog().catch(error => { catalog = null; throw error; });
  const validateBudget = (budget: Budget, checkLinks = false) => {
    const checked = checkLinks ? inspectBudget(budget, proposed ?? snapshot.plan) : budgetSchema.parse(budget);
    for (const entry of checked.entries) for (const evidence of entry.sources)
      if (Date.parse(evidence.checkedAt) > Date.now() + 300000) throw new WorkspaceError("Source checks cannot be dated in the future.", 400);
    const existing = snapshot.budget?.entries.flatMap(entry => entry.sources) ?? [];
    for (const entry of checked.entries) {
      const previous = snapshot.budget?.entries.find(old => old.id === entry.id);
      const changedConfirmation = entry.pricing === "confirmed" && (!previous || previous.pricing !== "confirmed" || previous.unitMin !== entry.unitMin || previous.unitMax !== entry.unitMax || previous.quantity !== entry.quantity);
      if (changedConfirmation && entry.sources.some(source => source.documentId) && !entry.sources.some(source => source.url)) {
        const currentFact = entry.sources.some(source => source.documentId === contextId && source.documentRevision === (edits.has(contextId) ? (context?.contentRevision ?? 0) + 1 : briefCheckpoints.get(contextId)));
        if (!currentFact) throw new WorkspaceError("Update the Travel brief with this user-confirmed price first, then cite its returned current document source. An unchanged older version cannot support a newly confirmed amount.", 400, "PRICE_FACT_SOURCE");
      }
    }
    for (const entry of checked.entries) for (const evidence of entry.sources) {
      const reused = existing.some(old => old.url === evidence.url && old.documentId === evidence.documentId && old.documentRevision === evidence.documentRevision && old.checkedAt === evidence.checkedAt && old.title === evidence.title && old.detail === evidence.detail);
      if (evidence.url && !retrievedUrls.has(evidence.url) && !reused)
        throw new WorkspaceError("Research this source with web_search before citing it. Reused evidence must retain its original details and timestamp.", 400);
    }
    return checked;
  };
  const edits = new Map<string, DocumentEdit>();
  const source: SourceRef = {
    type: "message",
    conversationId: conversation,
    messageId: start.inputId,
  };
  let contextId = snapshot.contextDocumentId ?? randomUUID();
  const saveBrief = briefWriter(reference, reply, generation, signal);
  const view = () => ({
    ...snapshot,
    supportingContext: context,
    currentInput: source,
    newContextDocumentId: contextId,
    priorReceipt: receipt,
    priorAction: priorAction.action,
  });
  const acceptSaved = (next: WorkspaceSnapshot) => {
    const edit = next.contextDocumentId ? edits.get(next.contextDocumentId) : undefined;
    const meta = next.documents.find(document => document.id === next.contextDocumentId);
    if (edit && meta) context = { id: edit.id, name: edit.name, kind: edit.kind, revision: meta.revision, contentRevision: meta.contentRevision!, markdown: edit.markdown, mediaType: meta.mediaType };
    snapshot = next;
    proposed = null; planFindings = []; proposedBudget = null; edits.clear();
  };
  const active = () => {
    signal.throwIfAborted();
    durable?.assertWritable();
    if (receipt)
      throw new WorkspaceError(
        "This turn already saved its changes. Read the receipt; do not apply them again.",
        409,
      );
  };
  const stageDocument = async (edit: DocumentEdit) => {
    active();
    documentRequirements.add(edit.id);
    rejected.add(`document:${edit.id}`);
    const existing = snapshot.documents.find((d) => d.id === edit.id);
    if (edit.kind === "planning_context" && edit.id !== contextId)
      throw new WorkspaceError("Use the workspace context document ID.", 400);
    if ((existing?.revision ?? 0) !== edit.expectedRevision)
      throw new WorkspaceError(
        "Read the current document revision before editing it.",
        409,
      );
    if (!edits.has(edit.id) && edits.size >= 8)
      throw new WorkspaceError(
        "Save no more than eight documents in one turn.",
        400,
      );
    validateDocumentEdit(edit, existing);
    edits.set(edit.id, edit);
    rejected.delete(`document:${edit.id}`);
    return {
      staged: true,
      id: edit.id,
      contentRevision: (existing?.contentRevision ?? 0) + 1,
    };
  };
  const environment: AgentEnvironment = {
    operationId: reply,
    async recordAction(state) {
      const recorded = await workspaceRpc<boolean>("planning_record_action", {
        p_trip: reference, p_operation: reply, p_generation: generation, p_state: actionStateSchema.parse(state),
      });
      if (!recorded) throw new WorkspaceError("This run was interrupted. Reload its saved status.", 409, "PLAN_ATTEMPT");
    },
    async verifyCommit() {
      const result = await workspaceRpc<{ saved: boolean; receipt: Receipt | null; snapshot: WorkspaceSnapshot }>("planning_run_result", { p_trip: reference, p_operation: reply });
      if (result.saved && result.receipt) { receipt = result.receipt; acceptSaved(result.snapshot); }
      return result;
    },
    get context() {
      const currentBrief = edits.get(contextId);
      const artifactState = environment.artifacts?.manifest() as { documents?: unknown } | undefined;
      return { ...view(), view: "effective", plan: undefined, budget: undefined,
        supportingContext: currentBrief ? { ...context, ...currentBrief, draft: true, proposedContentRevision: (context?.contentRevision ?? 0) + 1 } : context,
        documents: artifactState?.documents ?? snapshot.documents,
        journeys: journeys ? journeyContext(journeys) : null, artifactState, workProgress: durable ? { resumed: durable.resumed } : null };
    },
    initialGeneration,
    venuePosition: (query, evidenceId) => readVenuePosition(reference, query, evidenceId, signal),
    ...(geoConfigured() ? {
      resolvePlace: (query: import("@/lib/journeys").PositionQuery) => resolvePlace(reference, query, signal),
      getJourneys: async () => {
        const plan = proposed ?? snapshot.plan;
        if (!plan) return { status: "unverified", message: "Propose an itinerary first; its required journeys will be checked automatically." };
        journeys = await checkJourneys(reference, plan, places, signal);
        return journeySummary(journeys);
      },
    } : {}),
    recordWebSources(urls, checkedAt) { for (const url of urls) retrievedUrls.add(url); return evidenceIndex.web(urls, checkedAt); },
    evidence: id => evidenceIndex.get(id),
    evidenceSources: () => evidenceIndex.list(),
    documentEvidence: (id, revision, title) => evidenceIndex.document(id, revision, title),
    recordWebResearch() { budgetReview.recordResearch(); },
    async proposeBudget(budget, reviewed) {
      active();
      budgetRequired = true;
      rejected.add("budget");
      const candidate = validateBudget(budget);
      proposedBudget = candidate;
      rejected.delete("budget");
      budgetReviewed = reviewed;
      reviewedPlan = JSON.stringify(proposed ?? snapshot.plan);
      return { valid: true, staged: true, budgetCheck: budgetCheck() };
    },
    async resolveBudgetGaps(gaps) {
      active();
      if (!proposedBudget) throw new WorkspaceError("Propose a valid budget before resolving price gaps.", 400);
      budgetCheck();
      proposedBudget = validateBudget(budgetReview.resolve(proposedBudget, gaps));
      rejected.delete("budget");
      return { staged: true, budgetCheck: budgetCheck() };
    },
    source,
    describeCatalog: async () => describeCatalog(await readCatalog()),
    search: async (query) => queryCatalog(await readCatalog(), query),
    places: async (ids) => readPlaces(ids, await readCatalog()),
    readDocument: (id, revision) => readTextDocument(reference, id, revision),
    readMessage: (id) =>
      workspaceRpc("planning_message", { p_trip: reference, p_id: id }),
    async saveBrief(markdown, expectedRevision) {
      active();
      if (initialGeneration) planRequired = true;
      const edit: DocumentEdit = {
        id: contextId, name: context?.name ?? "Travel brief.md", kind: "planning_context", expectedRevision, markdown,
      };
      // Join pending changes.
      if (proposed || proposedBudget || edits.size) {
        const staged = await stageDocument(edit);
        return { ...staged, saved: false, planningComplete: false, requiresCommit: true };
      }
      const result = await saveBrief.save(edit, snapshot.revision);
      snapshot = result.snapshot;
      context = result.context;
      contextId = snapshot.contextDocumentId ?? contextId;
      if (context) briefCheckpoints.set(contextId, context.contentRevision);
      return { saved: true, planningComplete: false, document: context, workspace: view() };
    },
    stageDocument,
    async propose(plan, authorizedItemIds, allowScheduleConflicts = false) {
      active();
      planRequired = true;
      rejected.add("plan");
      // Validate before staging.
      rejectDirectEdits(plan, proposed ?? snapshot.plan);
      const checked = inspectPlan(
        plan,
        places,
        snapshot.plan,
        [...new Set([...authorized, ...authorizedItemIds])],
      );
      const effectiveCheck = proposed ? inspectPlan(plan, places, proposed, authorizedItemIds) : null;
      if (effectiveCheck) checked.findings.push(...effectiveCheck.findings.filter(f => f.severity === "error"));
      if (checked.plan) checked.findings.push(...inspectVenueSources(checked.plan, snapshot.plan, retrievedUrls));
      const sources = sourcesIn(plan).filter(
        (s) => s.type !== "document" || !edits.has(s.documentId),
      );
      await workspaceRpc("planning_sources", {
        p_trip: reference,
        p_sources: sources,
      });
      let routeReport: JourneyReport | null = null;
      const blocking = () => checked.findings.some(finding => finding.severity === "error" && (!allowScheduleConflicts || !["overlap", "sequence", "journey_time"].includes(finding.code)));
      if (checked.plan && !blocking()) {
        checked.findings.push(...await inspectGeoSources(reference, checked.plan, signal));
        if (!blocking()) {
          routeReport = await checkJourneys(reference, checked.plan, places, signal);
          checked.findings.push(...routeReport.findings);
        }
      }
      const valid =
        !!checked.plan && !checked.findings.some((f) => f.severity === "error");
      const accepted = !!checked.plan && !blocking();
      if (accepted) { planFindings = checked.findings; journeys = routeReport; rejected.delete("plan"); proposed = checked.plan; authorized = [...new Set([...authorized, ...authorizedItemIds])]; }
      return { findings: groupFindings(checked.findings), valid, staged: accepted, journeys: routeReport ? journeyContext(routeReport) : null };
    },
    async reload() {
      active();
      const latest = await workspaceRpc<WorkspaceSnapshot>("planning_snapshot", {
        p_trip: reference,
      });
      const latestContext = latest.contextDocumentId
        ? await readTextDocument(reference, latest.contextDocumentId)
        : null;
      snapshot = latest;
      context = latestContext;
      contextId = snapshot.contextDocumentId ?? contextId;
      proposed = null;
      planFindings = [];
      journeys = null;
      saveBrief.reset();
      proposedBudget = null;
      budgetReviewed = false;
      budgetReview.reset();
      edits.clear();
      documentRequirements.clear();
      for (const key of rejected) if (key.startsWith("document:")) rejected.delete(key);
      authorized = [];
      return view();
    },
    async commit(summary, handledInputIds) {
      if (receipt) return { saved: true, receipt, snapshot };
      active();
      const allowed = new Set([
        start.inputId,
        ...snapshot.pendingInputs.map((i) => i.id),
      ]);
      if (!handledInputIds.includes(start.inputId))
        throw new WorkspaceError(
          "Include the current input ID after fully handling this request.",
          400,
          "INPUT_NOT_HANDLED",
        );
      if (handledInputIds.some((id) => !allowed.has(id)))
        throw new WorkspaceError(
          "Only current or pending input can be marked handled.",
          400,
          "INPUT_NOT_PENDING",
        );
      if (!proposed && !proposedBudget && !edits.size)
        throw new WorkspaceError(
          "Stage a valid plan, budget or document before saving.",
          400,
          "NOTHING_TO_SAVE",
        );
      if (rejected.size || planRequired && !proposed || budgetRequired && !proposedBudget || [...documentRequirements].some(id => !edits.has(id)))
        throw new WorkspaceError("A requested change is missing a valid proposal. Correct or re-propose every requested artifact after a rejection or reload before committing.", 400, "INCOMPLETE_CHANGES");
      const finalFindings = proposed ? inspectPlan(proposed, places, snapshot.plan, authorized).findings : [];
      if (finalFindings.some(finding => finding.severity === "error"))
        throw new WorkspaceError(
          "The plan needs correction before saving.",
          400, "PLAN_INVALID", { findings: finalFindings },
        );
      const review = reviewPlanning(proposed ?? snapshot.plan, proposedBudget ?? snapshot.budget ?? null, initialGeneration && !!proposed, "commit", [], !!proposedBudget && !(budgetReviewed && reviewedPlan === JSON.stringify(proposed ?? snapshot.plan)), !!proposed && !!proposedBudget);
      if (review.blockers.length) throw new WorkspaceError(review.blockers[0].message, 400, review.blockers[0].code, { review });
      if (proposed && inspectVenueSources(proposed, snapshot.plan, retrievedUrls).length)
        throw new WorkspaceError("Venue sources need checking before saving.", 400, "PLAN_SOURCE");
      if (proposed) {
        const sourceFindings = await inspectGeoSources(reference, proposed, signal);
        journeys = await checkJourneys(reference, proposed, places, signal);
        if ([...sourceFindings, ...journeys.findings].some(finding => finding.severity === "error"))
          throw new WorkspaceError("Resolve the reported journey or map-source conflicts before saving.", 400, "PLAN_INVALID", { findings: [...sourceFindings, ...journeys.findings], journeys: journeySummary(journeys) });
      }
      if (proposedBudget) validateBudget(proposedBudget, true);
      // Resolve price gaps first.
      const checks = proposedBudget ? budgetCheck() : null;
      if (checks && !checks.readyToCommit)
        return { saved: false, budgetCheck: checks };
      // Prepare file bytes first.
      const writes = [];
      for (const edit of edits.values()) {
        active();
        writes.push(await prepareDocument(reference, edit, "agent"));
      }
      active();
      // Verify staged citations.
      const citations = [...(proposed ? sourcesIn(proposed).filter(s => s.type === "document").map(s => ({ id: s.documentId, revision: s.revision })) : []), ...(proposedBudget?.entries.flatMap(entry => entry.sources.filter(s => s.documentId).map(s => ({ id: s.documentId!, revision: s.documentRevision }))) ?? [])];
      for (const citation of citations) {
        const prepared = writes.find(write => write.document_id === citation.id);
        if (prepared && citation.revision !== prepared.content_revision) throw new WorkspaceError("A staged document citation does not match its prepared version. Revalidate the evidence.", 400, "PLAN_SOURCE");
      }
      // Publish one atomic change.
      const result = await workspaceRpc<{
        receipt: Receipt;
        snapshot: WorkspaceSnapshot;
      }>(proposedBudget ? "planning_commit_budget" : "planning_commit", {
        ...(proposedBudget ? { p_budget: proposedBudget, p_budget_reviewed: budgetReviewed && reviewedPlan === JSON.stringify(proposed ?? snapshot.plan) } : {}),
        p_trip: reference,
        p_operation: reply,
        p_generation: generation,
        p_expected: snapshot.revision,
        p_plan: proposed,
        p_writes: writes.map((w) => w.id),
        p_sources: proposed ? sourcesIn(proposed) : [],
        p_handled: handledInputIds,
        p_summary: summary,
      });
      receipt = result.receipt;
      acceptSaved(result.snapshot);
      return { saved: true, ...result, journeys: journeys ? journeySummary(journeys) : null, ...(checks ? { budgetCheck: checks } : {}) };
    },
    async withdraw(operationId) {
      active();
      return workspaceRpc("planning_withdraw", {
        p_trip: reference,
        p_operation: operationId,
        p_message: start.inputId,
      });
    },
  };
  environment.artifacts = workspaceArtifacts(reference, environment, {
    snapshot: () => snapshot, plan: () => proposed, budget: () => proposedBudget,
    receipt: () => receipt, edits, contextId: () => contextId, context: () => context,
    review: () => proposedBudget ? !(budgetReviewed && reviewedPlan === JSON.stringify(proposed ?? snapshot.plan)) : !!proposed || !!snapshot.budgetNeedsReview,
    findings: () => planFindings,
  });
  // Restore accepted work.
  const capture = (): WorkingPayload => ({
    schemaVersion: 1, plan: proposed, budget: proposedBudget, edits: [...edits.values()], contextId,
    planRequired, budgetRequired, documentRequirements: [...documentRequirements], rejected: [...rejected], authorized,
    budgetReviewed, reviewedPlan, budgetPolicy: budgetReview.snapshot(), briefCheckpoints: [...briefCheckpoints],
    retrievedUrls: [...retrievedUrls], evidence: evidenceIndex.list(), artifact: environment.artifacts!.snapshotWork!(), mutations: [],
  });
  const restore = (payload: WorkingPayload) => {
    proposed = payload.plan; proposedBudget = payload.budget; contextId = payload.contextId;
    planRequired = payload.planRequired; budgetRequired = payload.budgetRequired;
    edits.clear(); payload.edits.forEach(edit => edits.set(edit.id, edit));
    documentRequirements.clear(); payload.documentRequirements.forEach(id => documentRequirements.add(id));
    rejected.clear(); payload.rejected.forEach(key => rejected.add(key)); authorized = payload.authorized;
    budgetReviewed = payload.budgetReviewed; reviewedPlan = payload.reviewedPlan; budgetReview.restore(payload.budgetPolicy);
    briefCheckpoints.clear(); payload.briefCheckpoints.forEach(([id, revision]) => briefCheckpoints.set(id, revision));
    retrievedUrls.clear(); payload.retrievedUrls.forEach(url => retrievedUrls.add(url)); evidenceIndex.restore(payload.evidence);
    evidenceIndex.saved(snapshot.plan, snapshot.budget ?? null);
    environment.artifacts!.restoreWork!(payload.artifact);
  };
  durable = receipt ? null : await openDraft(reference, reply, generation, signal);
  if (durable?.confirmed) {
    try {
    restore(durable.confirmed);
    if (snapshot.contextDocumentId && contextId !== snapshot.contextDocumentId) throw new WorkspaceError("The saved trip context changed. Start a new message to reconcile the changes.", 409, "PLAN_CONFLICT");
    for (const edit of edits.values()) {
      const existing = snapshot.documents.find(document => document.id === edit.id);
      if ((existing?.revision ?? 0) !== edit.expectedRevision) throw new WorkspaceError("A file changed since this planning work was saved.", 409, "DOCUMENT_CONFLICT");
      validateDocumentEdit(edit, existing);
    }
    if (proposed) {
      rejectDirectEdits(proposed, snapshot.plan);
      const checked = inspectPlan(proposed, places, snapshot.plan, authorized);
      if (!checked.plan) throw new WorkspaceError("The saved planning work could not be restored safely.", 400, "DRAFT_INVALID");
      planFindings = [...checked.findings, ...inspectVenueSources(proposed, snapshot.plan, retrievedUrls), ...await inspectGeoSources(reference, proposed, signal)];
      const hard = planFindings.filter(finding => finding.severity === "error" && !["overlap", "sequence", "journey_time"].includes(finding.code));
      if (hard.length) throw new WorkspaceError("Saved planning details need reconciliation before continuing.", 400, "DRAFT_INVALID", { findings: hard });
      journeys = await checkJourneys(reference, proposed, places, signal); planFindings.push(...journeys.findings);
    }
    if (proposedBudget) validateBudget(proposedBudget);
    const sourceRefs: SourceRef[] = [
      ...(proposed ? sourcesIn(proposed) : []),
      ...((proposedBudget as Budget | null)?.entries.flatMap(entry => entry.sources.flatMap(source => source.documentId && source.documentRevision ? [{ type: "document" as const, documentId: source.documentId, revision: source.documentRevision, section: null }] : [])) ?? []),
    ].filter(source => source.type !== "document" || !edits.has(source.documentId));
    await workspaceRpc("planning_sources", { p_trip: reference, p_sources: sourceRefs });
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError("Saved planning progress could not be restored safely. Your published itinerary is unchanged.", 400, "DRAFT_INVALID");
    }
  }
  if (durable) {
    const store = durable;
    environment.workProgress = {
      resumed: store.resumed,
      lookup: (callId, fingerprint) => store.lookup(callId, fingerprint),
      async checkpoint(callId, fingerprint, result, reset) {
        const prior = store.confirmed;
        try { await store.save(capture(), snapshot.revision, callId, fingerprint, result, reset); }
        catch (error) {
          if (prior) restore(prior);
          else { proposed = null; proposedBudget = null; edits.clear(); planFindings = []; journeys = null; }
          throw error;
        }
      },
      verify: () => store.verify(),
    };
  }
  return environment;
}

function rejectDirectEdits(next: unknown, previous: unknown) {
  if (!next || typeof next !== "object") return;
  const value = next as Record<string, unknown>, old = previous as Record<string, unknown> | null;
  if (value.type === "direct_edit" && old?.type !== "direct_edit")
    throw new WorkspaceError("Agent-authored facts need message, document, catalog, web or assumption evidence. Preserve existing direct edits unchanged.", 400, "PLAN_SOURCE");
  if (Array.isArray(next)) {
    next.forEach((item, index) => {
      const id = item && typeof item === "object" ? item.id : undefined;
      const prior = Array.isArray(previous) ? id ? previous.find(candidate => candidate?.id === id) : previous[index] : undefined;
      rejectDirectEdits(item, prior);
    });
  } else for (const [key, item] of Object.entries(value)) rejectDirectEdits(item, old?.[key]);
}
