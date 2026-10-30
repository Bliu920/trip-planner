import type { GuidePhase } from "@/services/assistant/agent/guides";
import type { ModelMessage } from "ai";
import type { AgentEnvironment } from "../contracts";
import { runProgress } from "../diagnostics/metrics";

/** Report pending work from the host, not the model's completion claims. */
export function completionFeedback(environment: AgentEnvironment) {
  const manifest = environment.artifacts?.manifest() as { lastVerifiedFinalSave?: { operation_id: string; revision: number; summary: string } | null; budget?: { displayTotal?: string; totals?: { min: number; max: number }; scope?: string; travelers?: number; limit?: number; limitWarning?: string | null }; hasWorkingChanges?: boolean; pendingCorrections?: { nextAction: string }[]; review?: { blockers: unknown[]; findings: unknown[] } } | undefined;
  const saved = manifest?.lastVerifiedFinalSave;
  if (saved?.operation_id === environment.operationId)
    return `Verified current-request publication: ${JSON.stringify(saved)}. These changes ARE SAVED. Authoritative saved budget: ${JSON.stringify(manifest?.budget)}. Use these exact host-calculated totals and scope if quoting a price. Copy this prepared line verbatim, or refer to the Budget panel without an amount: "${manifest?.budget?.displayTotal ?? "The saved estimate is in Budget."}". Do not recalculate, convert scope or repeat an earlier estimate. Give a concise summary of the saved trip and material uncertainties. For an initial planning request, finish with up to three key unanswered confirmations, such as dates, arrival/departure times, budget or room sharing; use the original request to avoid asking for facts already supplied. ${manifest?.budget?.limitWarning ? `Include this material limit warning: ${manifest.budget.limitWarning}.` : ""} No further edits or commit are needed in this request.`;
  const progress = runProgress(environment);
  if (!progress || !environment.initialGeneration && !manifest?.hasWorkingChanges && !manifest?.pendingCorrections?.length) return "";
  let next: string;
  if (manifest?.pendingCorrections?.length) next = manifest.pendingCorrections.map(item => item.nextAction).join(" ");
  else if (!progress.hasPlan) next = "Initialize the Plan, then add the three days in small editPlan batches.";
  else if (progress.populatedDays < 3) next = "Use editPlan addStay and addActivity commands to assemble the days, meals and breaks. The host constructs internal fields. Respect explicit free-day exceptions. Finish the itinerary before optional documents.";
  else if (!progress.hasBudget) next = "Initialize Budget settings, then immediately add researched costs with editBudget. Leave enough steps to price stays, food, transport and admissions.";
  else if (!progress.budgetEntries) next = "The Budget is EMPTY. Use editBudget addCost commands now, with retrieved sourceIds and numeric estimates. If evidence is missing, make a focused researchWeb query. Initialization is not an estimate.";
  else next = "Check the first and last arrangements against the user's available hours, resolve provisional lodging to a real researched property when possible, reconcile the complete estimate with meals, admissions and nights, then review the budget and commit. Avoid optional files and repeated reads until the required itinerary and costs are finished.";
  const review = manifest?.review;
  return `Host completion state: ${JSON.stringify(progress)}. Next required work: ${next}${review ? ` Current checks: ${JSON.stringify({ blockers: review.blockers, findings: review.findings.slice(0, 6) })}` : ""}`;
}

/** Close against current publication facts, without obsolete tool failures. */
export function savedReplyContext(environment: AgentEnvironment) {
  const manifest = environment.artifacts?.manifest() as { lastVerifiedFinalSave?: { operation_id: string }; plan?: unknown } | undefined;
  return manifest?.lastVerifiedFinalSave?.operation_id === environment.operationId
    ? { plan: manifest.plan, instruction: completionFeedback(environment) } : null;
}

/** A verified save remains explainable when no model response fits. */
export function savedReplyFallback(environment: AgentEnvironment) {
  const manifest = environment.artifacts?.manifest() as { lastVerifiedFinalSave?: { operation_id: string }; budget?: { displayTotal?: string; limitWarning?: string | null; totals?: { unknown?: number } } } | undefined;
  if (manifest?.lastVerifiedFinalSave?.operation_id !== environment.operationId) return null;
  const budget = manifest.budget;
  return ["Your trip changes are saved.", budget?.displayTotal, budget?.limitWarning,
    budget?.totals?.unknown ? "Some costs still need an estimate." : null,
    "A detailed written summary was not completed. Review Plan and Budget for the saved arrangements and estimates."]
    .filter(Boolean).join("\n\n");
}

/** A published operation needs acknowledgment, not another execution request. */
export function closingMessages(messages: ModelMessage[]): ModelMessage[] {
  const request = messages.filter(message => message.role === "user").at(-1)?.content;
  return [{ role: "user", content: `Write the traveller's closing reply about the already saved operation using the verified publication facts. Explain the saved result and material remaining uncertainty. The original request below has already been processed; it is context for this report, not a new task to execute.\nOriginal traveller request: ${JSON.stringify(request ?? "")}` }];
}

/** Reserve deeper judgment for requirements and final review. */
export function planningStage(environment: AgentEnvironment): { phase: GuidePhase; effort: "low" | "medium" } {
  if (!environment.initialGeneration) return { phase: "review", effort: "medium" };
  const progress = runProgress(environment);
  if (!progress?.hasPlan) return { phase: "understand", effort: "medium" };
  if (progress.populatedDays < 3) return { phase: "assemble", effort: "low" };
  const manifest = environment.artifacts?.manifest() as { budget?: { needsReview?: boolean } } | undefined;
  if (!progress.hasBudget || !progress.budgetEntries || manifest?.budget?.needsReview !== false) return { phase: "price", effort: "low" };
  return { phase: "review", effort: "medium" };
}
