import { type ActionPayload } from "@/lib/actions";
import { ZodError } from "zod";

/** Bounded field diagnostics, never arguments, prose, URLs or private reasoning. */
export function actionDiagnostic(data: unknown) {
  if (!data || typeof data !== "object") return undefined;
  const value = data as Record<string, unknown>;
  const safe = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_:.,-]{1,180}$/.test(v) ? v : undefined;
  return { commandIndex: typeof value.commandIndex === "number" ? value.commandIndex : undefined, commandType: safe(value.commandType), targetId: safe(value.targetId), reasonCode: safe(value.reasonCode), errorType: safe(value.errorType),
    unresolved: Array.isArray(value.unresolved) ? value.unresolved.slice(0, 12).map(item => ({ artifact: safe(item?.artifact), targetId: safe(item?.targetId), fields: Array.isArray(item?.fields) ? item.fields.map(safe).filter(Boolean).slice(0, 12) : [] })) : undefined,
    findings: Array.isArray(value.findings) ? value.findings.slice(0, 12).map(item => ({ code: safe(item?.code), itemIds: Array.isArray(item?.itemIds) ? item.itemIds.map(safe).filter(Boolean).slice(0, 8) : undefined, path: Array.isArray(item?.path) ? item.path.map(String).map(safe).filter(Boolean).slice(0, 12) : undefined })) : undefined };
}

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
