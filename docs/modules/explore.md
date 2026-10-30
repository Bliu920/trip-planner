# Explore catalog

Status: implemented, imported into Supabase and verified. Updated: October 27, 2026.

## Purpose and naming

The Explore tab below the starter chat browses all 103 supplied Italy records using photo-led cards, search, city/category filters and an accessible detail dialog. The standalone /explore route was removed on October 30, 2026; browsing and selecting places remain on /projects/new. The visual reference is a private local image and is not included in this repository.

The starter selects Explore by default, with Projects second. Base UI tabs provide keyboard navigation and accessible panel relationships. Both panels stay mounted, preserving project controls and catalog filters; the composer stays outside the panels so its draft, attachments and dictation persist. Explore loads independently on page entry through `GET /api/places`, using the existing server catalog validator and a five-minute cache. Loading and retry states stay within Explore. Unmounting aborts the client request. The embedded view omits duplicate page navigation and headings, retains the result count for assistive technology, and uses the full content width for cards.

The page retains its 1192px outer container and responsive gutters. The tab header, Projects cards and catalog share the wider browsing area. The composer has an independent 820px reading width, wider than the original 600px but no longer stretched across the full catalog. Its shared `roomy` size starts with two text lines and grows automatically above the separate action row, retaining compact 32px controls. Projects uses compact cards, three columns on desktop, two on intermediate screens and one on mobile, with six projects per page. Recovery key appears as a key icon in the tab header when Projects is active. Clicking it expands a neutral input to the left in that same row and focuses it. Enter or the arrow opens the project using the existing read-only lookup. Escape collapses the field and restores key-button focus; drafts survive closing and failed lookup. Empty fields collapse on blur. Pending lookup disables repeated submission. Errors appear only when needed and are associated with the input. The former below-header form is removed. On phones the expanded field temporarily uses the tab row, as Search does; collapsing restores the tabs. Disclosure immediately uses its final width, with no width or text-fade animation: this keeps the key and submit controls from overflowing or shifting during opening. The starter header shares a 180ms right-to-left clipping reveal for Search and Recovery Key in `lib/start-trip/inline.css`. Only the visible boundary animates; button geometry stays fixed. Reduced-motion preferences disable this reveal. Focus does not change the field background; the pending spinner respects reduced motion. `lib/trips/recovery.tsx` and `recovery.css` own presentation and disclosure; `home.tsx` retains the draft, lookup and recent-project list. These proportions follow the reference-led correction.

Each catalog record is a **Place**, reusing the planner contract. A **PlanItem** remains a trip-specific scheduled activity, travel leg or stay. A catalog-backed plan location references a Place through `placeId`. Explore does not create PlanItems or invent places.

## Contextual navigation actions

The starter header places About and Credits navigation links at the upper right, opposite the project brand. These link to /about and /credits and replace the starter's former footer About link. Both links retain 44px minimum target height and visible keyboard focus. This is independent of the Explore/Projects tab controls below the composer.

October 30 navigation verification: lint passed. Browser checks at 1280px and 375px confirmed both links and no mobile horizontal overflow; About and Credits opened successfully. The starter, About and Credits returned HTTP 200, while the removed /explore returned 404. Clean-snapshot typecheck remains blocked by the concurrent map work's Tooltip.setZIndex type error in lib/plan/day-view/map.tsx, outside this navigation change.

Explore uses four columns at viewport widths of 1200px and above, three from 961px to 1199px, two from 601px to 960px and one at 600px or below. Image size hints follow the same breakpoints. Both standalone and starter catalogs share this grid; Project cards retain their separate layout.

Project cards derive seamless photo covers from their saved Plan. Selection, independent loading and sparse-plan behavior are documented in [Project covers](project-covers.md).

The shared header has 18px tabs on the left and an optional action slot on the right. Each active panel owns its controls and renders them into that DOM slot through a React portal. The starter owns tab selection and the slot, while Explore owns its query, city and place-type filters. Inactive panels receive a null target, so their controls, inline search disclosure and filter popup unmount without clearing query or filter state. No separate toolbar or duplicated heading is rendered below the starter tabs.

