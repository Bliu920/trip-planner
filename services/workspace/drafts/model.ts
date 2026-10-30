import { z } from "zod";
import { planSchema } from "@/lib/plan";
import { budgetSchema } from "@/lib/budget";
import { actionResultSchema } from "@/lib/actions";
import { MAX_TEXT_BYTES } from "@/lib/file-types";
const id = z.string().min(1).max(300);
const pair = <T extends z.ZodType>(value: T) => z.array(z.tuple([id, value])).max(10000);
const draftState = z.object({ generation: z.number().int().nonnegative(), identity: z.string().regex(/^[a-f0-9]{8}$/), failures: pair(z.string().max(5000)), inputs: pair(z.object({ family: id, id, fields: z.array(id).max(100) })) });
const entry = budgetSchema.shape.entries.element;
export const workingPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  plan: planSchema.nullable(), budget: budgetSchema.nullable(),
  edits: z.array(z.object({ id: z.uuid(), name: z.string().max(180), kind: z.enum(["planning_context", "working", "research", "upload"]), expectedRevision: z.number().int().nonnegative(), markdown: z.string().max(MAX_TEXT_BYTES), mediaType: z.string().max(100).optional() })).max(8),
  contextId: z.uuid(), planRequired: z.boolean(), budgetRequired: z.boolean(),
  documentRequirements: z.array(id).max(100), rejected: z.array(id).max(100), authorized: z.array(id).max(100),
  budgetReviewed: z.boolean(), reviewedPlan: z.string().max(1048576),
  budgetPolicy: z.object({ researchRound: z.number().int().nonnegative(), observations: pair(z.object({ entry, scope: z.string().max(2097152), researchRound: z.number().int().nonnegative(), resolved: z.boolean() })) }),
  briefCheckpoints: pair(z.number().int().positive()),
  retrievedUrls: z.array(z.string().max(8192)).max(4096),
  evidence: z.array(z.object({ sourceId: z.string().regex(/^s[1-9]\d*$/), url: z.string().max(8192).nullable(), documentId: z.string().nullable(), documentRevision: z.number().int().positive().nullable(), checkedAt: z.string(), title: z.string().max(4096) })).max(4096),
  artifact: z.object({ draft: draftState, knownPlan: z.array(id).max(10000), knownCosts: z.array(id).max(10000) }),
  mutations: z.array(z.object({ callId: id, fingerprint: z.string().max(100), result: actionResultSchema })).max(100),
}).strict();
export type WorkingPayload = z.infer<typeof workingPayloadSchema>;
export type DraftRow = { generation: string; base_revision: number; head_revision?: number; version: number; status: "active" | "interrupted" | "published" | "discarded"; payload: string | null; last_write: string | null; expires_at: string };
// Eight maximum text edits plus Plan/Budget, JSON escaping and bounded evidence/cache.
export const MAX_DRAFT_BYTES = 16 * 1024 * 1024;
export function decodePayload(text: string) {
  if (Buffer.byteLength(text) > MAX_DRAFT_BYTES) throw new Error("Working snapshot is too large.");
  return workingPayloadSchema.parse(JSON.parse(text));
}
