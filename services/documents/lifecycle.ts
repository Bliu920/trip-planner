import "server-only";
import { createHash } from "node:crypto";
import { fileFormat, uploadFormat } from "@/lib/file-types";
import { fileError, type DocumentSource } from "@/lib/documents/types";
import { documentId, documentRecord, documentRpc, DocumentError, getDocument, storageRequest, publicDocument, type StoredDocument } from "./database";
import { BUCKET, deleteBytes, readBytes, signedUpload } from "./storage";

export async function reserveDocument(reference: string, body: Record<string, unknown>) {
  if (typeof body.id !== "string" || typeof body.name !== "string" || typeof body.mediaType !== "string" || !["chat", "starter", "library"].includes(body.source as DocumentSource)) throw new DocumentError("File details are invalid.", 400);
  const error = fileError({ name: body.name, type: body.mediaType, size: body.size as number });
  if (error) throw new DocumentError(error, 400);
  // Record grants before signing.
  const record = await documentRpc<StoredDocument>("attachment_reserve", {
    p_trip: reference, p_id: documentId(body.id), p_name: body.name, p_type: uploadFormat(body.name, body.mediaType)!.mime, p_size: body.size, p_source: body.source,
  });
  const uploadUrl = record.status === "pending" ? await signedUpload(record) : undefined;
  return { document: await getDocument(reference, record.id), ready: record.status === "ready", uploadUrl };
}
export async function finalizeDocument(reference: string, id: string) {
  const record = await documentRecord(reference, id);
  if (record.status !== "ready") {
    if (record.status !== "pending") throw new DocumentError("This document has been deleted.", 410);
    const bytes = await readBytes(record);
    if (fileFormat(record.mediaType)?.editor === "text") {
      await documentRpc("document_finalize_text", { p_trip: reference, p_id: id, p_hash: createHash("sha256").update(bytes).digest("hex") });
      return getDocument(reference, id);
    }
  }
  // Commit verified readiness.
  await documentRpc("document_mutate", { p_trip: reference, p_id: id, p_action: "finalize" });
  return getDocument(reference, id);
}
export async function readDocumentContent(reference: string, id: string) {
  const record = await documentRecord(reference, id);
  if (record.status === "deleting" || record.status === "deleted") throw new DocumentError("This document has been deleted.", 410);
  if (record.status !== "ready") throw new DocumentError("This upload is not complete yet.", 409);
  const bytes = await readBytes(record);
  if (fileFormat(record.mediaType)?.editor === "text") {
    const version = await documentRpc<{ path: string; sha256: string }>("document_version", { p_trip: reference, p_id: id, p_revision: record.content_revision });
    if (version.path !== record.path || createHash("sha256").update(bytes).digest("hex") !== version.sha256)
      throw new DocumentError("The file content does not match its saved version.", 409);
  }
  const current = await documentRecord(reference, id);
  if (current.status !== "ready") throw new DocumentError("This document has been deleted.", 410);
  if (current.revision !== record.revision) throw new DocumentError("This file changed while loading. Reload and try again.", 409);
  return { document: publicDocument(record), bytes };
}
export async function purgeDocument(record: StoredDocument) {
  if (record.status === "deleted") return;
  await deleteBytes(record);
  // Retain outstanding grant paths.
  await documentRpc("document_mutate", { p_trip: record.trip_reference, p_id: record.id, p_action: "purged" });
}
export async function deleteDocument(reference: string, id: string, revision: number) {
  const record = await documentRpc<StoredDocument>("document_mutate", { p_trip: reference, p_id: id, p_action: "delete", p_revision: revision });
  try { await purgeDocument(record); } catch { /* Durable deletion remains queued. */ }
  return getDocument(reference, id);
}
export async function cleanupDocuments() {
  const records = await documentRpc<StoredDocument[]>("document_cleanup_batch", { p_limit: 10 });
  const results = await Promise.allSettled(records.map(purgeDocument));
  const abandoned = await documentRpc<{ id: string; path: string }[]>("document_abandoned", {});
  const cleaned = await Promise.allSettled(abandoned.map(async write => {
    await storageRequest(`/storage/v1/object/${BUCKET}`, "DELETE", { prefixes: [write.path] });
    await documentRpc("document_abandoned", { p_done: write.id });
  }));
  return { processed: records.length + abandoned.length, failed: [...results, ...cleaned].filter(result => result.status === "rejected").length };
}
