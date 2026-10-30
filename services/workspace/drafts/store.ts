import "server-only";
import { workspaceRpc, WorkspaceError } from "../database";
import type { DraftRow } from "./model";
export async function claimDraft(reference: string, operation: string, generation: string, enabled: boolean) {
  try {
    return await workspaceRpc<{ enabled: boolean; resumeRequired?: boolean; draft?: DraftRow; published?: boolean; expired?: boolean }>("planning_draft_claim", { p_trip: reference, p_operation: operation, p_generation: generation, p_enabled: enabled });
  } catch (error) {
    if (!enabled && error instanceof WorkspaceError && error.code === "DRAFT_MIGRATION_REQUIRED") return { enabled: false };
    throw error;
  }
}
export const readDraft = (reference: string, operation: string, generation: string) => workspaceRpc<DraftRow | null>("planning_draft_read", { p_trip: reference, p_operation: operation, p_generation: generation });
export async function putDraft(reference: string, operation: string, generation: string, expected: number, base: number, write: string, payload: string, reset: boolean) {
  const parameters = { p_trip: reference, p_operation: operation, p_generation: generation, p_expected: expected, p_base: base, p_write: write, p_payload: payload, p_rebase: reset };
  try { return await workspaceRpc<DraftRow>("planning_draft_put", parameters); }
  catch (error) {
    if (error instanceof WorkspaceError && error.status < 500) throw error;
    // Verify a lost response.
    const row = await readDraft(reference, operation, generation).catch(() => null);
    if (row?.last_write === write && row.payload === payload) return row;
    if (row?.version !== expected) throw new WorkspaceError("Could not confirm saved planning progress. Your published trip is unchanged; retry to check its latest state.", 503, "DRAFT_WRITE_UNCONFIRMED");
    // Retry only this identity.
    return workspaceRpc<DraftRow>("planning_draft_put", parameters).catch(async () => {
      const verified = await readDraft(reference, operation, generation).catch(() => null);
      if (verified?.last_write === write && verified.payload === payload) return verified;
      throw new WorkspaceError("Could not confirm saved planning progress. Retry to check its latest state.", 503, "DRAFT_WRITE_UNCONFIRMED");
    });
  }
}
