# Plan

Status: implemented locally. Apply the forward migrations before using it with hosted storage.
Last updated: 2026-10-30.

## Incremental agent assembly

The agent initializes an absent itinerary using only startDate and three stable day IDs/titles. lib/plan/initial.ts builds valid empty day collections. editPlan then adds stays, activities, meals, travel and relevant notes in small batches, normally one day at a time. Existing targeted item, date, timing, placement and day-boundary operations remain available. Full replacements remain an internal compatibility operation, outside the current model-facing schema.

Accepted batches stay readable within the current run; a rejected batch leaves them intact and must be corrected before publication. Existing source, protection and journey validation still applies. Initial empty days cannot be committed as a completed itinerary. Final publication remains atomic with Budget and related documents. This does not persist partial itineraries between requests. See [Agent](agent.md#incremental-initial-creation) for the workflow and verification boundary.

## Responsibility

Plan owns the current three-day itinerary, its information model, validation, persistence and direct editing. It works without an AI provider: a user can create an empty plan, add catalog places, reorder or move arrangements, and remove unprotected items. Agent is one client of this module. [Library](library.md) owns supporting text; Chat owns the original conversation.

There is one current Plan per trip reference, shared by every chat in that project. No `draft` or `ready` field exists. An absent Plan is `null`; proposed agent changes remain private to the running request until committed. SQL format version is a migration concern, not a user workflow status.

## Public boundaries

| Code | Responsibility |
|---|---|
| `lib/plan/index.ts` | Pure public contract: types, runtime schema, validation and projections |
| `lib/plan/types.ts`, `schema.ts`, `model.ts` | One shared domain definition, structural validation, reference and timing checks |
| `lib/plan/editor/index.tsx` | Production host: composes the editable canvas, project events, recovery controls and Budget slot |
| `lib/plan/commands.ts` | Typed direct edits applied to a session-owned clone, validated before persistence |
| `lib/plan/canvas/index.ts`, `view.tsx`, `controls.tsx`, `styles.css` | Public editable canvas, edit selection, contextual forms and edit-only styling |
| `lib/plan/session/index.ts`, `state.ts`, `transport.ts` | Public session, authoritative saved snapshot, pending save, draft refresh protection and revision-aware HTTP transport |
| `lib/plan/editor/editor.css` | Host loading, empty, status and recovery styles |
| `services/plans/index.ts` | Server entry point: `getPlan`, `savePlan`, `handlePlan`, catalog capabilities |
| `services/plans/database.ts`, `catalog.ts` | Scoped storage and supplied catalog adapter |
| `app/api/trips/[reference]/plan/route.ts` | Thin HTTP route |

The frontend has more than four files because the pure contract and validation are shared with server code while the interactive editor and styles require a separate client boundary. Do not put provider execution in this module.

## Shared presentation

The approved visual design lives in `lib/plan/presentation/`, a presentation submodule owned by Plan. Day cards, timelines and budget details are components within this boundary, not independent product modules.

| File | Responsibility |
|---|---|
| `index.tsx` | Client public entry: `PlanPresentation`, presentation types and projection export. Owns overview/day navigation and detail selection by stable ID. |
| `model.ts` | Render contract, formatting and pure `presentPlan(plan, places, photos)` projection. Safe to import directly outside React. |
| `components.tsx` | Trip summary, day card, shared timeline and detail dialog. No fetching, persistence or fixture imports. |
| `presentation.css` | Scoped palette, typography, layout and container-based responsive rules. |

`PlanPresentationData` is a derived view, never a second stored Plan. IDs come from the authoritative Plan. The production projection preserves day order, unscheduled arrangements, stays and notes. Unknown dates, photos, budgets and walking distances remain unknown or absent. Optional-action eligibility and disabled state are display hints; server validation still decides whether a real edit is allowed. The render model intentionally does not replace the full editor's provenance, constraint checks or editing forms.

Local experiments under `.local/experiments/` supply sample data to the same production presentation. They run at localhost:3101 and are intentionally excluded from the production app. The former unused `lib/day-preview` copy has been removed. Real prices and party scope come from Budget; fixture allowances never enter the production adapter.

Day-card images, titles, activity buttons and blank card surfaces open that day within the same Plan. Selecting an activity from the overview also opens its details. The trip summary and Budget slot stay mounted. Navigation and selection belong to each presentation instance, without changing workspace routing or browser history. Preview Budget and unscheduled details retain a modal fallback; production Budget opens its tab. See Shared detailed day view below for the unified browsing flow.

### Workspace composition

The AI workspace now uses `PlanEditor` from `lib/plan/editor`. Its canvas delegates browsing to PlanPresentation and owns the existing contextual edit forms. Overview activity clicks select an activity for viewing; Edit activity in the detail panel opens its form. `lib/plan/view.tsx` and `plan.css` were removed after their behavior was moved, so there is no second independently loading editor.

The host owns one `PlanSession` per project reference. Both views receive the same saved snapshot. It loads through `loadPlan`, validates cloned proposed edits, and saves through `updatePlan` with the expected revision and a stable request ID. Failed edits remain available for retry. Explicit reload discards the pending edit only after a successful read. Stale reads cannot replace newer snapshots, and refresh notifications received while saving are replayed after success. Controls are locked during reads, writes or unresolved pending edits. The backend remains authoritative for validation and conflict checks.

The production host supplies catalog photos and real Plan-derived dates, items and locations. Workspace injects the independent Budget module's summary card through a presentation slot. It loads real Budget data shared with the Budget tab; Plan owns no cost totals. Empty days, missing photos, unscheduled items, stays, notes and planning checks remain visible. Skipping an eligible optional stop removes its day membership, not its stored record; use Edit plan and Stays and unscheduled arrangements to schedule it again. Protected bookings, keep instructions and fixed timing retain their safeguards.

`lib/trips/events.ts` owns shared project-content invalidation. Plan subscribes directly; Chat publishes on turn completion; Library keeps compatible document-named wrappers. Same-tab events, BroadcastChannel, window focus and visibility refresh all converge on the same saved snapshot. The legacy event/channel wire names remain compatible with already-open tabs. This is invalidation plus fetch, not a second store or a realtime multi-agent execution engine.

Workspace owns panel placement, scrolling and chat. Plan owns its toolbar, empty state, controls and content styling. The old Plan-specific workspace CSS was removed. Responsive presentation uses its container width; below 700px it exposes a day selector. The workspace session is keyed by normalized project reference so navigating between projects resets chat selection, loaded panels and Plan state together.

## Information model

The authoritative TypeScript contract is `lib/plan/types.ts`. The strict runtime schema rejects additional fields, including lifecycle status.

| Object | Contents and ownership |
|---|---|
| Plan | Nullable starting date with basis, exactly three stable days, items keyed by stable ID, scoped notes |
| Day | ID, title, ordered item references, optional starting and ending location. Its date is derived from the Plan start date and position. |
| Activity | Visit, meal, rest, free time or logistics; location and flexible/precise timing |
| Travel | From/to locations, mode, and either a full interval or only a known arrival/departure endpoint |
| Stay | Location and either explicit check-in/out dates or nights following named days. Never occupies the activity sequence. |
| Item common fields | ID, title, rationale, optional flag, nullable user keep instruction, nullable reported reservation state |
| Timing | Period, start/end time points, or a bounded duration range. Each time point distinguishes fixed from suggested. Two endpoints determine duration instead of duplicating it. |
| Location | Catalog place, another item's location, travel endpoint, user-specified location, general area, or sourced restaurant |
| Basis | User, catalog, research or assumption; actual sources and explanation. Assumptions need an explanation. |
| Source | Saved user message, original notes, upload, exact document content revision, catalog field or external URL/access time |
| Note | Assumption, uncertainty, conflict or action, optional item references and sources |

A plan with unknown dates stays on Day 1, Day 2 and Day 3. Unknown budgets, operating hours and travel details are not fabricated. Numeric trip costing belongs to the independent Budget module. Requirements that do not fit concrete arrangements belong in the supporting context document.

Unscheduled items remain in `items` without day membership. Removing membership does not delete a booking. `keep` records an instruction, never booking status. Reservation state is reported by the user; this application does not book or cancel anything. A cancellation report and a desire to reschedule are different facts.

## Validation

`inspectPlan` checks the strict schema, three unique days, stable item identity, unique membership, dangling and cyclic locations, catalog existence, stay coverage, real dates, timing order and note references. Named attractions come from `italy.json`. Meals prefer suitable supplied restaurants, cafes or food markets, with a narrowly scoped researched-restaurant fallback. New generic or missing-location meals fail validation; explicit user-arranged meals can carry user evidence. Unchanged legacy generic meals produce warnings during unrelated edits.

Compared with the saved Plan, active bookings cannot be deleted, protected locations/times cannot silently change, and shifting itinerary dates does not shift an existing relative fixed appointment. Explicit current user authorization is required for protected agent edits. The model interprets that authorization; structural validation cannot establish what arbitrary prose truly means. Direct UI edits cannot bypass protected-fact checks.

Overlapping precise intervals require an explicit conflict note or correction. Warnings disclose unknown durations, missing hours, booking requirements, unscheduled arrangements and days exceeding eleven hours of required activities. The UI derives these checks from the current Plan. They are not independently maintained facts. This is not a route optimizer or a guarantee of real-world feasibility.

SQL integration validates source ownership for every Plan writer. User-basis document references must point to user-authored content versions, not agent-generated text. Deleting a source removes file access but does not invalidate already saved facts or erase its source identity.

## Storage and HTTP

`20261026134829_plans.sql` adds `plans`, direct-save receipts and a trip environment revision. Plan content is JSONB, one row per trip, with format version 1. Public/anonymous database access is denied; server operations are scoped by the trip capability reference.

- `GET /api/trips/:reference/plan`: `{revision, plan, places}`.
- `PUT` with `{revision, requestId, plan}`: validate then compare-and-swap. Returns `{savedRevision, snapshot}`.
- Stale revision returns 409. The editor retains the attempted edit and request ID. A request ID is bound to a content hash. Retry returns the latest snapshot without replaying an older plan, even after another writer adds protected facts. Retry resolves uncertain transport outcomes; Reload explicitly discards it and obtains current state.
- Body limit: 512 KiB, at most 100 arrangements and 40 notes.
- Environment revision also changes when Library metadata/content changes. This conservative policy rejects potentially stale contextual edits.

Cross-module Plan/document publication is owned by `services/workspace`, documented in [Agent](agent.md). Plan never uploads documents or calls an AI model itself.

## Verification and limits

`tests/plan-session.test.ts` checks stale reads, write locking, queued refresh, retry identity, reload failures and local validation. `tests/trip-events.test.ts` checks project scoping and subscription cleanup.

`tests/plan-presentation.test.ts` checks sparse-data honesty, stable identity, unscheduled coverage, calendar stays and protected timing in the presentation projection. Browser checks cover day navigation, modal details, real manual add/reorder/move/remove, optional-stop unscheduling/restoration and automatic cross-tab refresh using an isolated synthetic project. On 2026-10-27, lint, typecheck and all 136 repository tests passed. No real AI invocation was needed for this UI integration.

`tests/plan.test.ts` covers catalog/reference integrity, dates, timing, fixed bookings, stays, overlapping arrangements and protection rules. `tests/planning-integration.test.ts` covers direct saves, stale writes, source scope, atomic publication, rollback, retry receipts and role permissions. Browser checks use isolated local storage.

The first UI supports direct adding, moving, reordering and removal. Arrival/departure-only travel preserves its known endpoint in the display, and stay coverage remains separate. Rich manual timing, reservation and constraint forms are deferred; chat handles those edits. Branching plans, numeric cost solving and a background agent platform remain outside this module. The shared day view now includes a map as described below.

## Maintenance

Update this guide with every Plan or integration change. Add new item kinds only with schema, validation, rendering and migration compatibility reviewed together. Keep source ownership and stable IDs intact. See the shared [maintenance contract](README.md#maintenance-contract).

## Naming update

- 2026-10-26: Updated cross-module feature naming to Library and linked its renamed guide. Existing technical contracts are unchanged.

## Presentation reading scale

2026-10-27: Preview and embedded Plan share explicit reading sizes: 15px activity titles, 13px timing/duration text, 17px day labels, 30px timeline nodes and 76px minimum activity rows. Image/header proportions and connector geometry scale with those values. Mid-width layouts no longer shrink activity metadata or day headings. Full period labels receive a 62px time column. Narrow layout changes the arrangement, not the activity reading size. Browser checks covered the real workspace, full preview and 520px embedded preview with no horizontal card/row overflow; lint and typecheck passed. No data or interaction changes.


2026-10-27: Added a host-provided `budgetCard` slot to Plan presentation/editor. Workspace supplies the Budget module's shared summary card, which opens the Budget tab. No cost fields were added to Plan, and the standalone preview keeps its illustrative budget dialog. Plan writes invalidate the Budget review fingerprint and refresh shared project subscribers.

## Approved canvas integration

2026-10-27: Promoted the approved V2 into `lib/plan/canvas` and its pure commands into `lib/plan/commands.ts`. Production and `/preview/plan-v2` use the same canvas and session. Only `lib/plan-v2-preview` contains fixtures, injected failures and mock storage. The old global Edit plan/View plan switch and alternate controls were removed. Original DayCard, Timeline, TripSummary, icons and presentation CSS remain shared. Per-day actions appear on hover or keyboard focus, with touch availability. Details and editing use the shared application dialog and ring-free focus policy.

Data flow belongs to Plan at the session boundary: load a revisioned snapshot, clone it, apply a typed command, validate, save with compare-and-swap, publish successful changes. Canvas owns only navigation and local form drafts; it never fetches or publishes events. The host supplies real catalog-keyed photos and a Budget-owned card. Workspace coordinates project notifications. SQL and server validation remain in services/plans. AI execution, chat, library and budget accounting retain their own owners.

An open editor pauses external reads, cancels an already-running stale read, and queues one refresh. Closing resumes that refresh. Saves still use the captured revision, so external writes produce a 409 instead of silent overwrites. Pending candidates remain visible and locked with explicit unsaved status. Transient failures retry the original request ID. Conflicts and rejected writes require explicit reload; failed reload retains the candidate and its failure classification. Recovery is outside the edit dialog. Close it to retry or confirm discard and load the latest snapshot.

The canvas preserves stay coverage, travel endpoints/times/mode, start/end locations, reservation and keep metadata, source IDs/revisions, notes and planning warnings. Title, rationale, suggested activity timing, optionality, dates, movement, ordering, adding and removal use local editing. Protected arrangement details and accommodation/travel schedule changes still use chat. Missing catalog, timing and coverage details remain explicitly unknown. Existing storage requires no format migration for this UI replacement.

Integration verification: lint and typecheck passed; all 173 tests passed. An isolated real API trip verified day/activity saves after reload, catalog addition/removal, genuine revision conflict and explicit recovery. Browser review confirmed Budget navigation, original overview/day views, no horizontal overflow at 390px and no focus outline/shadow. No existing trip was edited during verification.

2026-10-27 direct editing: Dates remain editable from the trip summary. The expanded day title has a small pencil control. Activity rows select details, whose Edit activity action opens the existing local editor. Actions retain native button semantics, keyboard activation and save locking while visually remaining content.

Directly entered date/timing values use a user basis with a `direct_edit` source marker. This describes the form input itself; it does not invent chat/document evidence or provide authorization to change protected facts. Required-source validation and fixed-date/booking protection still apply. The existing JSON source guards validate referenced external records and need no migration for this non-reference source marker.

## Shared day cover photos

Updated October 28, 2026. Missing day images now use a three-photo pool from `public.day_cover_photos`, seeded by `20261028102639_day_cover_photos.sql`. Slots 1, 2 and 3 correspond to the three day positions. These Pexels photographs are illustrative travel imagery, not scheduled venues. Source pages, photographers, alternative text and verification dates are retained. Credits appear on /about.

The Catalog loader reads and validates the ordered pool. The Plan GET response includes the display metadata alongside the plan and catalog records; no image URL is stored in a trip's Plan. Presentation keeps each day's selected place photo and its separate fallback. A failed primary image switches to that day's fallback. Missing photos use it immediately, and failures before hydration are also detected. Different URLs reset local failure state. There is no cross-day rotation, so fallback photos do not repeat across a three-day plan.

The decorative SVG placeholder has been removed. If the pool is unavailable or both image URLs fail, the cover retains its geometry with a plain background, without breaking the itinerary or repeatedly requesting failed images. Pool errors do not prevent loading/saving the plan. There are no runtime image searches or AI calls.

## Workspace availability

Updated 2026-10-28. PlanEditor optionally reports saved Plan availability and errors through onAvailabilityChange. It derives availability from session data, never from pending edits. Workspace owns its small layout reducer: chat is initially the only visible panel, first saved Plan selects Plan and opens the regular content panel once, and later refreshes preserve the current view. Existing saved projects open Plan once their saved snapshot loads. The callback adds no requests and does not move persistence or editing responsibilities out of Plan.

2026-10-28: Place details and planning checks use consumer wording such as Hours, Booking and Place information. Removed internal catalog terminology from displayed copy while preserving unknown-hours and unchecked-availability warnings. Data contracts and validation conditions are unchanged.

2026-10-28 consumer copy audit: Consumer source details omit raw message/file IDs, retaining cited document versions and section references. Plan warnings use travel language; schema diagnostics remain available to internal validation but ordinary save failures use plain wording.

Consumer copy audit verification: lint, typecheck and 106 targeted tests passed. Rendered Explore and Trip details were checked; no live trip or file data was changed.


## Shared detailed day view

Updated 2026-10-28. PlanPresentation owns one overview/expanded-day navigation state and the selected activity ID. PlanCanvas delegates to it and keeps only edit dialogs and typed command handling. Both workspace and local previews use this composition.

| File | Responsibility |
|---|---|
| `presentation/index.tsx` | Persistent trip summary and cards, overview/day navigation, selected activity and non-scrolling focus |
| `presentation/motion.ts` | Measured live-card position/width animation, interruption, current scroll preservation, stage height stabilization and cleanup |
| `presentation/components.tsx` | The same DayCard and Timeline in both states, with expansion and activity-selection controls |
| `day-view/index.tsx` | Activity/map/Budget detail column, linked focus and deferred mobile detail navigation |
| `day-view/details.tsx` | Selected activity's time, duration, location, price if supplied, photo, description, booking requirements, sources and explicit edit action |
| `day-view/map.tsx` | Leaflet lifecycle, numbered pins, selected place, directions, fit/zoom and loading/retry |
| `day-view/styles.css` | Shared palette and responsive expanded-day layout |

The trip summary and every DayCard remain mounted in one keyed content stage. Overview and expanded day use CSS layout states, not separate render branches. The selected live card animates from its measured current position and width to the new layout over 340ms. Both directions use the same motion owner; interrupted input samples the current animated rectangle before cancellation and continues from there. There are no root/page snapshot transitions, duplicate card snapshots or full-page fades. Other cards are hidden/inert while a day is open, then return gently. The latest detail column stays mounted but becomes invisible/inert on return, preserving its map until another day is selected. Temporary minimum stage height and start-aligned grid tracks avoid scroll clamping during the movement. Resize, reduced motion, completion, interruption and unmount release animation resources. The approved card imagery, timeline, typography and colors have one owner. The old separate sidebar and detailed Schedule renderer remain removed.

| Action | Result |
|---|---|
| Open card/image/title | Expand day without choosing an activity; show map and day spending |
| Select overview activity | Expand its day and show that activity's details |
| Select expanded activity | Select and center a different activity; select the active activity again to clear its details and map emphasis |
| Select map pin | Update activity details, focus and reveal the matching timeline button |
| Edit activity | Invoke Canvas's existing editor and save session |
| All days | Animate the current day back into overview, preserve the current scroll and focus its card/activity |

The header has one shared metadata/navigation slot. Its two overlapping grid layers both determine height; only the active layer is visible, exposed to assistive technology and interactive. Overview facts (including the narrow-screen day selector) are replaced in that slot by back/day navigation. Budget and title remain in place. No extra navigation row is inserted below the header. Card cover, visual-header and heading heights are identical across modes. Each open/close samples and preserves the current nested/window scroll position. Returning never restores a historical position or defaults an initially expanded preview to window y0. The current day stays selected in a narrow overview, including after switching days. Selection is local view state, not a new saved plan or document. Day and item IDs resolve against current data on every render. Removed or moved activities cannot retain stale details or invented pins. Day switches clear the activity selection. Successful normal edits preserve the expanded day and update its details.

The existing `presentation/model.ts` projects saved Plan and catalog facts into optional Stop fields: coordinates, location, end time, photo, description, practical details and HTTP(S) evidence links. Referenced locations resolve from the same Plan. Missing coordinates, prices or duration stay unknown. Catalog hours and booking requirements are never treated as verified availability. Place-specific photos in details remain separate from illustrative fallback covers. The same day-cover image is not repeated beside itself in activity details.

The right column shows a selected-activity detail card above one map and Budget's existing day-spending card. No activity is chosen arbitrarily on day opening. Selected activity details use a fixed 360px card with a white surface, subtle border and rounded corners. The entire keyboard-focusable card owns vertical scrolling, including its compact title, edit control, facts, image, description, booking notes, optional actions and expanded evidence. The header has no reserved height and scrolls away with the content. Facts wrap naturally without a nested scrollbar. Scrollbar space and image height are reserved. Switching activities resets the reading position through the existing activity key. Short content leaves intentional whitespace. There is no empty 360px placeholder before an activity is selected. A fixed 52px map-caption row also prevents long/missing selected-place labels from moving day spending. On narrow screens the columns stack. Activity selection waits for card motion to finish before smoothly revealing details; Day timeline smoothly returns to the selected activity. Reduced motion uses immediate scrolling. Native buttons preserve keyboard access. Editing and optional changes honor existing save locks; browsing stays usable.

Budget integration uses `renderDayContext(day)` through PlanEditor and Canvas. Workspace supplies Budget's provider-connected DayBudgetCard with the day's item IDs. Plan does not fetch, store or calculate prices. Subtotals, sources, missing prices and review state derive from the existing Budget snapshot. Whole-trip Budget remains in the persistent summary. See [Budget](budget.md).

Leaflet is dynamically imported only in the browser. Cleanup removes maps, timers, observers and listeners. Serialized pin geometry avoids resets from unrelated view or Budget changes. Empty-location days show an explicit empty state and download no tiles. Pins describe places, not computed routes; directions open externally. OpenStreetMap attribution and origin-only referrers remain visible/configured. The public raster service is best-effort; loading, error and retry states are retained. Reference: https://operations.osmfoundation.org/policies/tiles/ (reviewed 2026-10-28).

Verification: rendered expansion tests cover the persistent summary, no arbitrary activity selection, navigation versus editing, edit locks, missing facts, evidence, duplicate photo avoidance and empty days. Browser checks use actual workspace controllers and an ephemeral PGlite Rome fixture. They cover card/activity entry, return focus/scroll, both map-selection directions, real activity save, retained day state and desktop/mobile layouts. Local sample previews consume the same production components, with no paid AI or existing-trip writes. Round-trip motion verification additionally recorded 49 to 51 animation frames per completed move, confirming stable card DOM identity, monotonic horizontal movement and zero vertical/scroll changes in those desktop traces. A true interrupted return continued from a partially expanded 515px width. A scrolled mouse-return preserved window y57. Current checks are recorded in the Plan round-trip task.


## Researched meal venues

October 29, 2026: restaurant locations save a real venue label, street address, city, optional paired coordinates and a research basis containing web citations with checked timestamps. Only meals may use this venue type as their activity location; travel endpoints and day boundaries may refer to it. Named attractions and overnight stays retain their existing source rules. Supplied Italy records are unchanged; researched venues live in the trip's Plan JSON, with no migration or global catalog insert.

`services/plans/venues.ts` validates that new restaurant facts cite URLs observed by this request's research tools and do not claim a future check date. Workspace validates before accepting a draft and again before commit. Direct saves may preserve unchanged saved restaurant evidence, but cannot inject new researched venues without observed sources. Unchanged evidence is compared independently of JSON object key order, retaining original dates across offline edits. This gate verifies provenance, not the semantic accuracy of a page or live table availability. Guides own venue suitability, opening checks and honest uncertainty.

The day detail view displays the saved name, address, city and source links. Verified coordinates join the existing map; missing coordinates remain absent and are described as an unavailable map pin, without discarding the usable address. Catalog photos and daily cover fallback are unchanged. Replacing generic meals in old trips requires a subsequent planning edit.


## Protection checks after reload

October 29, 2026: Plan protection compares JSON structurally, ignoring object key order while retaining array order and exact values. Database JSONB ordering previously made an unchanged user-sourced note look edited after reload, blocking otherwise valid timetable changes with protected_note. The affected saved itinerary reproduced this failure on a read-only no-op check; the same check passes after correction. Booked locations, fixed times and genuinely changed user notes remain protected. This fix does not modify any saved trip automatically.


## Contextual lodging and reminders

October 29, 2026: removed the bottom Stays and unscheduled arrangements, Plan notes and Planning checks disclosures. Stored Plan data, protection rules and server validation are preserved. Day cards expose clickable overnight stays based on real night/date coverage. Selecting a stay opens its day context and retains the existing edit entry; dates/coverage remain editable through chat under the existing stay form behavior. Stays with unassigned nights and unscheduled booked, kept or fixed arrangements remain actionable near trip context. Ordinary unscheduled candidates are retained in data without becoming a bottom itinerary dump.

Presentation derives action, conflict and uncertainty reminders for affected days and selected arrangements, with cited web links. Genuinely trip-wide reminders appear by the trip summary. Background assumptions are excluded from the reminder lists; provisional start dates are labeled explicitly. Item assumptions and source facts remain in the item's practical details. New supporting research and route reasoning belongs in Library documents under planning-documents. Existing legacy notes are not automatically rewritten, classified by prose or deleted. A relevant future agent edit can reorganize them using the new rules.

The shared reminders component keeps source links and accessible list semantics consistent across trip/day/item contexts. Overnight buttons use stable IDs for selection and keyboard return. The server still rejects invalid saves, and the existing editor retains failure feedback and retry/reload controls. Validation output is available to the agent instead of rendered as a raw traveller checklist.

## Overview timing and detailed scheduling

October 29, 2026: the shared Timeline has two presentations of the same saved schedule. Overview labels consecutive period groups once in the existing time column. Period-only legacy records remain usable. Local clock starts derive Morning (06:00 before12:00), Afternoon (12:00 before18:00), Evening (18:00 onward) or Night (before06:00). Missing/unusable times remain Flexible. Saved order is preserved; a returning period after an intervening group receives another label. Omitted optional slots keep their position. Screen reader activity names retain their period even when its visible label is suppressed. Timeline connections continue between groups without adding rows or padding.

Expanded DayCard passes detailed mode to the same mounted Timeline, retaining each saved clock and duration/end text. Overview suppresses exact Until labels. Existing StopDetails continues to display explicit start/end ranges. No end time is inferred from a duration. No persisted schema, timetable generation, save behavior, header or motion mechanism changes. Travel brief guidance keeps summaries at period level while retaining exact user commitments and the detailed saved timetable.

Follow-up: timeline connectors remain continuous across all period boundaries. Period labels still appear once per consecutive group; changing the period does not interrupt the line.


## Routes and researched hotels

October 29, 2026: Plan now accepts sourced hotel stays with the restaurant-style web identity/address fields and host-issued map references. Supplied attractions and user bookings retain existing protections. Shared timing includes start plus maximum duration. Agent proposals, direct saves and commit check derived journeys; unverified drafts remain distinct from checked routes. See [Locations and routes](geo.md) for evidence, cache, matching and status behavior.

## Located places and timeline emphasis

October 30, 2026: the map remains day context while individual activities change. day-view/locations.ts derives one immutable position view from saved locations and returned journey endpoint evidence; the selected details and map share it. Unchosen venues display Place not chosen yet, known but unlocated addresses display Not located on map, and location-free rest/free periods do not show missing-location prompts. Omitted stops never acquire pins. Days without any positioned activity or stay render no map section.

Located selection highlights and centers its pin. Clicking an already selected activity or map pin clears selection, details and directions while retaining the day view and map. An unlocated selection clears prior pin emphasis and directions without changing the viewport or remounting the map. New map selections focus and reveal the corresponding timeline activity; map-origin deselection keeps focus on its pin. Pins retain schedule position numbers and H for stays, with full accessible names. Visible short names are collision-filtered against names, pins and map edges; a selected name has priority and may wrap. Labels use explicit content width bounded by the map, preventing long unbroken words from collapsing into narrow columns. On-map names shift away from edges with their pointer adjusted, or open below a pin when there is no room above. Names are inserted as text, never HTML. Geometry and selection have separate lifecycle ownership so tile loading does not unexpectedly recenter a user's view.

Timeline rows show activity names, timing, duration and icons without small photos or photo-specific responsive layout. Shapes distinguish food, visits, rest and transport. Sightseeing destinations (sight, garden and viewpoint kinds) use the Italian flag red (#ce2b37) for icon and title accents, with a pale red icon background; meals, rest and other activities retain the muted green palette. This distinction follows activity kind rather than photo or coordinate availability. Existing illustrative photo metadata is retained by the editor and excluded from full activity-detail imagery; day cover fallbacks remain a separate visual role. The continuous timeline rail, overview period grouping, detailed times, fixed-height detail card, shared header and overview/day motion remain unchanged.

Verification uses isolated in-memory trip data and the actual workspace UI. No model invocation, real trip mutation or migration is needed. See docs/tasks/main-map-timeline for focused regression and browser evidence.

October 30, 2026: the shared sightseeing accent uses --pp-event-accent and --pp-event-tint in presentation.css. Multi-day overview and expanded single-day timelines use the same rules, preserving layout, selection and other activity colors.