Explore starts with two icon buttons: Search places and Filter places. Search expands left into an input on the same header row and immediately focuses it. Typing filters the existing catalog without a request or submit step. Clear search empties the query and keeps input focus. Escape or the search icon collapses the field and preserves the query; an active dot indicates a collapsed search. Empty search collapses when focus leaves it. On phones the expanded field temporarily uses the tab row, with Filter still available; collapsing restores the tabs. Text remains 16px on phones and targets stay 44px. There is no search popup. The search field uses the page surface with a subtle gray inset border, a darker gray focus boundary and transparent expanded buttons, including hover, focus and pressed states. Icon contrast supplies interaction feedback without covering the field border. Do not introduce green fill for search or its focus state.

Filter opens a shared shadcn DropdownMenu with City and Place type submenus, their current values and a conditional Clear filters action. Radio choices update the catalog immediately and keep the list open for comparison. Base UI owns keyboard navigation, checked states, focus restoration, outside dismissal and viewport collision handling. Escape returns from a submenu to its parent, then dismisses the menu. A mobile-only Back to filters action supports touch navigation. Reopening starts at the summary. Clear filters resets only city/type and preserves search.

Standalone City and Place type fields use the shared shadcn SelectField. All dropdown surfaces share neutral fills, a white surface, fine border, restrained shadow, bounded scrolling and no focus ring. Mobile targets are at least 44px. See [Shared dropdowns](dropdowns.md) for the authoritative component inventory, interaction contracts and verification.

`controls.tsx` composes inline search, the compact filter menu in `filters.tsx`, and a standalone filter-bar variant retained by the shared component. There is no standalone production Explore route. The embedded view keeps result counts available to assistive technology. Resetting city/type filters preserves the search query; Clear search only clears the query. Switching tabs preserves all three filters and selected composer places.

## Selecting places for a message

Inside the starter, each card has a separate plus/check control and its detail dialog has the same action. These add or remove an interest reference in the current composer. Card-body clicks still open details. The draft, chips, persistence, retry handling and agent interpretation belong to the independent [Place references module](place-references.md).

## Information ownership

| Artifact | Concrete contents and exclusions | Initial state and storage | Independent loading boundary |
| --- | --- | --- | --- |
| Supplied source | All original place fields and IDs; no external imagery or user preferences | Unchanged `data/italy.json`, 103 records | Import input and assessment provenance |
| Place | ID, name, type, city, region, neighborhood, description, coordinates, hours, duration, price tier, rating, tags, seasonal notes, booking requirement, source order | `public.places`, seeded exactly from the original JSON | Server catalog read ordered by `source_order`; no trip/chat loads |
| Cover photo | Place ID, provider/photo ID, direct image URL, source page, photographer, descriptive alt text, match classification and verification date | One optional `public.place_photos` row per Place, keyed by `place_id` | Joined only for browsing; photo updates cannot modify supplied place facts |
| Photo import manifest | Curated initial photo assignments and attribution | `data/place-photos.json`, 103 assignments; a reproducible seed, not a second live editing surface | Explicit import or local pre-migration preview |
| Browse state | Search query, city, category | React state, initially empty | Local view; derived results retain source order |
| Place detail | Selected record, photo, full description, source hours, duration, booking, price, seasonal notes, tags, coordinates/map link | Modal state, initially closed | Opens from a card; no database mutation |

The catalog type extends the planner's exported Place with region, nullable neighborhood, rating and an optional photo. This avoids modifying an actively owned planner module. The planner can continue consuming its existing structurally compatible subset. Agent discovery and record reads now use the same SQL adapter as Explore. Plan validation retains the immutable source records. Shared query semantics and evidence limitations are documented in [Catalog queries](catalog.md).

## Database and import

`supabase/migrations/20261026160311_catalog.sql` creates typed `places` and `place_photos` tables. The photo foreign key prevents orphan records. Source order is unique; coordinates, ratings, positive durations, photo providers and match classifications have database checks. Nullable source fields stay nullable.

