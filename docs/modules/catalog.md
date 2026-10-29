# Catalog queries

Implemented October 27, 2026. The supplied Italy dataset remains the source of place facts. This change unifies Explore and agent query semantics without introducing a separate city-search service.

## Ownership and entry points

`services/catalog/index.ts` owns `getPlaces`, `loadCatalog` and exact-ID `readPlaces`. The configured SQL catalog is validated against the 103 source IDs. Without configured storage, or before the catalog migration, the existing bundled preview remains available. Unexpected SQL failures are surfaced, not disguised as an empty result.

`lib/catalog/index.ts` exposes the pure `CatalogQuery`, schema, `queryCatalog` and `describeCatalog` contracts. `query.ts` owns filtering, pagination and discovery. Explore's existing `filterPlaces` is a thin adapter using the same query implementation. Its existing query/city/type controls and full-catalog API response are unchanged. The agent can use more filters without adding every filter to the UI.

`services/agent/tools.ts` adapts `describeCatalog`, `searchPlaces` and `readPlaces` to the tool interface. `services/workspace/session.ts` loads the same server catalog as Explore and caches it for the run. Tool search strips photo metadata. Plan validation continues to use the immutable supplied records through the existing plans export, which now delegates to the catalog source owner.

## Query contract

| Field | Meaning |
| --- | --- |
| query | All accent-insensitive, case-insensitive words must match across name, city, region, neighborhood, description, type and tags |
| cities, regions, types | Any selected value in each field; fields intersect |
| tagsAny, tagsAll, excludeTags | Any, every, or none of the selected tags; underscore and hyphen spellings are equivalent |
| priceRanges | Any selected catalog tier, from one to four euro symbols; these are not monetary limits |
| maxDurationMinutes | Upper bound on known duration; unknowns do not pass this explicit filter |
| bookingRequired | true/false filters known values; null imposes no restriction |
| sort | Source order by default, or descending rating / ascending duration with missing durations last |
| offset, limit | Offset pagination, default 20, maximum 200 records per result |

`describeCatalog` returns actual values and counts for cities, regions, types, tags and price tiers plus evidence limitations. `queryCatalog` returns matching records, total, nextOffset, city summaries computed before pagination and per-record matched tags/unknown fields. Neither result is stored separately. Empty results are dataset/filter results, not proof that an entire city lacks suitable activities.

Dataset tiers cannot establish an exact EUR budget, tags cannot prove accessibility, and supplied hours cannot prove live availability. Those judgments belong to the agent's evidence checks and trip-details/budget guides. There is no automatic filter relaxation or invented city record.

## Verification and iteration

`tests/catalog-query.test.ts` checks Explore/tool parity, combined filters, tag normalization, missing fields, complete city summaries, pagination and input bounds. Planning integration tests execute discovery/search through the actual SDK tool loop with mocked provider responses and a migrated PGlite catalog.

To change matching semantics, edit query.ts and run the catalog tests. To change how the agent explores and chooses cities, edit the first-plan guide and inspect the search filters/results in a local mock run or an explicitly authorized live run. This implementation has no paid live acceptance result.
