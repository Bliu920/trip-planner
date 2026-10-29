import "server-only";
import { fileFormat, fileBytesError } from "@/lib/file-types";
import { DocumentError, documentRpc, storageRequest, type StoredDocument } from "./database";

export const BUCKET = "trip-attachments";
export async function signedUpload(record: StoredDocument) {
  const body = await (await storageRequest(`/storage/v1/object/upload/sign/${BUCKET}/${record.path}`, "POST", {})).json();
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const url = new URL(`/storage/v1${body.url}`, base);
  if (url.origin !== new URL(base).origin || !url.searchParams.get("token")) throw new DocumentError("Could not prepare this upload.");
  return url.toString();
}
export async function readBytes(record: StoredDocument) {
  const format = fileFormat(record.mediaType);
  if (!format) throw new DocumentError("This file type is not supported by Library.", 415);
  const response = await storageRequest(`/storage/v1/object/authenticated/${BUCKET}/${record.path}`);
  const reader = response.body?.getReader();
  if (!reader) throw new DocumentError("The uploaded file is empty.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > format.maxBytes || size > record.size) { await reader.cancel(); throw new DocumentError("The uploaded file does not match its expected size.", 400); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (size !== record.size) throw new DocumentError("This file does not match its expected size.", 400);
  const error = fileBytesError(record.mediaType, bytes);
  if (error) throw new DocumentError(error, 400);
  return bytes;
}
export async function deleteBytes(record: StoredDocument) {
  // Use the Storage API.
  const paths = await documentRpc<string[]>("document_paths", { p_trip: record.trip_reference, p_id: record.id });
  await storageRequest(`/storage/v1/object/${BUCKET}`, "DELETE", { prefixes: paths.length ? paths : [record.path] });
}
