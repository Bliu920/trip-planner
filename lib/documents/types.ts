import { FILE_FORMATS, MAX_BINARY_BYTES, fileMetadataError } from "@/lib/file-types";
/** Public document contract. Update docs/modules/library.md when changing it. */
export const MAX_FILE_BYTES = MAX_BINARY_BYTES;
export const MAX_FILES = 3;
export const MAX_TRIP_FILES = 30;
export const MAX_CONTEXT_FILES = 6;
export const FILE_TYPES = FILE_FORMATS.map(format => format.mime);
export type DocumentRef = { id: string; name: string; mediaType: string; size: number };
export type DocumentStatus = "pending" | "ready" | "deleting" | "deleted";
export type DocumentSource = "chat" | "starter" | "library";
export type DocumentSummary = DocumentRef & {
  kind?: "upload" | "planning_context" | "research" | "working";
  contentRevision?: number;
  originalName: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  revision: number;
  usages: { messageId: string; conversationId: string }[];
};
export type DraftFile = { id: string; file: File; saved?: false } | {
  id: string; file: { name: string; type: string; size: number }; saved: true;
};
export function nameError(name: string): string | null {
  return !name.trim() || name.length > 180 || /[\x00-\x1f\x7f]/.test(name)
    ? "Use a filename between 1 and 180 characters without control characters." : null;
}
export function fileError(file: { name: string; type: string; size: number }): string | null {
  const error = nameError(file.name);
  return error ?? fileMetadataError(file.name, file.type, file.size);
}
