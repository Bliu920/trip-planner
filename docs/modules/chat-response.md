# Chat response presentation

Status: implemented; regression and browser verification recorded below.
Owner: transcript projection, response order and live progress.
Updated: October 28, 2026.

## Boundary and public API

`lib/chat-response/index.ts` exposes `buildTranscript`, `ChatResponse`, their types and `MessageText`. `state.ts` projects lifecycle and saved/live messages into presentation items. `view.tsx` owns all response content ordering. `text.tsx` owns user-text disclosure. The shared [Markdown renderer](markdown.md) renders assistant text, including streamed partial responses. Workspace owns conversation selection, input and transport integration, and delegates all transcript items to this module.

Inputs are existing chat messages and lifecycle flags. Outputs are derived presentation items containing a stable key, original message, active flag, progress label and latest-item flag. This module stores no chat data and changes no backend, model or database contracts. Original messages, receipts and activity entries remain authoritative. No additional request, polling loop, migration or environment setting is required.

## Invariants

- Exactly one live progress row belongs to the current assistant response. It is the first child, immediately below its preceding user turn and before history, text, files or receipts.
- The same row stays mounted, at 28px height, through submitted, tool execution, gaps, streamed text and saved-history reconciliation. Only its label changes.
- Stable response keys derive from the preceding user ID and reply position. Placeholder, streamed reply and retry use the same key. Earlier turns retain keys when later turns arrive.
- Durable activity history uses static status icons and disclosures. It never renders a spinner or a separate live announcement. Running history remains inspectable but cannot replace the response progress row.
- Completion, failure and stop remove the row. Remote active replies recover the same presentation from saved state. Loading and starter preparation use a single placeholder shell.
- An idle refresh of a completed reply does not pretend the AI is working. History errors do not revive remote progress. Older retry attempts cannot supply the latest attempt's running label.
- Copy, retry, failure explanations, save receipts, place references and file actions remain within the response. User messages retain 75% maximum bubble width and six-line disclosure. Speaker names remain accessible without visible labels.

Position is relative to the response within the transcript. Normal scrolling may move the transcript in the viewport; this is not a separate progress location.

## Integration

Workspace calls `buildTranscript(messages, lifecycle)` once and renders `ChatResponse` using each returned key. Callers must not manually place progress beside the composer, after response text or inside activity history. Consumers of this module receive progress data rather than deciding where it renders. Future content belongs after the progress row through the owned response view.

The existing `ActivityHistory` still owns sources, saved-document opening, history status labels and interruption presentation. Its public `active` flag determines whether unfinished history is interrupted, not whether it owns live progress.

## Regression protection

`tests/chat-response.test.ts` covers state transitions, identity, multiple turns, retry attempts and idle/error behavior. It also runs `tests/chat-response-render.tsx` with normal client React conditions to render the actual components across 12 scenarios. Those assertions enforce exactly one spinner, first-child placement, fixed row height, retained history and no terminal spinner.

Architecture checks reject indicators or activity rendering reintroduced directly in Workspace and reject spinners or live announcements in ActivityHistory. These are intentional ownership constraints, not snapshots of incidental markup. Run the normal `npm test` suite after editing chat, activity or response presentation. No new test dependency is required.

## Verification

Final lint and typecheck passed. All 33 targeted response, chat, activity and workspace-layout tests passed. The response regressions also passed after adding coverage for live replies without metadata during reconciliation. Browser review used the actual Conversation, ChatResponse and Composer across 12 lifecycle snapshots at desktop and 390px mobile widths. The same progress DOM node remained mounted through the first seven active phases. Every active row stayed 28px high and first in the assistant response. Its offset within the transcript stayed 82.796875px on desktop and 106.59375px on mobile. Composer position, focus, the 15-character draft and caret were unchanged throughout all 12 phases. Terminal phases had zero live rows. There was no mobile horizontal overflow and no browser warnings or errors. Screenshot: /private/tmp/chat-response-progress.png. Temporary fixture removed. No paid model calls or live trip writes.

## Limits

No test can prevent a future editor from deliberately removing a contract or bypassing the test suite. This design makes the ownership explicit and turns the observed regression into a failing test. It does not promise a fixed screen coordinate while the user scrolls.

## Markdown replies

Assistant bodies render Markdown rather than pre-wrapped source text. Headings, emphasis, lists, links, quotes, inline/fenced code, tables and task lists are supported. User text still uses literal MessageText with its six-line disclosure. Message IDs and copyText retain their existing meanings; copied replies contain the original Markdown. Progress and activity history stay outside the Markdown body and keep their owned order.

The actual-render regression now checks semantic Markdown elements, safe links, raw HTML exclusion, literal user messages and incomplete streamed headings, links, code fences and tables. Browser review at desktop and 390px confirmed readable formatting and contained code scrolling: a 1,032px code line stayed within a 317px mobile block without widening the page. The progress row remained first and 28px high. No browser warnings/errors. Temporary fixture removed; screenshot /private/tmp/chat-markdown-preview.png.

## Change history

- October 28, 2026: Added assistant-only Markdown rendering through lib/markdown, preserving user disclosure, progress ownership, text navigation and original-source copying.

- October 28, 2026: Fixed competing progress renderers. Moved reply presentation and text disclosure into one module, preserved durable history, and added rendered-state regression protection.
