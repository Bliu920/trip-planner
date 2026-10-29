# Markdown presentation

Status: implemented and verified locally.
Owner: safe Markdown display and scoped typography.
Updated: October 28, 2026.

## Boundary and usage

`lib/markdown/index.tsx` exports `MarkdownText({ text, id? })`. It renders a supplied string without fetching or persisting content. `markdown.css` owns its typography, code and table containers. The [chat response module](chat-response.md) uses it for assistant replies; user text and Library editing remain separate.

## Rendering contract

Uses [react-markdown](https://github.com/remarkjs/react-markdown) and [remark-gfm](https://github.com/remarkjs/remark-gfm), installed through npm. Supports semantic headings, emphasis, paragraphs, ordered/nested/unordered lists, quotes, links, code, GFM tables, task lists and footnotes. Incomplete streamed syntax renders through the same synchronous parser as complete text. Component mappings are stable between updates so streamed content does not recreate custom component types. Footnote IDs are scoped to each renderer instance.

Raw HTML is ignored with skipHtml. The library default URL transform filters unsafe protocols. External links open with noopener/noreferrer and no referrer; footnote hashes stay in the current page. There is no dangerouslySetInnerHTML or raw HTML plugin. These choices follow the upstream [API and safety guidance](https://github.com/remarkjs/react-markdown#security).

## Presentation

Body text inherits the surrounding chat size. Headings use a restrained hierarchy, lists have explicit markers, and code uses a monospace face. Wide code/table content scrolls inside its own keyboard-focusable region; the page remains within the viewport. Images stay within available width. Task checkboxes remain read-only. No syntax highlighter, math renderer or diagram extension is included.

## State, storage and operations

The string is supplied by the caller and remains authoritative. There is no new durable state, API, environment setting or migration. The component-local React ID exists only to scope generated footnote anchors. Dependencies are recorded in package.json and package-lock.json.

## Verification

Final lint, typecheck and all seven response tests passed. The actual ChatResponse rendering tests cover semantic elements, external link attributes, safe protocol filtering, raw HTML exclusion, user literal text, and partial streamed Markdown. Existing progress placement/count checks run alongside them through tests/chat-response.test.ts. Desktop and 390px browser review verified responsive formatting, nested lists, code overflow and unchanged single progress ownership. Screenshot /private/tmp/chat-markdown-preview.png. No live model calls or data mutations.

## Maintenance

Update this guide and the calling module guide with behavior changes. Follow the shared [maintenance contract](README.md#maintenance-contract).
