# Budget

Status: implemented with automated coverage. The Budget migration was applied on October 27, 2026. The original real-provider run saved six unknown costs. A separately authorized post-check run exercised gap feedback and follow-up, but failed acceptance: the agent confused the internal search alias with a missing workspace evidence tool and supplied no current input ID at commit. Search naming and current-input binding were then corrected and locally tested. These final corrections have not had another real-provider run.

## Responsibility

Budget owns the trip's cost records and their evidence. It works through its own read/write API and manual UI without an AI agent or a saved Plan. Agent is a client of this module. Workspace places its surfaces beside Plan, Trip details and Library. The workspace reveals the Budget tab when a saved Budget exists, independently of Plan availability. A Budget arriving before Plan leaves chat visible and does not open the content panel. Library remains explicitly accessible at the regular width. BudgetPanel optionally reports saved availability and errors from its existing session through onAvailabilityChange; this adds no data requests.

Plan owns arrangements. Budget references their stable IDs, but does not copy the itinerary. Library owns uploaded files and editable research documents. Guiding documents are application instructions, not user research. Budget owns its spending limit; do not maintain another copy in supporting context. Old free-text statements are historical evidence, not a second editable cost ledger.

## Structure and loading

| Boundary | Responsibility |
| --- | --- |
| `lib/budget/index.ts`, `model.ts`, `checks.ts` | Public domain contract, validation, calculation, display formatting and derived price coverage |
| `lib/budget/ui/index.tsx` | Public provider, compact summary card and full panel; composition and shared project state |
| `lib/budget/ui/session.ts` | HTTP transport, revisions, retained retry identity, read cancellation and refresh coordination |
| `lib/budget/ui/components.tsx`, `budget.css` | Grouped cost disclosure, evidence and controlled manual editing |
| `services/budgets/index.ts`, `database.ts`, `review.ts` | Scoped HTTP, storage transport and per-run missing-price publication policy |
| `app/api/trips/[reference]/budget/route.ts` | GET and PUT adapters |

One BudgetProvider per project loads one snapshot for both the Plan summary card and Budget tab. The card opens the tab. Plan presentation receives a ReactNode slot and does not import Budget storage or duplicate totals. The UI snapshot also includes the current Plan so the editor can select and validate item references. This is a read view, not another saved Plan.

## Authoritative data

One `budgets` row per trip stores JSONB content, the reviewed Plan fingerprint, and an update timestamp. Unlike Markdown supporting context, these are typed, calculable price records. No matching Markdown copy is maintained. Initially the row is absent (`budget: null`), and the card says it has not been estimated. There is no draft/ready status.

| Field | Meaning and missing behavior |
| --- | --- |
| `currency` | EUR for version one. No implicit exchange conversion |
| `scope` | `party` or `per_person`. Party requires traveler count; unknown party size can use an explicitly assumed per-person estimate |
| `travelers` | Known party size, otherwise null |
| `limit` | Optional user spending ceiling in the same currency and scope as the estimate. Null means no user limit, not zero |
| `assumptions` | Estimate-wide conditions such as unspecified dates or room sharing |
| `exclusions` | Explicit omissions, such as flights or optional unselected activities |
| `entries` | Selected trip costs, at most 100. Alternative options are not all included in the total |

Every entry has a stable ID, label, category (`stay`, `transport`, `food`, `activities`, `other`), related Plan item IDs, unit, integer quantity, pricing kind, nullable unit minimum/maximum, assumptions and evidence. Unit prices have at most two decimal places. Totals multiply each unit range by quantity once, using integer cents. Changing scope or party size requires reviewing quantities and shared costs, not merely multiplying the final total.

- `estimated`: sourced range or point estimate, with explanation of assumptions and applicability.
- `confirmed`: exact applicable price with evidence. The UI says “Price verified”. This does not represent a booking, payment or future price guarantee.
- `unknown`: both amounts null, with a reason. It remains visible and is excluded from the priced subtotal. Known free costs can use a sourced exact zero.

Evidence contains a title, HTTP(S) URL or project document ID, optional exact editable-document revision, checkedAt timestamp, and a concise explanation of what the source establishes. Original uploads use a document ID without a revision. Editable documents use their content revision. Current document navigation opens the Library detail; the cited revision remains recorded in Budget even if Library's current content is newer. The evidence display uses the UTC check date, consistent with the date editor.

Totals, category grouping and priced/unknown counts are derived. When any entries are unknown, the UI labels the amount as a priced subtotal. This is not an assurance that the agent identified every possible cost. Guides require major-category coverage and explicit exclusions; semantic completeness still needs product evaluation.

