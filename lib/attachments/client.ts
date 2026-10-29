// Preserve composer entrypoints.
import { uploadDocuments, documentUrl } from "@/lib/documents/client";
import type { DocumentRef, DraftFile } from "@/lib/documents/types";

export const uploadFiles = uploadDocuments;
export const attachmentUrl = documentUrl;
export async function starterAttachments(reference: string, ids: string): Promise<DocumentRef[]> {
  const response = await fetch(`/api/trips/${encodeURIComponent(reference)}/attachments?ids=${encodeURIComponent(ids)}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not load the starting documents.");
  return body;
}
export type { DraftFile };