Both tables enable row-level security. Anonymous and authenticated client roles have no direct table privileges. The server's existing service role can read and manage these public catalog records. No changes are made to trip, chat, plan or document tables. The app returns only validated catalog fields, never credentials.

The SQL migration was validated in PGlite and applied through the production Supabase SQL editor on October 26, 2026 after the user explicitly approved its RLS/grants and import. The importer saved 103 places and 103 photo records, then compared every stored field with the source manifests. Live checks confirm RLS is enabled on both tables, browser-role reads are denied, and service-role reads work. The application adapter loads all 103 joined photo records without preview fallback. This was a manual SQL Editor application, not a Supabase CLI migration push.

For a fresh environment, apply the migration before importing:

```sh
# Validate source records and image assignments, without writes.
node --import tsx --conditions=react-server scripts/catalog/index.ts

# Check all selected image URLs.
node --env-file=.env --import tsx --conditions=react-server scripts/catalog/index.ts --check-images

# Upsert the original records, then curated photo metadata; verify both.
node --env-file=.env --import tsx --conditions=react-server scripts/catalog/index.ts --write

# Update only changed photo metadata, without writing place facts.
node --env-file=.env --import tsx --conditions=react-server scripts/catalog/index.ts --write-photos

# Compare the stored catalog and photo records against their import inputs.
node --env-file=.env --import tsx --conditions=react-server scripts/catalog/index.ts --verify
```

The importer uses the existing ignored environment configuration and never prints secrets. It does not create schema through the REST API. Upserts use stable source IDs and do not delete records or create duplicate rows. The two table imports are separate requests; if the photo import fails, rerun the command. A successful write is followed by a complete field comparison. `--write-photos` requires the same place coverage as the existing photo table, updates only changed photo rows in one request, and verifies every photo field afterward. Photo manifests reject reused provider/photo IDs and duplicate image URL paths, including different query-string crops of the same image. Dataset regression tests enforce distinct photos for all 103 places. The uniqueness rule is enforced by import validation, not a new database constraint; direct database edits must respect it. Re-running `--write` intentionally reapplies both manifests, so edits made directly in Supabase must first be reflected in the photo manifest if they should survive reseeding.

## Photo sourcing and honesty

The user approved related city or food imagery where an exact venue image is unavailable, with its classification preserved. On October 27, the user moved all image labels and credits to a separate About page. The manifest contains 42 place depictions and 61 illustrative assignments, using 103 distinct Pexels photos. Every place has its own asset, including illustrative cards. The source page and photographer are retained for every assignment. On October 27, 2026, 51 repeated assignments were replaced, all 103 URLs returned image responses, and decoded preview hashes confirmed distinct image content. All replacement images were visually reviewed; weak crops were replaced before import.

Provider source descriptions were checked for place identity. A city skyline, generic food photograph, or the right landmark at the wrong specified time is not labeled as a verified depiction of the whole experience. Alt text identifies the actual subject. Cards and dialogs omit image badges and credit links. The [Image credits page](photo-credits.md) owns related-image classification, photographer names and original source links. Original source descriptions remain unchanged apart from display punctuation.