## Data flow

| Operation | Reads | Writes / result |
| --- | --- | --- |
| Open Budget or Plan | Budget snapshot and project revision | Shared UI state; no mutation |
| Expand a cost | Saved entry evidence | Source links, dates, assumptions; documents use Library's existing detail surface |
| Manual edit | Captured budget revision and current Plan | Complete validated budget replacement with a stable save request ID |
| Initial agent generation | User input, Plan proposal, budget research guide and real retrieved sources | Private Plan and Budget proposals, optional Library research files |
| Follow-up research | Current Budget, changed Plan, prior sources and guide | Changed costs, preserved unrelated entries and reused evidence timestamps |
| Commit | Expected project revision and validated proposals | Plan, Budget and prepared document pointers publish in one transaction |
| Plan changed later | Current Plan fingerprint versus reviewed fingerprint | Derived needsReview warning; old cost evidence remains intact |

`proposeBudget` stages only. New web evidence must appear among actual provider search sources, opened page URLs or citations collected in the current run. Existing identical evidence can be reused without changing its timestamp. This validates provenance, not whether the page supports every claimed amount. Documents are checked for project ownership and version existence at publication. Agent-authored research is never user confirmation.

The first agent-generated itinerary cannot commit without a nonempty staged Budget. Unknown entries trigger mechanical feedback. They satisfy publication requirements only after targeted follow-up and explicit gap resolution, or an honest search-disabled explanation. First-generation detection uses absent/empty saved Plan, not chat count or the legacy planning_started flag. A new chat on an existing Plan is a follow-up.

A reviewed budget is matched to the exact Plan at the time it was checked. Any Plan-content change conservatively marks it for review, even a title edit. The user or agent can explicitly review the whole budget against the current Plan. A partial edit preserves an existing stale flag. If the agent changes the staged Plan after reviewing Budget, the commit does not falsely acknowledge that new Plan. Unknown prices can remain after review; reviewed does not mean every amount is verified.

## Consistency and recovery

`20261027092518_budgets.sql` adds Budget tables and commands, extends workspace snapshots, and introduces `planning_commit_budget` alongside the existing compatible commit command. All writes share the trip lock and environment revision. Budget does not introduce a second concurrency counter. Browser database roles cannot read or execute these contracts; the existing account-free trip capability and server boundary apply.

Manual writes use a unique request ID and payload hash. A retry after a lost response returns the existing receipt and latest snapshot, without overwriting a newer change. A reused ID with changed contents is rejected. Failed saves retain the exact pending request and lock further edits until retry or deliberate discard/reload. Read responses cannot replace newer state, and external refreshes during saves are queued. Forms capture their starting revision, so an agent update cannot be silently overwritten by an open form.

Plan item references are checked on proposal and commit. If an arrangement was removed, the manual editor shows the obsolete reference and allows unlinking it; deleting a booking from Plan never cancels the underlying booking. Original receipts and research documents stay in Library. A source validation failure rolls back Plan and Budget publication together.

## UI and scope

Budget tab shows a compact heading, one prominent amount with its scope and missing-cost coverage, grouped cost rows, expandable evidence, and collapsed exclusions. The Plan card stays small and uses the same data. Desktop and 390px browser checks cover opening the tab from the card, source disclosure, manual limit/quantity edits, save feedback and synchronized totals.

Version one excludes expense tracking, payment processing, booking, automatic currency conversion and automatic scheduled price refreshes. The editor can add URL evidence; document citations inserted by the agent are retained and can be opened through Library. Source applicability and completeness remain agent/user judgments, not guarantees from JSON validation.

## Verification and maintenance

Pure validation and calculation tests, PGlite migration/service tests, revision/retry client tests, and real-SDK mocked provider tests cover the independent module and its integration. The SDK fixture includes guide discovery, web search source events, cost proposal and atomic commit. A separate browser fixture blocks external API traffic and uses disposable PGlite data. It is explicitly labeled as test data.

Maintain this guide with schema, storage, AI-contract or UI changes. Keep Budget testable without a real model or database service. Related guides: [Plan](plan.md), [Agent](agent.md), [Guiding documents](guides.md), [Library](library.md).


### Real-provider acceptance result, October 27, 2026

The user approved exactly one real AI generation. A separate QA project (`93805157-25f4-4cc0-bc9c-13446491ba8a`) was created. The test harness initially omitted conversation creation and received HTTP 404 before any model invocation. It then initialized a conversation in the same project and made the one approved generation request. No second real generation was attempted.

