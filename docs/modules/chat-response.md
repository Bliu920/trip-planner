# Chat response presentation

Status: implemented; regression and browser verification recorded below.
Owner: transcript projection, response order and live progress.
Updated: October 29, 2026.

## Boundary and public API

`lib/chat-response/index.ts` exposes `buildTranscript`, `ChatResponse`, their types and `MessageText`. `state.ts` projects lifecycle and saved/live messages into presentation items. `view.tsx` owns all response content ordering. `text.tsx` owns user-text disclosure. The shared [Markdown renderer](markdown.md) renders assistant text, including streamed partial responses. Workspace owns conversation selection, input and transport integration, and delegates all transcript items to this module.

Inputs are existing chat messages and lifecycle flags. Outputs are derived presentation items containing a stable key, original message, active flag, progress label and latest-item flag. This module stores no chat data and changes no backend, model or database contracts. Original messages, receipts and activity entries remain authoritative. No additional request, polling loop, migration or environment setting is required.

## Invariants

- Exactly one work block belongs to the current assistant response. It stays last in the response body, after Markdown, receipts, places, files and failure copy.
- The keyed WorkProgress owns the only active spinner. While working, its default preview contains the latest four current-attempt steps. It does not expose a separate full-history list or independent progress row.
- Clicking the header expands the existing full activity history. Completion collapses the default view to Worked for XXs, preserving explicit expansion. Stopped/failed replies use honest labels.
- Stable response keys derive from the preceding user ID and reply position. Placeholder, streamed reply and retry use the same shell. Earlier turns retain keys when later turns arrive.
- Completed work retains a collapsed disclosure, without a spinner. Historical records without trustworthy elapsed time omit seconds. Active header timers stop at completion/unmount.
- Idle refreshes do not invent new work. Older retry attempts cannot supply the latest run's timing or preview.
- User text retains its literal six-line disclosure; assistant text renders Markdown. Speaker names remain accessible without visible labels. Original Markdown copying and file/source navigation remain available.

## Integration

Workspace calls buildTranscript once and renders ChatResponse with the projected key. ChatResponse delegates its final body child to the [work disclosure module](work-progress.md). Future response content belongs before that section. WorkProgress owns activity expansion and the sole live indicator; ActivityHistory is mounted inside its expanded content and retains sources, documents and static per-step status icons.

The latest run marker comes from activityRun and visible steps from activityEntries. Optional host timing travels through the existing activity JSON, not another endpoint or client-maintained history.

## Regression protection

The response suite covers lifecycle identity and actual rendered output across 12 phases, plus Markdown, files, places, receipts and provider-limit recovery. Ownership guards reject a second spinner/history renderer in Workspace or ChatResponse. Work regressions enforce trailing section placement, one active spinner, four preview items, collapsed completed history and saved duration. Activity/SDK tests verify host timing survives snapshots and retry generations.

## Verification

Current work-disclosure verification is maintained in [work-progress.md](work-progress.md) and the October 29 task outcome. It supersedes the earlier standalone trailing-spinner presentation. No live model call, migration or remote project mutation is required.

## Limits

No test can prevent a future editor from deliberately removing a contract or bypassing the test suite. This design makes the ownership explicit and turns the observed regression into a failing test. It does not promise a fixed screen coordinate while the user scrolls.

## Markdown replies

Assistant bodies render Markdown rather than pre-wrapped source text. Headings, emphasis, lists, links, quotes, inline/fenced code, tables and task lists are supported. User text still uses literal MessageText with its six-line disclosure. Message IDs and copyText retain their existing meanings; copied replies contain the original Markdown. Progress and activity history stay outside the Markdown body and keep their owned order.

The actual-render regression now checks semantic Markdown elements, safe links, raw HTML exclusion, literal user messages and incomplete streamed headings, links, code fences and tables. Browser review at desktop and 390px confirmed readable formatting and contained code scrolling: a 1,032px code line stayed within a 317px mobile block without widening the page. The grouped work section is the last body element, following the October 29 disclosure decision. No browser warnings/errors. Temporary fixture removed; screenshot /private/tmp/chat-markdown-preview.png.

## Change history

- October 29, 2026: Grouped all activity inside one trailing work disclosure with a four-step active preview, full expansion, persisted timing and collapsed completion header. This supersedes the standalone spinner and exposed history presentation.

- October 29, 2026: Moved the sole keyed live-progress row to the response tail. Updated regressions and maintained guides to require trailing placement, while retaining one owner, one spinner and stable identity. This supersedes the earlier top-position decision.

- October 28, 2026: Added assistant-only Markdown rendering through lib/markdown, preserving user disclosure, progress ownership, text navigation and original-source copying.

- October 28, 2026: Fixed competing progress renderers. Moved reply presentation and text disclosure into one module, preserved durable history, and added rendered-state regression protection.


## Provider limit reasons

HTTP 429 remains the existing provider_limit failure code for SQL and historical compatibility. New failures optionally retain a safe providerReason and Retry-After seconds. Credit exhaustion, spending caps, assigned usage limits, ambiguous quota errors and temporary request throttling produce different traveller-facing recovery instructions. Only temporary throttling recommends waiting, including a valid server minimum delay. An explicitly oversized token request instead asks the app owner to adjust request size or limits; repeating the same oversized request after waiting cannot repair it. Unknown or historical 429 responses retain their ambiguous wording rather than guessing a billing cause. The same saved data drives live and restored response copy.

The host logs chat_provider_error with allowlisted status/code/type and a numeric retry delay. Raw error messages, requests, response bodies, keys and arbitrary headers are excluded. There are no automatic retry or model changes. Billing access cannot be repaired by changing the planning step allowance. No database migration is required because the existing failure JSON accepts these bounded optional fields.
