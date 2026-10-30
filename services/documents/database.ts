import "server-only";
import type { DocumentRef, DocumentStatus, DocumentSummary } from "@/lib/documents/types";

export class DocumentError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export type StoredDocument = DocumentRef & {
  trip_reference: string; path: string; status: DocumentStatus; source: "chat" | "starter" | "library";
  kind: "upload" | "planning_context" | "research" | "working"; content_revision: number;
  original_name: string; revision: number; created_at: string; updated_at: string;
  signed_until: string;
};
const errors: Record<string, [string, number]> = {
  DOCUMENT_NOT_FOUND: ["This document could not be found in this trip.", 404],
  DOCUMENT_GONE: ["This document has been deleted.", 410],
  DOCUMENT_CONFLICT: ["This document has changed. Reload it before trying again.", 409],
  DOCUMENT_INVALID: ["The document details are invalid.", 400],
  ATTACHMENT_CONFLICT: ["This upload has changed. Remove the file and attach it again.", 409],
  ATTACHMENT_LIMIT: ["This trip has reached its 30-file limit. Delete unused files and wait for deletion to finish before uploading more.", 400],
  CHAT_NOT_FOUND: ["This trip could not be found.", 404],
};

export function documentId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) throw new DocumentError("The document or trip reference is invalid.", 400);
  return normalized;
}
export function checkDocumentOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new DocumentError("Open Library from your trip workspace.", 403);
}
export async function storageRequest(path: string, method = "GET", body?: unknown, contentType = "application/json") {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new DocumentError("Library is temporarily unavailable. Please try again later.");
  const headers: Record<string, string> = { apikey: key, "Content-Type": contentType };
  if (contentType !== "application/json") headers["x-upsert"] = "false";
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  let response: Response;
  try {
    response = await fetch(new URL(path, base), { method, headers, body: body === undefined ? undefined : (contentType === "application/json" ? JSON.stringify(body) : String(body)), cache: "no-store", signal: AbortSignal.timeout(20000) });
  } catch { throw new DocumentError("Could not load or save your file. Please try again."); }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (errors[detail.message]) throw new DocumentError(...errors[detail.message]);
    if (["PGRST202", "42P01", "42703"].includes(detail.code) || detail.message === "Bucket not found") throw new DocumentError("Library is temporarily unavailable. Please try again later.");
    throw new DocumentError("Could not read or save the document. Try again.");
  }
  return response;
}
export async function documentRpc<T>(operation: string, parameters: Record<string, unknown>): Promise<T> {
  return (await storageRequest(`/rest/v1/rpc/${operation}`, "POST", parameters)).json();
}
export function documentRecord(reference: string, id: string): Promise<StoredDocument> {
  return documentRpc("document_record", { p_trip: documentId(reference), p_id: documentId(id) });
}
export async function getDocument(reference: string, id: string): Promise<DocumentSummary> {
  const rows = await documentRpc<DocumentSummary[]>("document_list", { p_trip: documentId(reference), p_id: documentId(id) });
  if (!rows[0]) throw new DocumentError("This document could not be found in this trip.", 404);
  return rows[0];
}
export function publicDocument(record: DocumentRef): DocumentRef {
  return { id: record.id, name: record.name, mediaType: record.mediaType, size: record.size };
}
