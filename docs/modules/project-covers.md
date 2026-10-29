# Project covers

Updated: October 27, 2026.

## Purpose and ownership

Project cards show up to three real Plan locations as one seamless horizontal cover. Saved Plan membership owns which locations are eligible. Catalog records own image URLs, provenance and illustrative classification. The cover is a derived view: no new database fields, migrations, local-storage snapshots or AI requests.

`services/project-covers/selection.ts` resolves scheduled non-travel items, including linked locations, and skips cancelled arrangements, missing catalog photos, invalid references and unscheduled items. It takes one distinct photographed place per day where possible, then fills remaining slots from itinerary order. The final images appear in itinerary order. Place IDs, provider asset IDs and canonical URL paths are deduplicated. Photos are never guessed from titles or repeated to fill space.

## Loading boundary

`GET /api/trips/[reference]/preview` reuses the existing account-free trip capability and Plan reader. It validates the UUID and same-origin request, reads the saved Plan and canonical catalog, and returns only `{ photos: [{ placeId, name, photo }] }`. Responses are private `no-store`, with `no-referrer`. A trip without a saved Plan returns an empty list without loading the catalog. Missing trips return 404; storage failures return 503. The endpoint performs no writes.

`lib/project-cover/index.ts` exposes the frontend module. Its controller independently loads the cover for each mounted card, at most six in the Projects grid. Pagination/unmount/reference changes abort obsolete requests. Existing trip-change events and page focus/visibility refresh the saved view. Chat inputs, project names and references remain managed by their existing modules. The preview neither fetches chat history nor sends trip references to image providers.

## Presentation and recovery

Equal-width photos touch with no gaps inside a 2.4:1 strip above the project title/date. Only the outer top corners round. One or two available photos share the whole width. Loading, absent plans and unavailable covers retain the same neutral surface with a quiet map icon; project opening stays usable. Broken image URLs are removed from the strip, with the neutral cover if none remain. A changed image URL can load again. No unrelated stock cover is substituted.

Covers contain no image badges, attribution text or attribution tooltips. Descriptive alt text identifies the actual image. Match classifications, photographer names and source links are centralized on the [Image credits page](photo-credits.md), following the user’s October 27 preference. Images use the existing responsive CDN helper, lazy loading, asynchronous decoding and no-referrer. Removal remains a separate button, readable over images, with a 44px touch target. Desktop/tablet/mobile retain three/two/one card columns. Row-mode project lists do not request covers.

## Verification

`tests/project-covers.test.ts` covers day representation, itinerary ordering, repeat suppression, sparse or absent plans, missing photos, saved membership, linked/cyclic locations, cancelled arrangements and request validation. Browser checks cover real saved-plan responses, responsive cropping and empty-state layout.
