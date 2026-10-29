# UI principles and review requirements

These are implementation rules for this project's frontend, recorded after the rejected starter page on 2026-10-25. Read them before changing a page or shared input component.

## What went wrong

The first starter treated an app entry screen like an introduction: it added a subtitle, repeated trip duration, input guidance, keyboard instructions, suggestion labels, and an account footer. Each sentence sounded reasonable alone, but together they made the user read information that did not help them act.

The input combined four initial rows, a 146px minimum height, large padding, and a separate toolbar. It occupied roughly 214px before any text was entered. The page explicitly set resize: vertical even though the shared input group declared resize-none. The generic global textarea rule could also override layered utility classes. This was an implementation error, not an unavoidable component limitation.

Recent projects were isolated on another page, splitting the two primary entry tasks: starting work and continuing work. Tests focused on whether clicks worked, then reported success without challenging the density, proportions, and unnecessary copy visible in screenshots.

## Rules for future changes

- Page background has one owner: `--background` in app/globals.css (warm off-white #faf9f6, chosen 2026-10-28 for Ben's off-white preference). Root/body paint it; full-page and embedded canvas layers reuse the token. Do not override the token in page scopes or introduce separate page colors. Cards, dialogs and input surfaces may remain white. Focus must not change an input background.

- Start from the user's actions. The entry page supports creating a project and continuing a recent project together.
- Every visible sentence must help the user decide or act now. Remove text that repeats the title, placeholder, nearby control, or familiar interaction. Do not add decorative subtitles, tips, badges, reassurance footers, or suggestions by default.
- Use one short heading. Keep accessible names and screen-reader-only labels even when visible labels are unnecessary.
- Progressive disclosure is for secondary actions. Keep resume-by-ID collapsed until requested. Errors appear when there is an error; do not permanently explain hypothetical failures.
- Chat inputs never have manual resize handles. The shared textarea defaults to non-resizable. Resizing requires an explicit opt-in for a genuine document-editing use case.
- Use lib/prompt-input for AI entry and conversation input. Select a supported size; do not recreate its height, padding, resize, or growth rules in page CSS. Add a reusable size only when a real consumer needs it.
- Prompt surfaces use two layout rows: full-width text above and actions below. Keep moderate corners rather than a single-line capsule. Compact text begins at one line and grows to a maximum, then scrolls internally. Clearing or sending restores the compact height. Width changes must reflow without clipping. This explicit layout preference supersedes the earlier inline composer.
- Enter submits, Shift+Enter inserts a newline, and Enter during IME composition never submits. Blank messages do not submit. Pending submissions cannot duplicate requests.
- Preserve drafts and focus when saving fails or replies finish. Keep drafting in the conversation possible while submission is temporarily locked.
- Only show connected controls. Do not copy model pickers, attachments, microphone actions, or mode labels from reference kits without a working purpose.
- Compact composer actions use 32px visible circles and 17px icons. The default size uses 40px circles and 19px icons. Mobile and coarse-pointer controls keep 44px hit areas around the smaller visual. Do not inflate the visible button to satisfy a touch-area requirement.
- Keep touch targets and visible keyboard focus usable. Minimal does not mean tiny controls, missing accessible names, or hidden failure states.
- Focus rings are unwanted on all controls (Ben's preference, expanded 2026-10-27). Do not add outline rings, glow shadows or focus-only border rings to buttons, inputs, selects, dialogs or preview controls. Use the shared components/ui/focus.css policy and restrained text changes for keyboard focus. Input focus must not change the field background (Ben's preference, 2026-10-28). Retain keyboard navigation, caret visibility and focus restoration. Do not reintroduce module-specific rings; the earlier input-field exception no longer applies.

## Required visual review

Review the rendered page at desktop and 390px mobile widths, not just source code or screenshots of one empty state:

- Empty input: compact, no resize handle, no redundant copy, submit disabled.
- Short text: text stays above the separate action row, with 32px compact actions and a 44px mobile hit area.
- Multiline and pasted long text: grows naturally, stops at its maximum, scrolls without covering the action.
- Cleared text: returns to original height.
- Narrow/wide viewport transitions: no horizontal overflow or stale height.
- Submission failure: draft survives and remains usable.
- Existing projects: immediately below the composer, with working links, pagination and local removal.
- Conversation composer: draft and caret remain stable across reply and save states.

Measure computed resize and input/surface height where CSS rules overlap. A passing lint/build is necessary but does not establish usability. Inspect every line of copy and every visible affordance before calling the work done.

## Reference checks

[AI Elements Prompt Input](https://elements.ai-sdk.dev/components/prompt-input) separates the text input, actions and optional tools. Use that compositional approach, not every demo control. [Gemini's recent-chat documentation](https://support.google.com/gemini/answer/13666746?hl=en) demonstrates access to past work within the app. These references do not imply all AI apps have identical layouts. Putting projects directly below this input is Ben's explicit product decision.

## Consumer language

This is a travel app, not a database viewer. Apply the Consumer language rules in AGENTS.md to visible copy, accessible labels, tooltips, statuses, failures and assistant-generated text.

- Say “Hours”, “Rating” and “Price”, not “Hours in catalog”, “Catalog rating” or schema field names.
- Say “Changes saved”, not “Committed revision 3”. Say “Changes are prepared but not saved yet” when that is the actual state.
- Say “Travel brief” and “Reading your document”, not “Supporting context” and “Staging an artifact”.
- Errors should explain what the traveller can do. Never ask them to configure Supabase, apply migrations or inspect an operation receipt.
- Keep meaningful source links, checked dates, availability warnings, document versions and trip access codes when they help a concrete task. Keep raw internal IDs and counters out of ordinary copy.
- Inspect dynamic labels and server errors as well as static page text. Keep internal contracts, developer logs and diagnostic tools technical where useful. Do not rewrite user-authored content.

Recorded 2026-10-28 after the app-wide consumer copy audit.

## Chat progress ownership

Live response progress has exactly one owner: lib/chat-response. Keep its fixed-height row first in the assistant response, directly below the user message. Update its text through tool activity, gaps, text streaming and save reconciliation. Never move it into action history or beside the composer. History is permanent, inspectable evidence with static status icons; it cannot replace the live indicator. Any change to chat/activity rendering must pass the state and actual-render regressions in tests/chat-response.test.ts. Review uninterrupted desktop/mobile transitions with the composer draft, caret and focus preserved.
