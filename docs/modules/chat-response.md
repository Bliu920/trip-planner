# Chat response presentation

## Frontend synchronization ownership

October 30, 2026: internal cleanup preserves the chat wire contract, SDK lifecycle, polling interval, errors and response UI. `lib/chat/index.ts` remains the public entry point. `use-chat.ts` owns lifecycle and request-version guards. `transport.ts` converts the latest SDK message into text and canonical file/place IDs. `history.ts` owns history requests and removing selected documents. `reconcile.ts` owns pending-message confirmation, prior-attempt activity merging and recognition of verified saves.

The hook explicitly returns Workspace's consumed properties instead of spreading the full SDK object. Response rendering remains in `lib/chat-response/`; save notifications remain deduplicated in the hook. Failed/staged tool results do not count as persisted changes. `tests/chat-sync.test.ts` covers those boundaries without model or database calls. See [Frontend reading guide](frontend.md).

## Current blocker and terminal cause

October 29, 2026: failure presentation separates an unfinished trip estimate from earlier corrected Plan input errors. A missing initial estimate uses BUDGET_EMPTY; its traveller-facing explanation says that costs were never added and the itinerary/budget were not saved. A narrowly recognized historical host message also maps B004's original WORKSPACE_ERROR to this explanation without rewriting stored history or exposing raw tool instructions.

The compact failure payload may carry blocker, safe accepted-draft counts and a separate termination detail. These describe different facts: why saving was blocked, what work existed in memory, and why execution ended. Provider-credit errors and timeouts retain their own explanations. A successful receipt or uncertain outcome must not be converted into a definite save failure. Historical records without sufficient evidence remain unclassified.

Verification: 392 offline tests, lint and typecheck passed. The historical B004 browser was reloaded without retrying generation; it now shows the missing-cost explanation. Original saved messages, failure metadata and test results were not rewritten.

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

### Conversation scrolling

October 30, 2026: Workspace wraps every direct conversation row in the existing shadcn `MessageScrollerItem`. Transcript rows use the projected stable key as both React key and `messageId`; user rows set `scrollAnchor`. Starter, welcome and error/notice rows also have item boundaries, with only the starter user row anchoring. The placeholder, streamed response and saved reply retain the same reply-row identity.

`Conversation` continues to own the provider's `autoScroll`, initial end position and latest-message button. The native scroller owns following, pause on user scrolling and resumption at the end. Do not add a competing scroll effect. Product-specific message-reference navigation remains unchanged. See the [official composition contract](https://ui.shadcn.com/docs/components/base/message-scroller).

The isolated long-chat fixture reproduced a new turn remaining offscreen after reading earlier messages. With row registration, the new user turn becomes visible and streamed growth follows. Browser checks verified initial end positioning, pause while reading history, latest-button and keyboard return, and final saved reply positioning. An observed additional chunk left the paused reading row and its viewport offset unchanged; following and completed states measured a zero-pixel bottom gap. No model requests or remote writes were used.

`tests/chat-scroll.test.ts` renders real Workspace chat with isolated persistence and checks user anchors, stable pending/streamed row identity and non-anchoring status rows. `tests/chat-scroll-fixture.tsx` supports repeating the browser checks through a temporary local page. Production routes do not mount it.

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

## Actionable generation diagnostics

October 29, 2026: a browser run exposed a rate-limit error overwritten by a later request cancellation, followed by a separate unresolved tool-input failure. The stream now retains an already classified provider error when a later disconnect arrives. Credit, quota, token rate, timeout and explicit cancellation remain distinct.

The agent records invalid tool inputs at the SDK validation boundary, before they are reduced to display text. agent_error retains an allowlisted error class/cause chain, known tool name, schema field paths and validation codes with corrective instructions. Dynamic item keys are replaced with a wildcard. Raw input values, arbitrary error messages, model text and provider bodies are not logged. The same structured corrections reach the next planning step. This hook does not call a repair model or silently rewrite user input.

Terminal tool-choice violations record the enforced choice and returned content types. Incomplete saved replies retain a separate termination summary and last input failure; an input trigger is not confused with the final terminating exception. The full safe diagnostic remains in server logs. Saved summaries are bounded below the existing 1,000-character SQL envelope, with a limited field-error subset. Consumer copy describes an inability to correct and save details without exposing internal tool/schema names.

agent_run_started records the selected model and step allowance. agent_step_finished records step, finish reason and available input/cache/output/reasoning token counts, without request content. These are actual reported counts when available, not cost estimates. Ordinary model errors cannot be reconstructed retroactively for old runs that did not retain them.

Tests reproduce precise invalid-field feedback, forced-tool termination persistence, bounded SQL diagnostics and a provider error followed by client cancellation. The original Terra browser failures remain separately documented under docs/tasks/main-browser-walkthrough. A subsequent user-authorized Luna browser test is recorded there rather than through a separate scoring model.

## Verified unfinished progress

October 30, 2026: failed/interrupted replies may carry progressSaved only after verifying the current unexpired private snapshot against the current trip revision. Existing Retry resumes that exact input. The original timeout, cancellation or provider explanation remains visible; preserved progress does not imply a saved public itinerary. Explicit request cancellation takes precedence over an otherwise opaque transport OtherError, while concrete provider/quota/storage/output-limit evidence stays classified. Startup recovery conflicts and invalid snapshots retain safe diagnostic codes before any provider call.

## Storage boundary diagnostics

October 30, 2026: chat_persistence_error identifies heartbeat, activity entry, activity completion, final reply or background stream consumption. It retains only a safe operation name, HTTP status and database code, with no raw message, request body or secret. A historical storage_error without those facts cannot be assigned an exact boundary retroactively. B035's successful publication and failed closing status remain separate recorded facts.

Reply and activity writes may retry once after a non-definitive network, timeout or server failure, using the identical generation and entry identity. An uncertain terminal reply write is read back before retrying. Definitive client rejection and stale generation are not retried. Corrected schema failures remain separate from persistence failures.

Activity completion is auxiliary history. Failure to finish that history is logged but does not turn an otherwise verified saved itinerary and completed reply into a false failure. Mid-run progress or reply persistence failure still stops execution with its actual cause. Deterministic fault-injection tests cover lost responses, duplicate prevention, replaced generations and independent provider errors. All 466 offline tests, lint and typecheck pass; B036 verifies normal Retry after a published operation with unchanged Plan, Budget and documents.

## Verified save without model prose

October 30, 2026: a Rome/Naples user request commits on the final allowed step (50), leaving no model response for the closing phase. When the final state and manifest both verify this operation's saved receipt and no model text exists, the host writes a short acknowledgment from that receipt and the host-calculated Budget display, including over-limit or incomplete-price warnings. It explicitly says the detailed written summary was not completed. It does not invent itinerary details or use the model-authored commit summary as instructions.

The actual timeout, cancellation, provider failure or step limit remains in the failure/status data; the acknowledgment does not claim the model finished. No extra provider request, mutation, counter extension or user-trip rewrite occurs. A read-only operation, different-operation receipt, unverified save or unpublished draft cannot receive this acknowledgment. Normal nonempty model replies are preserved. chat_saved_reply_fallback logs only operation identity, cause, count and saved state.
