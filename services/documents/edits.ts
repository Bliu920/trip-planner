import { z } from "zod";
import { MAX_TEXT_BYTES } from "@/lib/file-types";
import type { DocumentEdit } from "@/lib/documents/text";
export const documentOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("rename"), name: z.string().min(1).max(180) }),
  z.strictObject({ type: z.literal("replaceContent"), content: z.string().max(MAX_TEXT_BYTES) }),
  z.strictObject({ type: z.literal("replaceText"), oldText: z.string().min(1).max(MAX_TEXT_BYTES), newText: z.string().max(MAX_TEXT_BYTES) }),
]);
export type DocumentOperation = z.infer<typeof documentOperationSchema>;
export function applyDocumentOperations(current: DocumentEdit, input: DocumentOperation[]): DocumentEdit {
  const operations = z.array(documentOperationSchema).min(1).max(100).parse(input);
  const edit = structuredClone(current);
  for (const op of operations) {
    if (op.type === "rename") edit.name = op.name;
    else if (op.type === "replaceContent") edit.markdown = op.content;
    else {
      const first = edit.markdown.indexOf(op.oldText);
      if (first < 0 || edit.markdown.indexOf(op.oldText, first + 1) >= 0) throw new Error("The selected text must match exactly once. Read the current file and use a unique selection.");
      edit.markdown = edit.markdown.slice(0, first) + op.newText + edit.markdown.slice(first + op.oldText.length);
    }
  }
  return edit;
}
