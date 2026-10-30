// Maintenance guide: docs/modules/library.md.
import "server-only";
import { fileRenameError, fileFormat } from "@/lib/file-types";
import { nameError, type DocumentSummary } from "@/lib/documents/types";
import { getTrip, TripError } from "@/services/projects/trips";
import { checkDocumentOrigin, documentId, documentRpc, DocumentError, getDocument, publicDocument } from "./database";
import { deleteDocument, finalizeDocument, readDocumentContent, reserveDocument } from "./lifecycle";

export { DocumentError, getDocument } from "./database";
export { readDocumentContent } from "./lifecycle";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

async function metadata(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new DocumentError("Send file details as JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new DocumentError("File details are missing.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) { await reader.cancel(); throw new DocumentError("File details are too large.", 413); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new DocumentError("File details are invalid.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DocumentError("File details are invalid.", 400);
  return body;
}
function failure(error: unknown) {
  const known = error instanceof DocumentError || error instanceof TripError;
  return Response.json({ error: known ? error.message : "Could not read or save the document. Try again." }, { status: known ? error.status : 503, headers });
}
async function content(reference: string, id: string, inline: boolean) {
  const { document, bytes } = await readDocumentContent(reference, id);
  return new Response(new Uint8Array(bytes), { headers: { ...headers,
    "Content-Type": document.mediaType, "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox", "X-Frame-Options": "SAMEORIGIN",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.name).replace(/'/g, "%27")}`,
  } });
}
export async function handleDocuments(request: Request, reference: string, id?: string, action?: "content" | "finalize") {
  try {
    // Validate trip access.
    checkDocumentOrigin(request);
    reference = (await getTrip(reference)).reference;
    if (id) id = documentId(id);
    if (!id && request.method === "GET") return Response.json(await documentRpc("document_list", { p_trip: reference }), { headers });
    if (!id && request.method === "POST") return Response.json(await reserveDocument(reference, await metadata(request)), { headers });
    if (!id) throw new DocumentError("A document reference is required.", 400);
    // Dispatch document operations.
    if (action === "content" && request.method === "GET") return await content(reference, id, new URL(request.url).searchParams.get("inline") === "1");
    if (action === "finalize" && request.method === "POST") return Response.json(await finalizeDocument(reference, id), { headers });
    if (!action && request.method === "GET") return Response.json(await getDocument(reference, id), { headers });
    if (!action && ["PATCH", "DELETE"].includes(request.method)) {
      const body = await metadata(request);
      if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 1) throw new DocumentError("Reload the document before changing it.", 400);
      if (request.method === "DELETE") {
        const document = await deleteDocument(reference, id, body.revision as number);
        return Response.json(document, { status: document.status === "deleted" ? 200 : 202, headers });
      }
      if (typeof body.name !== "string") throw new DocumentError("A document name is required.", 400);
      const record = await getDocument(reference, id);
      const error = nameError(body.name) ?? fileRenameError(body.name, record.mediaType);
      if (error) throw new DocumentError(error, 400);
      await documentRpc("document_mutate", { p_trip: reference, p_id: id, p_action: "rename", p_revision: body.revision, p_name: body.name.trim() });
      return Response.json(await getDocument(reference, id), { headers });
    }
    throw new DocumentError("This document action is not supported.", 405);
  } catch (error) { return failure(error); }
}
export async function handleLegacyAttachments(request: Request, reference: string, id?: string) {
  try {
    // Adapt existing upload entrypoints.
    checkDocumentOrigin(request);
    reference = (await getTrip(reference)).reference;
    if (id) id = documentId(id);
    if (!id && request.method === "POST") {
      const result = await reserveDocument(reference, await metadata(request));
      return Response.json({ attachment: publicDocument(result.document), ready: result.ready, uploadUrl: result.uploadUrl }, { headers });
    }
    if (!id && request.method === "GET") {
      const ids = new URL(request.url).searchParams.get("ids")?.split(",").map(documentId) ?? [];
      if (!ids.length || ids.length > 3 || new Set(ids).size !== ids.length) throw new DocumentError("File references are invalid.", 400);
      const records = await documentRpc<DocumentSummary[]>("document_list", { p_trip: reference });
      const selected = ids.map(id => records.find(record => record.id === id && record.status === "ready" && fileFormat(record.mediaType)?.ai));
      if (selected.some(record => !record)) throw new DocumentError("A starting file is unavailable. Open Library and choose it again.", 409);
      return Response.json(selected.map(record => publicDocument(record!)), { headers });
    }
    if (id && request.method === "PATCH") return Response.json(publicDocument(await finalizeDocument(reference, id)), { headers });
    if (id && request.method === "GET") return await content(reference, id, false);
    throw new DocumentError("This document action is not supported.", 405);
  } catch (error) { return failure(error); }
}
// Expose editable documents.
export { validateDocumentEdit, prepareDocument, publishDocument, readTextDocument, handleDocumentText } from "./text";
export type { PreparedDocument } from "./text";
export const listTripDocuments = (reference: string) => documentRpc<DocumentSummary[]>("document_list", { p_trip: documentId(reference) });
export { applyDocumentOperations, documentOperationSchema } from "./edits";
export type { DocumentOperation } from "./edits";
