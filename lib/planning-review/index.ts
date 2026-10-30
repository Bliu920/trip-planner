import type { Plan, PlanFinding } from "@/lib/plan";
import type { Budget } from "@/lib/budget";
import { coverage } from "./coverage";
import type { PlanningReview, ReviewIssue } from "./types";
export type { PlanningReview, ReviewIssue, DayCoverage } from "./types";

/** Shared policy projection; domain validators still own factual correctness. */
export function reviewPlanning(
  plan: Plan | null,
  budget: Budget | null,
  initial: boolean,
  fingerprint: string,
  validation: readonly PlanFinding[] = [],
  budgetNeedsReview = false,
  coordinatedEdit = false,
): PlanningReview {
  const blockers: ReviewIssue[] = [];
  if (initial && (!plan || !plan.days.some((day) => day.itemIds.length)))
    blockers.push({
      artifact: "plan",
      code: "PLAN_EMPTY",
      message: "The itinerary contains only empty days. Add the daily arrangements before saving.",
      nextAction: plan ? "editPlan" : "createPlan",
    });
  if (initial && plan && !budget?.entries.length)
    blockers.push({
      artifact: "budget",
      code: "BUDGET_EMPTY",
      message:
        "The first itinerary needs a budget with cost entries. Add researched estimates for lodging, food, transport and admissions.",
      nextAction: budget ? "editBudget" : "createBudget",
    });
  if ((initial || coordinatedEdit) && budget?.entries.length && budgetNeedsReview)
    blockers.push({
      artifact: "budget",
      code: "BUDGET_REVIEW_REQUIRED",
      message:
        "Review the numeric budget against the final itinerary after the latest Plan changes. Use editBudget review after reconciling coverage.",
      nextAction: "editBudget",
    });
  for (const entry of budget?.entries ?? [])
    for (const id of entry.planItemIds)
      if (!plan?.items[id])
        blockers.push({
          artifact: `budget:${entry.id}`,
          code: "BUDGET_LINK",
          itemIds: [id],
          message: `Repair the cost link to missing arrangement ${id}.`,
          nextAction: "editBudget",
        });
  for (const issue of validation)
    if (issue.severity === "error")
      blockers.push({
        artifact: "plan",
        code: issue.code,
        itemIds: issue.itemIds,
        message: issue.message,
        nextAction: "editPlan",
      });
  const report = coverage(plan, budget);
  report.findings.push(
    ...groupFindings(validation)
      .filter((issue) => issue.severity !== "error")
      .map((issue) => ({
        artifact: "plan",
        code: issue.code,
        itemIds: issue.itemIds,
        message: issue.message,
        nextAction: "editPlan",
      })),
  );
  return {
    fingerprint,
    ...report,
    blockers,
    readyToPublish: blockers.length === 0,
    qualityComplete: blockers.length === 0 && report.findings.length === 0,
  };
}

/** Collapse identical uncertainty messages without weakening any error. */
export function groupFindings(findings: readonly PlanFinding[]) {
  const result: PlanFinding[] = [],
    groups = new Map<string, PlanFinding>();
  for (const finding of findings) {
    if (finding.code !== "journey_unverified" || finding.severity === "error") {
      result.push(finding);
      continue;
    }
    const key = `${finding.severity}:${finding.message}`,
      previous = groups.get(key);
    if (previous) previous.itemIds = [...new Set([...previous.itemIds, ...finding.itemIds])];
    else {
      const value = { ...finding, itemIds: [...finding.itemIds] };
      groups.set(key, value);
      result.push(value);
    }
  }
  return result;
}
