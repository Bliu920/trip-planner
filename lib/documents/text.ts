import { MAX_TEXT_BYTES } from "@/lib/file-types";
export const MAX_CONTEXT_BYTES = 24 * 1024;
export const MAX_MARKDOWN_BYTES = MAX_TEXT_BYTES;
export type EditableKind = "upload" | "planning_context" | "research" | "working";
export type TextDocument = {
  id: string;
  name: string;
  kind: EditableKind;
  revision: number;
  contentRevision: number;
  markdown: string;
  mediaType?: string;
};
export type DocumentEdit = {
  id: string;
  name: string;
  kind: EditableKind;
  expectedRevision: number;
  markdown: string;
  mediaType?: string;
};
