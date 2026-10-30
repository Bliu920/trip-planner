import "server-only";
import { prepareDocument, readTextDocument, type PreparedDocument } from "@/services/documents";
import type { DocumentEdit } from "@/lib/documents/text";
import type { WorkspaceSnapshot } from "./session";
import { workspaceRpc, WorkspaceError } from "./database";

export function briefWriter(reference: string, operation: string, generation: string, signal: AbortSignal) {
  let pending: { key: string; write: PreparedDocument; revision: number } | null = null;
  const save = async (edit: DocumentEdit, revision: number) => {
    signal.throwIfAborted();
    const key = JSON.stringify(edit);
    // Retain retry identity.
    if (!pending || pending.key !== key) {
      const write = await prepareDocument(reference, edit, "agent");
      pending = { key, write, revision };
    }
    signal.throwIfAborted();
    // Publish without completing planning.
    const parameters = { p_trip: reference, p_operation: operation, p_generation: generation, p_expected: pending.revision, p_write: pending.write.id };
    let snapshot: WorkspaceSnapshot;
    try { snapshot = await workspaceRpc<WorkspaceSnapshot>("planning_save_brief", parameters); }
    catch (error) {
      if (error instanceof WorkspaceError && error.status < 500) throw error;
      signal.throwIfAborted();
      // Recover this same write.
      snapshot = await workspaceRpc<WorkspaceSnapshot>("planning_save_brief", parameters);
    }
    const context = snapshot.contextDocumentId ? await readTextDocument(reference, snapshot.contextDocumentId) : null;
    return { snapshot, context };
  };
  return { save, reset: () => { pending = null; } };
}
