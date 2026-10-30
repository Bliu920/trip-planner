# Response work disclosure

Status: implemented; locally verified.
Owner: one trailing work block, elapsed label, preview and expansion.
Updated: October 29, 2026.

## Boundary and information

`lib/work-progress/index.ts` exports WorkProgress. `view.tsx` owns disclosure state, a cleaned-up clock subscription, accessible controls and composition. `timing.ts` owns duration/label and latest-four projection. `work.css` owns compact row geometry. ChatResponse places this block after all response content and delegates activity presentation to it.

Inputs are existing safe ActivityEntry steps, the latest optional run marker, current reply lifecycle and failure duration when available. Full activity records and message state remain authoritative. Preview and expansion are views, not duplicate saved history. The module does not fetch or save data. The existing ActivityHistory supplies expanded details, sources and scoped document navigation.

## Interaction

- While active, show one header spinner, Working and a live elapsed label when the host start timestamp is known. Show the newest four current-attempt action groups in chronological order as compact single-line descriptions. Consecutive matching action titles accumulate a count, for example Review planning guidance (2). Group before selecting four rows so repeated calls do not push distinct recent actions out of view. Intervening actions and attempt changes break groups. Expanded history uses the same grouping and retains individual evidence.
- Up to four initial steps grow naturally. Once four exist, replacing older preview items preserves height. There are no independent preview spinners or cards.
- Clicking the whole header expands all recorded steps, including previous attempts. Clicking again restores the active preview or completed collapsed state. Enter and Space work through the native button and aria-expanded/aria-controls.
- On completion, the default view becomes one collapsed Worked for duration header. Explicitly expanded history remains open because expansion is user state, not derived from the lifecycle. Completion freezes the saved elapsed duration.
- Failed/interrupted replies say Could not finish after duration or Stopped after duration. These labels do not imply a save succeeded. Existing save receipts remain authoritative.
- All work labels share one duration formatter: below 60 seconds use 59s; from 60 seconds use minutes and remaining seconds, such as 1m, 1m 1s or 2m 15s. Exact minutes omit 0s, and partial seconds are rounded down. Saved milliseconds and live clock behavior remain unchanged.
- Legacy history without timing says Worked, Stopped or Could not finish without invented seconds. Activity-free legacy text does not acquire an unnecessary disclosure. Empty expanded new work says No steps recorded yet.

The entire section stays last in the response body. Its header has a 28px desktop minimum and 44px mobile hit area. Preview rows stay 24px high. A shared work-branch style places a 1px light vertical guide under the spinner center, with a 24px content inset. Both the four-step preview and expanded history use this branch so their contents read as children of the Working header. The guide disappears when the completed disclosure is collapsed. A bounded, static preview prevents unrelated history growth from shifting content. Expanded history intentionally grows with the work. The component preserves explicit expansion during completion/retry. No new animation is introduced.

## Timing and storage

`services/assistant/progress/ProgressRecorder.start()` records a hidden run marker before provider execution through the existing guarded chat_record_activity RPC. The marker uses kind=run, startedAt, the generation attempt and existing bounded entry fields. finish() records the elapsed milliseconds and final status after work verification. Terminal markers cannot be overwritten. The existing snapshot streams and reloads this record.

The marker is excluded by activityEntries and accessed separately by activityRun, so it never appears as a user-visible step. Retries have independent markers and use the newest marker for the header. Expanded steps retain prior attempts; previews show only the latest run's steps. Abandoned work may have a start but no trustworthy finish; inactive work then omits duration. Existing failure elapsedMs is a fallback for early failures.

No database migration is needed because activity rows already store bounded JSON and the existing RPC accepts optional fields. No new endpoint, model, package, scheduler or environment setting is required. The timer uses host timestamps while active and saved elapsedMs when finished, not time since the page opened. The visible clock ticks once per second; the live announcement describes the current operation without announcing every second. Timers stop on completion and unmount.

## Verification

October 30 duration formatting: 15 work/response tests, lint and typecheck passed. Coverage includes 59.999s, exactly 60s, minute rollovers, whole-minute zero omission, long durations, all four run states and actual rendered labels. Formatting changes do not alter stored duration or clock subscriptions.

Automated regressions cover latest-four order, retry filtering, legacy labels, clock skew, immutable completion duration, safe run-marker decoding, SQL persistence/reload, actual SDK streaming and retries. Actual response rendering enforces one trailing work section, one active spinner, four preview lines, hidden completed history, persisted Worked for 24s and Markdown/file/receipt ordering. Provider-limit recovery checks remain intact.

Final lint/typecheck, whitespace validation and all 36 targeted response, work-progress, activity and SDK chat tests passed. Browser checks use actual ChatResponse, Conversation and Composer with synthetic data. Verified desktop/mobile expansion, auto-collapse, explicit expansion surviving completion, keyboard controls, source details, saved-file actions, stopped/failed labels and composer draft/focus/caret. The bounded four-step preview now measures 132px on desktop and 148px at 390px after the hierarchy refinement; no horizontal overflow. Timing persistence uses local SQL; no live model calls or remote project changes. Final previews: /private/tmp/work-running.png and /private/tmp/work-completed.png. The temporary fixture and browser tabs were removed and the viewport reset. A development-only fixture timestamp read was moved out of render; the final fixture reload had no browser errors or warnings.

October 29 visual refinement: verified preview and expanded nesting on desktop and 390px mobile, a computed 1px guide and 24px inset, six-step full history, and no visible branch after completion collapses. Existing response/work regressions passed (11 tests). Screenshot: /private/tmp/work-branch-preview.png. Temporary fixture removed; no browser warnings/errors.

## Limitations and maintenance

October 29 consecutive-count verification: 14 focused work/response tests, lint and typecheck passed. Real rendered output verifies one counted preview/history row with all original details, failure states, safe source links and a single button per referenced document. Timing, trailing placement, completion collapse and spinner ownership remain covered by the existing regressions.

The existing message-level 600-entry bound also counts one timing marker per attempt. Historic runs without timing cannot display an invented duration. This module controls visible activity presentation, not hidden model reasoning or execution architecture.

Update this guide with module/integration changes under the shared [maintenance contract](README.md#maintenance-contract).
