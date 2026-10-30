import "server-only";
import { randomUUID } from "node:crypto";
import type { ActionResult } from "@/lib/actions";
import { WorkspaceError } from "../database";
import { claimDraft, putDraft, readDraft } from "./store";
import { decodePayload, MAX_DRAFT_BYTES, type WorkingPayload } from "./model";
export type { WorkingPayload } from "./model";
export async function openDraft(reference: string, operation: string, generation: string, signal: AbortSignal) {
  // Claim current generation.
  const result = await claimDraft(reference, operation, generation, process.env.AGENT_DURABLE_DRAFTS === "true");
  if ("expired" in result && result.expired) throw new WorkspaceError("This unfinished planning progress has expired. Start a new message to plan from your saved trip.", 409, "DRAFT_EXPIRED");
  if (result.resumeRequired) throw new WorkspaceError("Your unfinished planning progress needs the recovery service. Please try again when it is available.", 503, "DRAFT_DISABLED");
  if (!result.enabled || !result.draft || result.published) return null;
  let version = result.draft.version;
  let confirmed: WorkingPayload | null;
  try { confirmed = result.draft.payload ? decodePayload(result.draft.payload) : null; }
  catch { throw new WorkspaceError("Saved planning progress could not be restored safely. Your published itinerary is unchanged.", 400, "DRAFT_INVALID"); }
  const resumed = !!confirmed;
  let poisoned = false;
  const mutations = new Map(confirmed?.mutations.map(item => [item.callId, item]) ?? []);
  return {
    resumed,
    get confirmed() { return confirmed ? structuredClone(confirmed) : null; },
    assertWritable() { if (poisoned) throw new WorkspaceError("Planning progress could not be confirmed. Retry before making more changes.", 503, "DRAFT_WRITE_UNCONFIRMED"); },
    lookup(callId: string, fingerprint: string) {
      const prior = mutations.get(callId);
      if (!prior) return null;
      if (prior.fingerprint !== fingerprint) throw new WorkspaceError("This call identity belongs to another change. Read current progress and use a new call.", 409, "CALL_ID_CONFLICT");
      return { ...prior.result, data: { ...(prior.result.data as object), replayed: true } };
    },
    async save(payload: WorkingPayload, baseRevision: number, callId: string, fingerprint: string, action: ActionResult, reset = false) {
      signal.throwIfAborted(); this.assertWritable();
      // Retain accepted mutation identities.
      if (action.outcome === "succeeded" || action.effect === "staged") {
        const data = action.data as Record<string, unknown> | null;
        const compact = data ? Object.fromEntries(["id", "staged", "valid", "saved", "contentRevision", "proposedContentRevision", "document", "applied"].filter(key => key in data).map(key => [key, key === "document" && data.document ? { id: (data.document as { id?: string }).id, contentRevision: (data.document as { contentRevision?: number }).contentRevision } : data[key]])) : null;
        mutations.set(callId, { callId, fingerprint, result: { ...action, data: compact } });
      }
      const next = { ...payload, mutations: [...mutations.values()].slice(-100) };
      const text = JSON.stringify(next);
      if (Buffer.byteLength(text) > MAX_DRAFT_BYTES) { poisoned = true; throw new WorkspaceError("This planning request is too large to preserve safely. Your published trip is unchanged.", 400, "DRAFT_INVALID"); }
      try {
        try { decodePayload(text); }
        catch { throw new WorkspaceError("Planning progress could not be recorded safely. Your itinerary and budget are unchanged.", 400, "DRAFT_INVALID"); }
        const row = await putDraft(reference, operation, generation, version, baseRevision, randomUUID(), text, reset);
        version = row.version; confirmed = decodePayload(row.payload!);
      } catch (error) { poisoned = true; throw error; }
    },
    async verify() {
      const row = await readDraft(reference, operation, generation);
      return !!row?.payload && row.base_revision === row.head_revision && ["active", "interrupted"].includes(row.status) && Date.parse(row.expires_at) > Date.now();
    },
  };
}