Photos are hotlinked from the provider CDN with responsive size parameters, not copied into Supabase Storage. Credits on `/about` link to the exact source page, including photographer name and provider. [Pexels API guidance](https://www.pexels.com/api/documentation/) explains provider and photographer attribution; these selections were curated from public photo pages, not through an API integration. No photo API key or runtime image-search call is required. A future Unsplash integration must preserve its [hotlinking, attribution and download-tracking requirements](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines).

## Rendering and lifecycle

The server reads Supabase and validates returned records, provider URLs, photo/place identity, completeness and unique source IDs. Next caches the page for five minutes with an hour expiry. Photo changes appear on the next revalidation or deployment; no browser credentials are used.

When database configuration is absent, or the catalog table is specifically missing (`PGRST205`), a bundled preview uses the original JSON plus the curated photo manifest. A configured missing table emits a server warning. Other failures are not disguised as successful SQL loads: permission errors, malformed records, incomplete imports and network failures reach the retryable route error state. The configured project now uses Supabase; the pre-migration path remains available for fresh local clones.

Cards have no outer border, shadow or inset padding. Images use a 4:3 crop and 12px corners, followed by a 16px name with catalog rating, city/category, duration and price. Descriptions appear only in the detail dialog. Booking requirements appear only in place details, not in card metadata. Names clamp to two lines. This restores the useful browsing information requested on October 28 while retaining the lighter card styling. Essential information is always visible; hover only adds interaction feedback, without another popup or layout shift. The shared four/three/two/one-column breakpoints remain unchanged.

Images reserve their layout area, load lazily in cards and eagerly in the opened dialog, and use 400/800/1200px variants. Failed images retain a neutral blank area without blocking details. Seven reviewed portrait assets have card-only focal positions in `photo.tsx`, keyed by provider and asset ID so replacing a photo cannot inherit an unrelated crop. These preserve street activity, food, sculpture, steps and landmark subjects. Other cards remain centered, and dialog crops are unchanged.

The composer-to-tab gap is 36px on desktop and 28px on phones. Selection uses a 28px visible plus/check circle within a 44px target, with a persistent green selected state. Controls remain visible on touch screens. Hover and keyboard focus use restrained color/underline feedback. There is no card hover animation.

The shared Base UI dialog traps focus, closes with Escape or the close button, and returns focus to its triggering card. Its header keeps the name, city/category, rating, shared plus/check selection control and 44px close control visible. The selection control uses the same 28px circle inside a 44px target as the card, with an accessible action label and tooltip. A compact photo sits beside duration and price. Booking requirements appear once, in the visiting-details section, without an accent badge. Description text is 16px, visiting/location content 15px, with 13px labels. Hours, reservation availability and seasonal notes retain their own labels without a redundant section heading; location and interests form the final section. Unknown values stay explicit.

Only the body scrolls; the title and top controls remain fixed. The outer shell uses overflow clipping so keyboard focus cannot programmatically scroll the header out of view. City/category and rating span the header width below the title and actions to conserve space for long names on phones. The map link sits beside the Location heading, removing the separate footer. The desktop dialog is at most 620px wide and 740px high, with 16-20px content spacing; text sizes are unchanged. The region is keyboard focusable for native scrolling and uses stable scrollbar space. Dynamic viewport limits keep the dialog inside small/short screens, including long titles. Add/remove remains the existing selection action, with no new state store or backend work. Image requests now match the 180px desktop or 100px phone thumbnail rather than the previous full-width hero. Search remains case/accent insensitive and combines with exact city/category filters. Empty results offer Clear filters. Unknown duration reads "Not available"; missing hours or booking information directs the user to check with the venue; absent duration is omitted from the card summary. Ratings, opening hours and booking information are supplied catalog facts, not live availability claims. Map links use original coordinates.

## Module boundaries

- `lib/catalog`: shared Place/photo contracts, pure filtering and display helpers; `index.ts` public API.
- `services/places/catalog`: public source/SQL orchestration, database adapter and runtime validation.
- `lib/explore`: filter/page composition, independently composed controls, cards in `place.tsx`, detail layout in `detail.tsx`, shared imagery/crops in `photo.tsx` and scoped styles; `index.ts` public API. `place.tsx` preserves its detail re-export for existing chip consumers.
- `app/projects/new`: starter route hosting Explore. The former app/explore route and its retry boundary were removed; loading failures remain handled by ExploreLoader.
- `scripts/catalog`: import/check orchestration and transport, independently runnable without the app.

The tiny route and error boundary use the small-module exception. No new cloud file service, storage bucket, AI model or image-search infrastructure is introduced.

## Verification

After the live import, lint, typecheck, production build and all eight focused catalog tests pass. A direct application-adapter check confirms 103 joined photos from SQL, and the browser renders all 103 cards. Tests cover JSON preservation, photo coverage/classification, provider URL validation, SQL nulls/constraints/role access, database response validation, filter behavior and the narrow pre-migration preview condition.

The October 27 navigation update passed lint, typecheck and the production build. Browser checks covered default Explore entry, search results, Escape/focus restoration, retained filters across tabs, contextual Projects actions and resume form, and a 390px mobile layout with no horizontal overflow.

The distinct-photo update affects only photo enrichment; no migration is needed. Existing browser pages need a reload after the five-minute server cache revalidates.

October 27 photo validation: focused lint and all 10 catalog tests pass. The photo-only import and full Supabase comparison passed. Final global lint and typecheck were blocked by concurrent first-plan and plan-v2 edits, outside the catalog module. Details are recorded in the photo task outcome.

## Shared scrollbar treatment

`components/ui/scroll.css` is imported by the root layout. Low-priority base-layer rules give native scroll areas a thin neutral thumb and transparent track, with a WebKit fallback where standard scrollbar properties are unavailable. Existing component/utility overrides take priority. Coarse-pointer and forced-color modes retain platform defaults. Chat's auto-scrolling transparent-thumb state is explicitly preserved.

This is appearance styling, not a scrolling replacement. No wheel interception, synthetic momentum, global smooth scrolling, global gutter changes, chat anchoring changes or JavaScript scroll handlers were added. Explore's dialog contains overscroll within its one body region. Other views keep their existing scroll ownership and behavior.

2026-10-28 consumer copy audit: Place details use Hours, Price and Rating, including accessible labels. Unknown values and unchecked booking availability remain explicit.

Consumer copy audit verification: lint, typecheck and 106 targeted tests passed. Rendered Explore and Trip details were checked; no live trip or file data was changed.

### Completed starter lifecycle

With Cache Components enabled, Next preserves starter state in React Activity across navigation. `lib/start-trip/view.tsx` marks submission complete only after creation and file upload succeed. Its layout-effect cleanup resets that completed draft when navigation hides the page: busy/submitting flags, retry project reference, upload text, error and active tab. A new selection-provider key remounts the submitted prompt, file draft and selected places. Returning by a project link or browser history can therefore start a new project. The page stays locked until it actually leaves, preventing duplicate submission during navigation. Failed submissions and unfinished drafts remain editable and survive hide/show; they retain the existing retry reference when applicable. Do not only remove opacity/inert styling or clear busy immediately after `router.push`: those approaches leave stale project identity or reopen a duplicate-submit window.

The isolated fixture `tests/starter-return.tsx` exercises the real starter under React Activity with in-memory trip responses and recent-project storage. It blocks unexpected writes and never calls a model. To run manually, temporarily mount it from a development-only test route, submit, return, submit again, and inspect the request output: each successful new draft must POST rather than PATCH the previous project. Also fail a save, leave/return, and retry. Remove the route after checking. October 30 verification confirmed blank/enabled composer, no inert tabs, opacity 1 after return, two successive POST creates, and preservation/retry of a failed draft. File selection reset follows the same remount boundary but was not separately exercised with a file upload.

## Booking information ownership

Booking requirements remain canonical catalog facts. Explore cards omit them; the place dialog displays them once as neutral visiting information, including unknown values and unconfirmed availability. Plan activity details derive the requirement directly from the selected catalog record through `presentPlan`, with no agent-authored reminder or saved Plan mutation. User-reported reservation status remains distinct and takes precedence in the selected activity summary.

Catalog booking flags no longer generate Plan validation findings for the agent. The assistant must not research policies/availability, create booking reminders or delay planning because of these flags. Explicit user requests may ask for booking information, but the application never makes reservations. Existing user bookings, fixed times, evidence requirements and protection against silent changes remain intact. Budget price research is unchanged. The source data and factual tool/context fields are preserved, so factual questions can still be answered; they no longer define an automatic work item. See [guides](guides.md) for the prompt boundary.
