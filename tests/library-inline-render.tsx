import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

// Render client components safely.
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const { DocumentInlineDetail } = require("../lib/documents/controls") as typeof import("../lib/documents/controls");
const html = renderToStaticMarkup(<DocumentInlineDetail reference="trip" id="file" onClose={() => {}} />);
assert.match(html, /aria-label="Back to Library"/);
assert.match(html, /Loading document/);
assert.doesNotMatch(html, /role="dialog"|document-dialog-heading/);
const { DocumentEditor } = require("../lib/documents/editor") as typeof import("../lib/documents/editor");
const editor = renderToStaticMarkup(<DocumentEditor reference="trip" toolbar={false} />);
assert.match(editor, /<textarea[^>]*aria-label="File contents"/);
assert.doesNotMatch(editor, />Save<\/button>/);
console.log("Inline file renders in the content area.");
