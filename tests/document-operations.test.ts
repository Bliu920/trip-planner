import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDocumentOperations } from "../services/documents/edits";
const doc = { id: "file", name: "Notes.md", kind: "working" as const, expectedRevision: 1, markdown: "# Food\r\nPasta\r\n\r\n# Stay\r\nCentral\r\n" };
test("exact Document edits preserve bytes outside the selected text", () => {
  const next = applyDocumentOperations(doc, [{ type: "replaceText", oldText: "Pasta", newText: "Pizza" }, { type: "rename", name: "Trip notes.md" }]);
  assert.equal(next.markdown, doc.markdown.replace("Pasta", "Pizza")); assert.equal(next.expectedRevision, 1);
  assert.equal(doc.name, "Notes.md");
});
test("ambiguous or absent text fails atomically", () => {
  for (const oldText of ["\r\n", "absent", ""]) assert.throws(() => applyDocumentOperations(doc, [{ type: "rename", name: "Changed.md" }, { type: "replaceText", oldText, newText: "x" }]));
  assert.equal(doc.name, "Notes.md");
});