Observed: the agent loaded plan-editing and budget-research, searched the catalog, called hosted web search, proposed a valid three-day/15-item Plan, staged supporting context, proposed Budget and committed once at project revision 3. Six cost entries covered lodging, meals, local transport, combined Colosseum/Forum tickets, Pantheon tickets and accommodation taxes. All six had null amounts and empty sources. Missing dates and limit remained unspecified as intended. The final reply explicitly admitted no indicative estimate was produced.

The web-search event returned source URLs including ATAC and Colosseum official pages. The agent subsequently said price evidence was unavailable. The installed SDK's visible web-search tool output and stateless replay contain action metadata and source URLs, not an explicit price-fact result. This was a possible evidence-handoff gap to investigate, not proof of the sole root cause: the model's private search context was not inspected, and no comparison run was authorized. Merely adding more generic prompt instructions or marking the storage test successful would not establish research quality. The next fix must carry usable price facts and their applicability into subsequent planning steps, then pass a separately authorized real acceptance test.

Evidence: `.local/budget-live-stream.txt`, `.local/budget-live-result.json`, `.local/budget-live-result.png`. Existing automated tests verify transport/schema/publication and do not establish that a real model extracts prices successfully. This live result supersedes any inference of complete budget-research readiness from those passing tests.

## Price-gap feedback and module ownership

Budget owns `checkBudgetPrices`, a pure derived report with total/priced/unknown counts, coverage and missing-price findings. `BudgetReview` owns the per-run completion policy. Neither owns prompt text or provider calls. Agent tools map pending Budget checks to the centrally owned `budget-gaps` guide. Workspace coordinates proposals and enforces the policy before preparing document bytes or executing the atomic commit. There is no generic checks framework: future modules should own their checks, with workflow adapters connecting their reports to guidance.

The sequence is: propose Plan, research prices, promptly stage factual prices/evidence in Budget, receive mechanical feedback, perform targeted follow-up, propose corrected costs or resolve remaining gaps, then commit. `proposeBudget` returns `budgetCheck`; `commit` returns `saved:false` plus the same actionable report while gaps remain. Guide text is automatically attached by the agent adapter, including after a premature commit. Structural validity is separate from research completion.

`resolveBudgetGaps` accepts pending entry IDs, one reason (`search_unavailable`, `not_found`, `missing_details`) and a concrete explanation. Search-disabled claims are checked against host configuration. When search is enabled, an observed hosted-search completion after the gap was first reported is required before accepting unresolved costs. The code observes execution, not whether the query was sufficiently relevant or the explanation truthful. Guidance limits unproductive retries to one targeted follow-up per unresolved group. Missing dates/party size should normally lead to indicative/per-person estimates, not blanket unknowns.

Resolutions append concise findings to existing entry assumptions. Amounts remain null; evidence stays with the cost. No new SQL field, duplicate document or persisted review log is introduced. The gate's state is private to a run. Changed costs/scope/Plan and reload reopen checks. Evidence enrichment of an already pending cost preserves its research progress. Limit-only partial edits can preserve identical existing unknown costs with reviewed false and unchanged Plan/scope. Manual Budget editing remains independent of this agent workflow.

A resolved gap means a limitation was explicitly handled, not that the price is known. The UI still shows partial subtotals and unknown entries. JSON/source/provenance checks cannot establish factual price correctness or discover omitted cost categories; those remain guidance and acceptance-test concerns. Existing CAS, project isolation, source validation, atomic commits and receipts remain enforced.

Regression coverage reproduces six unknown entries, an attempted premature commit, automatic guide feedback, a subsequent hosted-search event, a supported synthetic price and explicit remaining gaps through the actual SDK with mocked provider responses. Separate tests cover disabled search, duplicate/wrong IDs, repeated proposals, changed cost/scope/Plan, evidence enrichment, reload and unchanged-cost partial edits. This verifies workflow enforcement, not real search quality.

### Authorized follow-up acceptance, October 27, 2026

One additional real generation was explicitly authorized in this task. QA project: `66af0e2a-25b2-455e-b83f-8b6e762ac54d`. The agent loaded guides, selected catalog places and proposed a Plan. After initial research it proposed six unknown costs. The new mechanical report correctly returned all six pending IDs and the recovery guide. The agent performed another hosted-search call, then explicitly resolved the six gaps. This demonstrates the recovery path actually executed.

