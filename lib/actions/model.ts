import { z } from "zod";

export const actionResultSchema = z.object({
  outcome: z.enum(["succeeded", "blocked", "failed", "unknown"]),
  effect: z.enum(["none", "staged", "persisted", "unknown"]),
  code: z.string().min(1), message: z.string().min(1), operationId: z.string().min(1),
  recovery: z.object({ action: z.enum(["none", "correct_input", "research", "reload", "verify", "retry", "stop"]), instruction: z.string() }),
  data: z.unknown(),
}).strict().refine(result => result.effect !== "persisted" || result.outcome === "succeeded", "Persisted effects need confirmed success.");
export type ActionResult = z.infer<typeof actionResultSchema>;
export type ActionPayload = Omit<ActionResult, "operationId">;

export const actionStateSchema = z.object({
  state: z.enum(["in_progress", "saved", "unsaved", "unknown"]),
  operationId: z.string().min(1), message: z.string().min(1).max(3000),
  code: z.string().min(1), revision: z.number().int().nonnegative().nullable(),
}).strict();
export type ActionState = z.infer<typeof actionStateSchema>;

export function actionStateLabel(state: ActionState) {
  if (state.state === "saved") return "Changes saved.";
  if (state.state === "unknown" || state.state === "in_progress") return "Save not confirmed. Reload to check before retrying.";
  if (state.code === "CHECKPOINT_SAVED") return "Travel brief saved. The plan has not been saved yet.";
  if (state.code === "OK") return "Changes are prepared but not saved yet.";
  const reasons: Record<string, string> = {
    PLAN_CONFLICT: "The trip changed. Reload before trying again.",
    DOCUMENT_CONFLICT: "A file changed. Reload before trying again.",
    PLAN_SOURCE: "A source could not be verified. Review the linked files and try again.",
    PLAN_ATTEMPT: "The assistant stopped before finishing. Try again from the chat.",
    PLAN_INVALID: "Some plan details need correction. Ask the assistant to review them.",
    BUDGET_GAPS: "Some prices still need checking. Ask the assistant to continue.",
  };
  return `Changes not saved. ${reasons[state.code] ?? "The assistant could not finish these changes. Please try again."}`;
}
