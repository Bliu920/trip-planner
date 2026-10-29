import { readGuide } from "@/services/guides";
import { succeeded, blocked } from "./actions";
// Deliver guidance with findings.
export async function stageFeedback(value: unknown) {
  const data = value as { valid?: boolean; staged?: boolean; budgetCheck?: { readyToCommit: boolean } };
  if (data.budgetCheck?.readyToCommit === false)
    return { ...blocked({ ...data, guidance: readGuide("budget-gaps") }, "BUDGET_GAPS", "Research or explicitly resolve the listed missing prices before committing.", "research"), effect: "staged" as const };
  if (data.valid === false) return blocked(data, "PLAN_INVALID", "Correct the reported Plan findings and propose it again.", "correct_input");
  if (!data.staged && data.valid !== true) throw new Error("Invalid stage result.");
  return succeeded(data, "staged", data.budgetCheck?.readyToCommit
    ? "Budget checks passed. Preserve the researched amounts and evidence unless new facts or scope changes require correction. Complete the final review and commit. Nothing is saved yet."
    : "Changes staged. They are not saved yet.");
}
export async function commitFeedback(value: unknown) {
  const data = value as { saved?: boolean; receipt?: { revision?: number; operation_id?: string }; budgetCheck?: { readyToCommit: boolean } };
  if (data.saved === false) return stageFeedback(data);
  if (data.saved !== true || !Number.isSafeInteger(data.receipt?.revision) || !data.receipt?.operation_id)
    throw new Error("Save response has no valid receipt.");
  return succeeded(data, "persisted", "Changes saved. Receipt confirmed.");
}