Acceptance still failed. The explanation said the browser had found hotel/transit/ticket amounts but a separate workspace webSearch evidence tool was unavailable. The final response even contained numeric ticket/transit amounts. That is direct evidence of a tool naming/provenance misunderstanding, not proof that the model never received price facts. The commit also passed handledInputIds:[] and was rejected for omitting the current input. No Plan or Budget was saved. The model's final explanation incorrectly attributed the save rejection to unpriced costs.

Follow-up corrections: the runtime tool key, prompt, guides and source callback now consistently use the provider-facing name `web_search`. Guidance states that retrieved URLs are registered automatically and are directly usable in proposeBudget, with no second evidence-registration tool. The commit tool binds the authoritative current message ID from the environment; the model only selects additional pending IDs. Workspace still validates every supplied ID and the price gate still applies.

Real-SDK scripted tests now assert the provider-visible instructions contain no obsolete webSearch alias, source provenance still works, and an empty additional-input list still saves the current turn. No third real generation was run. These corrections need a future separately authorized live acceptance check; passing mocks cannot establish research quality.

Evidence: ignored `.local/budget-fix-live-stream.txt`, `.local/budget-fix-live-result.json` and `.local/budget-fix-live-attempt.json`. The run guard prevents reuse of the consumed authorization.

## Research-informed estimates

October 28, 2026: normal completed budgets should price every included cost. The maintained budget-research guide defines the fallback: applicable quote, comparable numeric evidence, then a clearly labeled derived range. Missing exact travel dates, hotel selection or party size should lead to provisional assumptions rather than routine unknowns. Source details retain the actual quoted facts, while entry assumptions explain extrapolation and units. The existing estimated schema already represents this distinction; no database or evidence-validation changes are needed.

The gap-resolution escape remains available for exceptional evidence failures and preserving incomplete work. It is not a claim of budget completeness. The UI continues to identify partial subtotals. Scripted provider tests verify that researched ranges survive proposal, calculation and publication; real model research quality still requires live acceptance testing.

2026-10-28 consumer copy audit: Source versions remain available for identifying cited documents; raw plan-item IDs are not displayed. Invalid links identify the affected cost by name. Form errors avoid raw schema diagnostics.

Consumer copy audit verification: lint, typecheck and 106 targeted tests passed. Rendered Explore and Trip details were checked; no live trip or file data was changed.


## Day-view composition

Updated 2026-10-28. `dayBudget` in `lib/budget/day.ts` is a pure projection over the existing Budget entries and the displayed day's ordered item IDs. It neither changes saved entries nor allocates costs by guesswork. Entries wholly linked to that day enter the subtotal exactly once, with quantity applied by budgetTotals. Bundles linked to items outside the day are shown separately and excluded from the subtotal. Unlinked trip costs, including stays, remain in the full Budget. Unknown prices remain unknown; missing links never mean free.

`DayBudgetCard` is the public provider-connected surface in `lib/budget/ui/index.tsx`. It reuses BudgetProvider's existing session and subscriptions. `ui/day.tsx` renders the subtotal, scope, source links, estimated/confirmed state, unknown costs, shared costs and plan-change warning. Saved document evidence remains accessible through Full budget & sources. An unavailable Budget has an explicit state and a route to the full Budget controls. No second fetch/store is introduced.

Workspace passes this surface into Plan's day-context slot. Budget owns all money logic; the Plan module supplies only item IDs and never imports the Budget store. Day totals are read-only views, not new database records. Reassigning an activity automatically changes the next derived daily subtotal without rewriting source evidence.

`tests/budget-day.test.ts` covers quantities, once-only counting, cross-day bundles, missing amounts, empty days and activity movement. Existing Budget edit/save/review behavior is unchanged.

The day spending card is collapsed by default with only its subtotal, party scope and concise partial/review status visible. Price rows, source links, missing-price explanations, shared costs and the full Budget entry point remain inside the disclosure. This reduces default reading load without implying an incomplete subtotal is the whole day's cost.


## V2 agent cost editing

readBudget supports full, summary, category, entry and Plan-link selections from effective drafts or the pinned saved base. createBudget initializes an absent estimate; editBudget applies atomic scope/limit/assumption/exclusion or entry operations. Omitted fields preserve original values and evidence timestamps. recordReview comes after content operations and binds to the host's effective Plan under the existing review persistence model. Requirements-aware durable review fingerprints remain deferred.

Structurally valid drafts can temporarily contain missing Plan links during coordinated edits; inspection exposes these blockers and final publication rejects newly staged invalid links. Routine costs still need evidence-backed numeric ranges, and existing exceptional missing-price recovery stays available. Price coverage and initial-draft readiness are derived findings, not new stored Budget fields.
