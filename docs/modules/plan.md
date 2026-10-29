# Plan

Status: implemented locally. Apply the forward migrations before using it with hosted storage.
Last updated: 2026-10-28.

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
| Location | Catalog place, another item's location, travel endpoint, user-specified location, or general area |
| Basis | User, catalog, research or assumption; actual sources and explanation. Assumptions need an explanation. |
| Source | Saved user message, original notes, upload, exact document content revision, catalog field or external URL/access time |
| Note | Assumption, uncertainty, conflict or action, optional item references and sources |

A plan with unknown dates stays on Day 1, Day 2 and Day 3. Unknown budgets, operating hours and travel details are not fabricated. Numeric trip costing belongs to the independent Budget module. Requirements that do not fit concrete arrangements belong in the supporting context document.

Unscheduled items remain in `items` without day membership. Removing membership does not delete a booking. `keep` records an instruction, never booking status. Reservation state is reported by the user; this application does not book or cancel anything. A cancellation report and a desire to reschedule are different facts.

## Validation

`inspectPlan` checks the strict schema, three unique days, stable item identity, unique membership, dangling and cyclic locations, catalog existence, stay coverage, real dates, timing order and note references. New named attractions and restaurants must come from `italy.json`. User-supplied existing venues can be represented with user evidence; general meal areas are allowed.

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
| `presentation/index.tsx` | Persistent trip summary, overview/day navigation, selected activity, reading-position restoration and transition identity |
| `presentation/components.tsx` | The same DayCard and Timeline in both states, with expansion and activity-selection controls |
| `day-view/index.tsx` | Expanded left card and right activity/map/Budget composition, linked focus and mobile detail navigation |
| `day-view/details.tsx` | Selected activity's time, duration, location, price if supplied, photo, description, booking requirements, sources and explicit edit action |
| `day-view/map.tsx` | Leaflet lifecycle, numbered pins, selected place, directions, fit/zoom and loading/retry |
| `day-view/styles.css` | Shared palette and responsive expanded-day layout |

The trip summary remains mounted while other day cards disappear and the selected card expands to the left. Scoped React ViewTransition identities connect the same day in both states. Plan navigation uses its own transition type. Root and old snapshots do not crossfade, so the header/background stay steady and one opaque day snapshot moves for 360ms. The right column appears with a small, mostly opaque reveal; returning day cards gently regain opacity. This avoids overlapping fades that previously made expansion flash. Reduced-motion CSS removes these animations; unsupported browsers retain all interactions. The approved card imagery, timeline, typography and colors have one owner. The old separate day sidebar and detailed Schedule renderer were removed.

| Action | Result |
|---|---|
| Open card/image/title | Expand day without choosing an activity; show map and day spending |
| Select overview activity | Expand its day and show that activity's details |
| Select expanded activity | Update details and center its map pin, including repeated selection after fit/pan |
| Select map pin | Update activity details, focus and reveal the matching timeline button |
| Edit activity | Invoke Canvas's existing editor and save session |
| All days | Restore overview scroll offsets and focus to the originating card/activity |

An expanded day is anchored at the start of Plan so automatic browser scrolling cannot obscure the persistent summary during opening. Return restores the actual nested scroll containers and window position. Selection is local view state, not a new saved plan or document. Day and item IDs resolve against current data on every render. Removed or moved activities cannot retain stale details or invented pins. Day switches clear the activity selection. Successful normal edits preserve the expanded day and update its details.

The existing `presentation/model.ts` projects saved Plan and catalog facts into optional Stop fields: coordinates, location, end time, photo, description, practical details and HTTP(S) evidence links. Referenced locations resolve from the same Plan. Missing coordinates, prices or duration stay unknown. Catalog hours and booking requirements are never treated as verified availability. Place-specific photos in details remain separate from illustrative fallback covers. The same day-cover image is not repeated beside itself in activity details.

The right column shows a selected-activity detail card above one map and Budget's existing day-spending card. No activity is chosen arbitrarily on day opening. Secondary details and sources expand inside a bounded detail area so they cannot indefinitely push the map down. On narrow screens the columns stack; activity selection reveals details, and Day timeline returns to the selected activity. Native buttons preserve keyboard access. Editing and optional changes honor existing save locks; browsing stays usable.

Budget integration uses `renderDayContext(day)` through PlanEditor and Canvas. Workspace supplies Budget's provider-connected DayBudgetCard with the day's item IDs. Plan does not fetch, store or calculate prices. Subtotals, sources, missing prices and review state derive from the existing Budget snapshot. Whole-trip Budget remains in the persistent summary. See [Budget](budget.md).

Leaflet is dynamically imported only in the browser. Cleanup removes maps, timers, observers and listeners. Serialized pin geometry avoids resets from unrelated view or Budget changes. Empty-location days show an explicit empty state and download no tiles. Pins describe places, not computed routes; directions open externally. OpenStreetMap attribution and origin-only referrers remain visible/configured. The public raster service is best-effort; loading, error and retry states are retained. Reference: https://operations.osmfoundation.org/policies/tiles/ (reviewed 2026-10-28).

Verification: rendered expansion tests cover the persistent summary, no arbitrary activity selection, navigation versus editing, edit locks, missing facts, evidence, duplicate photo avoidance and empty days. Browser checks use actual workspace controllers and an ephemeral PGlite Rome fixture. They cover card/activity entry, return focus/scroll, both map-selection directions, real activity save, retained day state and desktop/mobile layouts. Local sample previews consume the same production components, with no paid AI or existing-trip writes. Final checks are recorded in the Plan expansion task.
