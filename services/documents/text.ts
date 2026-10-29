import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  MAX_CONTEXT_BYTES,
  MAX_MARKDOWN_BYTES,
  type DocumentEdit,
  type TextDocument,
} from "@/lib/documents/text";
import { nameError, type DocumentSummary } from "@/lib/documents/types";
import { createdTextFormat, fileFormat, fileRenameError, fileBytesError, decodeText } from "@/lib/file-types";
import {
  checkDocumentOrigin,
  documentId,
  documentRpc,
  DocumentError,
  getDocument,
  storageRequest,
} from "./database";
import { BUCKET } from "./storage";

export type PreparedDocument = {
  id: string;
  document_id: string;
  content_revision: number;
  path: string;
  sha256: string;
  size: number;
  expected_revision: number;
  kind: string;
  author: "user" | "agent";
};
/** Shared by direct saves and AI staging. Rechecked against storage before publishing. */
export function validateDocumentEdit(edit: DocumentEdit, existing?: DocumentSummary) {
  const format = existing ? fileFormat(existing.mediaType) : createdTextFormat(edit.name, edit.kind);
  if (!format?.create || (!existing && edit.kind === "upload"))
    throw new DocumentError("Create Markdown, TXT or CSV files. PDFs and images are read-only.", 400);
  if (existing && (existing.status !== "ready" || existing.kind !== edit.kind || existing.revision !== edit.expectedRevision))
    throw new DocumentError("This file changed. Reload before saving your changes.", 409);
  if (edit.mediaType && edit.mediaType !== format.mime)
    throw new DocumentError("The file name and selected format must agree.", 400);
  const bytes = Buffer.from(edit.markdown, "utf8");
  const error = nameError(edit.name) ?? fileRenameError(edit.name, format.mime) ?? fileBytesError(format.mime, bytes);
  if (error) throw new DocumentError(error, 400);
  if (bytes.toString("utf8") !== edit.markdown)
    throw new DocumentError("This file contains invalid text characters.", 400);
  if (edit.kind === "planning_context" && (format.id !== "markdown" || bytes.length > MAX_CONTEXT_BYTES))
    throw new DocumentError("The Travel brief must be a Markdown file no larger than 24 KB.", 400);
  return { bytes, format };
}
export async function prepareDocument(
  reference: string,
  edit: DocumentEdit,
  author: "user" | "agent",
): Promise<PreparedDocument> {
  const existing = edit.expectedRevision > 0 ? await getDocument(reference, edit.id) : undefined;
  const { bytes, format } = validateDocumentEdit(edit, existing);
  // Reserve immutable content.
  const write = await documentRpc<PreparedDocument>("document_stage", {
    p_trip: documentId(reference),
    p_id: documentId(edit.id),
    p_write: randomUUID(),
    p_name: edit.name,
    p_kind: edit.kind,
    p_expected: edit.expectedRevision,
    p_size: bytes.length,
    p_hash: createHash("sha256").update(bytes).digest("hex"),
    p_author: author,
  });
  // Upload before publishing.
  await storageRequest(
    `/storage/v1/object/${BUCKET}/${write.path}`,
    "POST",
    bytes.toString("utf8"),
    `${format.mime}; charset=utf-8`,
  );
  if (
    !(await documentRpc<boolean>("document_upload_complete", {
      p_trip: reference,
      p_write: write.id,
    }))
  )
    throw new DocumentError(
      "The document edit expired. Reload and retry.",
      409,
    );
  return write;
}
export async function publishDocument(
  reference: string,
  write: PreparedDocument,
) {
  return documentRpc<DocumentSummary>("document_publish", {
    p_trip: documentId(reference),
    p_write: documentId(write.id),
  });
}
export async function readTextDocument(
  reference: string,
  id: string,
  revision: number | null = null,
): Promise<TextDocument> {
  const document = await getDocument(reference, id);
  if (
    fileFormat(document.mediaType)?.editor !== "text" ||
    !document.kind
  )
    throw new DocumentError("This file is not an editable text document.", 400);
  const version = await documentRpc<{
    revision: number;
    path: string;
    sha256: string;
    size: number;
  }>("document_version", {
    p_trip: documentId(reference),
    p_id: documentId(id),
    p_revision: revision,
  });
  const response = await storageRequest(
    `/storage/v1/object/authenticated/${BUCKET}/${version.path}`,
  );
  const reader = response.body?.getReader();
  if (!reader)
    throw new DocumentError("The document content could not be read.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_MARKDOWN_BYTES || size > version.size) {
      await reader.cancel();
      throw new DocumentError(
        "The document content does not match its saved version.",
      );
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (
    size !== version.size ||
    createHash("sha256").update(bytes).digest("hex") !== version.sha256
  )
    throw new DocumentError(
      "The document content does not match its saved version.",
    );
  const textError = fileBytesError(document.mediaType, bytes);
  if (textError) throw new DocumentError(textError, 400);
  const current = await getDocument(reference, id);
  if (current.status !== "ready")
    throw new DocumentError("This document is no longer available.", 410);
  if (revision === null && (current.contentRevision !== version.revision || current.revision !== document.revision))
    throw new DocumentError("This file changed while loading. Reload and try again.", 409);
  return {
    id,
    mediaType: document.mediaType,
    name: document.name,
    kind: document.kind,
    revision: document.revision,
    contentRevision: version.revision,
    markdown: decodeText(bytes),
  };
}
export async function handleDocumentText(
  request: Request,
  reference: string,
  id?: string,
) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    checkDocumentOrigin(request);
    reference = documentId(reference);
    if (request.method === "GET" && id) {
      const raw = new URL(request.url).searchParams.get("revision");
      if (
        raw !== null &&
        (!/^\d+$/.test(raw) ||
          Number(raw) < 1 ||
          !Number.isSafeInteger(Number(raw)))
      )
        throw new DocumentError("Reload the document before editing.", 400);
      return Response.json(
        await readTextDocument(
          reference,
          documentId(id),
          raw === null ? null : Number(raw),
        ),
        { headers },
      );
    }
    if (!["POST", "PUT"].includes(request.method))
      throw new DocumentError("Unsupported document operation.", 405);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new DocumentError("The document could not be read. Reload and try again.", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new DocumentError("Document text is required.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1572864) {
        await reader.cancel();
        throw new DocumentError("The document is too large.", 413);
      }
      chunks.push(value);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new DocumentError("The document could not be read. Reload and try again.", 400);
    }
    if (
      !body ||
      typeof body.markdown !== "string" ||
      typeof body.name !== "string" ||
      !["upload", "planning_context", "research", "working"].includes(body.kind) ||
      (body.mediaType !== undefined && typeof body.mediaType !== "string") ||
      !Number.isSafeInteger(body.expectedRevision) ||
      body.expectedRevision < 0
    )
      throw new DocumentError("The document edit is invalid.", 400);
    const edit: DocumentEdit = {
      id: documentId(id ?? body.id ?? randomUUID()),
      name: body.name,
      kind: body.kind,
      markdown: body.markdown,
      mediaType: body.mediaType,
      expectedRevision: body.expectedRevision,
    };
    const write = await prepareDocument(reference, edit, "user");
    return Response.json(await publishDocument(reference, write), { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof DocumentError
            ? error.message
            : "Could not read or save document text.",
      },
      { status: error instanceof DocumentError ? error.status : 503, headers },
    );
  }
}
