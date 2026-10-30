import { createHash } from "node:crypto";
import { actionResultSchema, type ActionPayload, type ActionResult, type ActionState } from "@/lib/actions";
import type { AgentEnvironment } from "../contracts";
import { actionFailure, succeeded, actionDiagnostic } from "./results";
import type { AgentErrorDetail } from "@/lib/chat/failure";

export type ActionKind = "read" | "stage" | "checkpoint" | "commit" | "reset";
export class ActionRun {
  private executions = new Map<string, { input: string; result: Promise<ActionResult> }>();
  state: ActionState | null = null;
  lastResult: ActionResult | null = null;
  inputFailure: AgentErrorDetail | null = null;
  private requiresCommit = false;
  private persistenceFailed = false;
  constructor(private readonly environment: Pick<AgentEnvironment, "operationId" | "recordAction" | "verifyCommit" | "workProgress">) {
    if (environment.workProgress?.resumed) {
      this.requiresCommit = true;
      this.state = { state: "unsaved", operationId: environment.operationId, revision: null, code: "DRAFT_RESTORED", message: "Planning progress was restored. The requested changes still need their final save." };
    }
  }

  private async record(state: ActionState) {
    this.state = state;
    await this.environment.recordAction(state);
  }

  async executeOnce(kind: ActionKind, callId: string, input: unknown, work: () => Promise<ActionPayload>) {
    if (kind === "read") return this.execute(kind, callId, work);
    const fingerprint = createHash("sha256").update(JSON.stringify(semanticInput(input))).digest("hex");
    try {
      const restored = this.environment.workProgress?.lookup(callId, fingerprint);
      if (restored) { this.lastResult = restored; return restored; }
    } catch (error) { return this.execute(kind, callId, async () => actionFailure(error, false), fingerprint); }
    const prior = this.executions.get(callId);
    if (prior) {
      if (prior.input !== fingerprint) return this.execute(kind, callId, async () => ({ outcome: "blocked", effect: "none", code: "CALL_ID_CONFLICT", message: "This call identity was already used for a different edit. Read the current state and use a new call.", recovery: { action: "correct_input", instruction: "Use a new call identity." }, data: null }));
      return prior.result;
    }
    const result = this.execute(kind, callId, work, fingerprint);
    this.executions.set(callId, { input: fingerprint, result });
    const resolved = await result;
    if (resolved.outcome !== "succeeded" && resolved.effect !== "staged") this.executions.delete(callId);
    return resolved;
  }

  async execute(kind: ActionKind, operationId: string, work: () => Promise<ActionPayload>, fingerprint = "protocol-failure"): Promise<ActionResult> {
    const mutationId = operationId;
    const mutation = kind !== "read" && kind !== "reset";
    const write = kind === "commit" || kind === "checkpoint";
    if (write) operationId = this.environment.operationId;
    let payload: ActionPayload;
    if (mutation) {
      this.requiresCommit = true;
      try {
        await this.record({ state: "in_progress", operationId: this.environment.operationId,
          message: "Changes are being prepared. Final save is not confirmed.", code: "ACTION_STARTED", revision: null });
      } catch {
        this.persistenceFailed = true;
        return { ...actionFailure(new Error(), false), code: "ACTION_TRACKING_UNAVAILABLE", operationId };
      }
    }
    try { payload = await work(); }
    catch (error) { payload = actionFailure(error, write); }
    try {
      actionResultSchema.parse({ ...payload, operationId });
      if (payload.data === undefined) throw new Error("Tool result must include data.");
      if (payload.effect === "persisted" && !write) throw new Error("This tool cannot attest a persistent write.");
      if (kind === "commit" && payload.outcome === "succeeded") {
        const receipt = (payload.data as { receipt?: { operation_id?: string; revision?: number } })?.receipt;
        if (payload.effect !== "persisted" || receipt?.operation_id !== this.environment.operationId || !Number.isSafeInteger(receipt.revision))
          throw new Error("Commit success requires this operation's receipt.");
      }
      JSON.stringify(payload);
    } catch { payload = { ...actionFailure(new Error("Invalid tool result"), write), code: "INVALID_ACTION_RESULT" }; }
    if (kind === "commit" && payload.outcome === "unknown") {
      const verified = await this.environment.verifyCommit().catch(() => null);
      if (verified?.saved && verified.receipt?.operation_id === this.environment.operationId && Number.isSafeInteger(verified.receipt.revision)) payload = succeeded(verified, "persisted", "Changes saved.");
    }
    let result = actionResultSchema.parse({ ...payload, operationId });
    if (kind !== "read" && !(kind === "commit" && result.effect === "persisted")) {
      try { await this.environment.workProgress?.checkpoint(mutationId, fingerprint, result, kind === "reset"); }
      catch (error) {
        this.persistenceFailed = true;
        result = actionResultSchema.parse({ ...actionFailure(error, false), operationId,
          code: typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "DRAFT_WRITE_UNCONFIRMED",
          message: "Planning progress could not be confirmed. Retry before making more changes.",
          recovery: { action: "stop", instruction: "Planning progress could not be confirmed. Do not make more changes in this request; explain the problem and retry from chat." } });
      }
    }
    if (result.outcome !== "succeeded") console.info(JSON.stringify({ event: "agent_action_issue", at: new Date().toISOString(), messageId: this.environment.operationId, kind, code: result.code, outcome: result.outcome, detail: actionDiagnostic(result.data) }));
    this.lastResult = result;
    if (mutation) {
      const data = result.data as { receipt?: { revision: number } } | null;
      const saved = kind === "commit" && result.outcome === "succeeded" && result.effect === "persisted";
      if (saved) this.requiresCommit = false;
      try {
        await this.record({ state: saved ? "saved" : result.outcome === "unknown" ? "unknown" : "unsaved",
          operationId: this.environment.operationId, code: saved ? "SAVED" : kind === "checkpoint" && result.effect === "persisted" ? "CHECKPOINT_SAVED" : result.code,
          revision: saved ? data?.receipt?.revision ?? null : null,
          message: saved ? "Changes saved." : kind === "checkpoint" && result.effect === "persisted"
            ? "Travel brief saved. The plan has not been saved yet." : result.effect === "staged"
              ? "Changes are prepared but not saved yet." : result.message });
      } catch { this.persistenceFailed = true; }
    }
    return result;
  }

  async verify() {
    if (!this.requiresCommit && !this.persistenceFailed) return this.state;
    try {
      const result = await this.environment.verifyCommit();
      if (result.saved && result.receipt?.operation_id === this.environment.operationId && Number.isSafeInteger(result.receipt.revision)) {
        this.requiresCommit = false;
        this.state = { state: "saved", operationId: this.environment.operationId, code: "SAVED", revision: result.receipt.revision, message: "Changes saved." };
      }
    } catch {
      if (this.state?.state !== "saved") this.state = { state: "unknown", operationId: this.environment.operationId, code: "VERIFICATION_UNAVAILABLE", revision: null, message: "Could not verify whether changes were saved." };
    }
    if (this.state) await this.record(this.state).catch(() => { this.persistenceFailed = true; });
    return this.state;
  }

  get shouldStop() { return this.persistenceFailed; }
  get needsRecovery() { return this.requiresCommit && !this.persistenceFailed && this.lastResult?.recovery.action !== "stop"; }
}

function semanticInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticInput);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "editToken").sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, semanticInput(item)]));
}
