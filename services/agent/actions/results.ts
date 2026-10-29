import { type ActionPayload } from "@/lib/actions";
import { ZodError } from "zod";

export function succeeded(data: unknown, effect: ActionPayload["effect"] = "none", message = "Action completed."): ActionPayload {
  return { outcome: "succeeded", effect, code: "OK", message, recovery: { action: "none", instruction: "" }, data };
}
export function blocked(data: unknown, code: string, message: string, action: ActionPayload["recovery"]["action"]): ActionPayload {
  return { outcome: "blocked", effect: "none", code, message, recovery: { action, instruction: message }, data };
}
export function actionFailure(error: unknown, writeMayHaveOccurred: boolean): ActionPayload {
  if (error instanceof ZodError) return blocked({ findings: error.issues.map(issue => ({ path: issue.path, message: issue.message })) }, "INVALID_INPUT", "Correct the reported input fields before retrying.", "correct_input");
  const known = error as { status?: number; code?: string; message?: string; data?: unknown } | null;
  const status = known?.status;
  const definitive = status !== undefined && status >= 400 && status < 500;
  const message = definitive && typeof known?.message === "string" ? known.message :
    writeMayHaveOccurred ? "Could not confirm whether your changes were saved. Reload to check before retrying." : "The action could not finish. Try again or correct its input.";
  if (definitive) return blocked(known?.data ?? null, known?.code ?? `ACTION_${status}`, message, known?.code === "PLAN_ATTEMPT" ? "stop" : status === 409 ? "reload" : "correct_input");
  return { outcome: writeMayHaveOccurred ? "unknown" : "failed", effect: writeMayHaveOccurred ? "unknown" : "none",
    code: writeMayHaveOccurred ? "OUTCOME_UNKNOWN" : "ACTION_FAILED", message,
    recovery: { action: writeMayHaveOccurred ? "verify" : "retry", instruction: message }, data: null };
}
