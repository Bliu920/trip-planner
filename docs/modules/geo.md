# Locations, routes and feasibility

Implemented locally with the forward migration applied to the existing Supabase project. Verified documentation on October 29, 2026. Provider access remains untested until HEIGIT_API_KEY is configured.

## Boundaries

- services/geo/index.ts orchestrates cached position/route lookups. client.ts owns bounded HTTPS calls and response validation. matching.ts owns conservative address matching and coordinate/distance helpers. store.ts owns trip-scoped immutable evidence RPCs and canonical cache keys.
- lib/journeys/types.ts and model.ts own transport contracts and pure movement derivation. index.ts exposes the public API. view.tsx owns independent day loading and honest route status. lib/plan/timing.ts supplies shared local-calendar windows, including maximum ranged durations.
- services/feasibility/index.ts derives and checks the final Plan, with at most three concurrent workers, 24 cache-miss provider calls and a 12-second per-check deadline. routes.ts owns point resolution and geo-reference validation. http.ts serves cache-only day reports through the public module entry.

These modules keep the existing Plan, Budget and Library authoritative. Research notes/Planning decisions preserve useful evidence and choices, not copied route reports or another schedule.

## Evidence and trust

The private geo_evidence table stores application UUID, trip reference, canonical cache key, position/route kind, normalized payload, checked timestamp and expiry. Position TTL is seven days; route TTL is one day. Rows are immutable through the exposed RPCs. The service role alone can read/insert; normal clients cannot query them. A Plan trigger rejects map references belonging to another trip. Host validation also binds venue position references to the exact researched name/address/city and coordinates. API references use SourceRef type geo, never fabricated web URLs. Pelias result identifiers are not durable application identities.

Researched hotel and restaurant locations share identity/address/web-evidence fields and optional geoEvidenceId, while preserving existing restaurant JSON. New non-null researched venue coordinates require a host position reference. Hotels are only valid as stays, restaurants as meals; public attractions remain supplied records. Users' specified properties and explicitly provisional base areas retain their existing semantics. Unknown positions are never substituted with area centers. Stored legacy coordinates remain readable, but unreferenced researched coordinates are not used as verified routing positions.

Matching requires Italy, an applicable city/local administration, address/venue precision, street tokens and the house number. Common English/Italian city names are normalized. A score or first candidate alone does not establish identity. Multiple distinct exact-address positions remain ambiguous. This conservative first version can leave uncommon address formats unresolved; web identity and geo positioning remain separate evidence.

## Routing and time

Directions use foot-walking or driving-car on api.heigit.org, with ferries excluded. Inputs/GeoJSON use longitude,latitude; the map adapter converts to latitude,longitude. Provider distance is meters and duration is seconds. The suggested allowance adds 20 percent plus five minutes, rounded up to five minutes; that is a product rule. Same mapped coordinates require no transfer and do not fabricate a route lookup. Snapping beyond 100 meters remains unverified pending an entrance check.

The current Plan determines all legs, including unrecorded transfers and covered overnight connections. Explicit travel consumes its own allocated duration and cannot borrow a larger gap to hide an undersized travel item. The upper duration bound participates in activity overlaps and journey feasibility. Arrival/departure markers do not become zero-minute complete journeys. Mixed undated/dated windows remain unverified rather than comparing unrelated calendars. Fixed user arrangements stay protected.

Title/reason edits preserve routing keys. Time edits recompute feasibility without refreshing fresh route data. Changed locations, directional order, mode or options select different evidence. Server-side deadlines and request allowances return incomplete checks honestly. Train/bus/flight/ferry schedules are outside this first version and require separate research.

## Integration and display

Agent proposals, manual saves and final commit invoke the same checker. Known conflicts block a save unless an explicit conflict note links the affected arrangements, in which case conflict status remains visible. Unverified checks can accompany saved drafts; saved does not mean routes checked. Missing overnight coverage produces an explicit advisory and an unverified report. Definitively rejected manual route edits leave the form correctable; ambiguous failures retain normal retry identity.

When the key is present, resolvePlace and getJourneys join the existing tool registry. The latter checks the current accepted Plan; AI cannot validate a subset instead of the final itinerary. Tools receive concise labels, evidence IDs, distances, estimates, allowances and findings, with geometry removed. Existing web-source checks still apply to hotel identity and prices.

GET /api/trips/[reference]/journeys?day=...&revision=... loads only the requested day's cached geometry/check results, without making provider requests. Revision mismatches reject stale views. Day context distinguishes checked, unverified and conflict, shows partial mapped walking and suggested allowances, and draws route geometry with provider attribution. Geometry cannot leak into the AI context through the journey report. Pending client edits suppress stale saved-route results.

## Configuration and verification

Set HEIGIT_API_KEY only in the ignored server .env or deployment server environment. No public key variable is used. Apply 20261029092500_geo_evidence.sql before enabling positioning. The project migration was applied through the existing Supabase Management API login and its read RPC verified without trip mutation. No database password or key was exposed.

Deterministic tests cover position ambiguity/wrong cities, evidence isolation, implicit/explicit journeys, time edits/cache reuse, new endpoints, provider failure, unknown positions, final-commit rechecking after expiry, researched hotel persistence, direct editing, anonymous SQL denial and bounded lookup budgets. The full suite passed 367 tests. Lint, typecheck, production build, a focused lodging-reminder render test and desktop/mobile synthetic previews passed. No live provider success is implied by mocked tests.

Official references checked October 29, 2026:
- [HeiGIT endpoint migration](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912)
- [Directions requests and return types](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types)
- [Routing options including ferries](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options)
- [Pelias response and confidence semantics](https://github.com/pelias/documentation/blob/master/response.md)
