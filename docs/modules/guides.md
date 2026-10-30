# Guiding documents

Implemented October 27, 2026. This is a small application-owned instruction library, not a generalized context-engineering system.

## Boundary

`services/assistant/agent/guides/index.ts` exposes `guidePrompt(initialGeneration, phase)` and `readGuide(id)`. `catalog.ts` owns the allowlisted IDs, titles and when-to-use descriptions. `documents/*.md` owns the complete trusted instructions. The runtime does not accept arbitrary paths, URLs, user-authored replacements or SQL-stored copies. Updating a guide is a reviewed application change.

These guides are separate from Library documents. Supporting context contains durable user-specific requirements; research documents contain evidence. Neither can override application guidance. Raw user input stays in Chat. This module adds no user document store and no second copy of uploaded files.

## Loading contract

| Phase | Automatic context | On-demand context |
| --- | --- | --- |
| Every request | Small shared guardrails, guide directory, current UTC time and existing workspace snapshot | `readGuide(id)` loads a selected document as a tool result |
| Initial requirements | first-plan, trip-details and plan-quality | Other applicable guides load on demand |
| Initial assembly | first-plan, plan-quality, plan-editing and routes-and-stays | Other applicable guides load on demand |
| Initial pricing | first-plan, budget-research and budget-editing | Other applicable guides load on demand |
| Initial final review | first-plan, plan-quality, plan-editing and budget-editing | Other applicable guides load on demand |
| Existing Plan | Directory only | Plan edits, budget research and budget updates load relevant guides |
| Pending Budget price checks | Full budget-gaps guide attached to createBudget/editBudget/commit tool results | Research and editing guides remain available |
| Retry after saved operation | Existing receipt in workspace | Agent must explain the receipt rather than replay edits |

Automatic packs follow accepted progress: no Plan, incomplete daily assembly, unfinished pricing, then reviewed costs. The full first-plan workflow remains present in every initial phase. These packs replace repeated inclusion of all six long guides; they do not remove active tool or provider reasoning history.

Detection is project-based. Creating another chat does not make an existing itinerary a first generation. If another writer changes the project during a run, reload returns current artifacts and clears staged edits; initial instructions do not authorize overwriting the new state.

The first-plan guide gives the overall workflow. plan-quality owns itinerary completeness and a fictional worked example. trip-details owns field definitions, missing-information behavior and brief maintenance. It does not duplicate the full pricing specification. Code enforces a nonempty staged Budget for an initial Plan commit, valid money/source structure, revision checks, source provenance and explicit handling of missing-price checks. Research relevance and price applicability remain judgments guided by these documents.

## Documents

- `trip-details`: sourced requirements, per-field defaults and uncertainty, Travel brief sections, checkpoint/revisit behavior and selective confirmation questions.
- `first-plan`: understand/save the brief, explore cities/core activities, build days, validate/research costs, then review/commit/confirm. Earlier steps can be revisited.
- `plan-quality`: complete daily arrangements, nearby supporting activities, meals, movement within and between cities, overnight coverage, feasibility tradeoffs and explicit sparse-day exceptions. Its fictional non-Italy example illustrates relationships rather than a route to copy.
- `plan-editing`: stable Plan identity, protected arrangements, durable supporting context and ownership boundaries.
- `budget-research`: estimate versus exact applicable price, units/quantities/scope, missing prices, real evidence, coverage and exclusions.
- `budget-gaps`: targeted follow-up, immediate price evidence capture, bounded unresolved-cost handling and honest partial totals. Automatically attached with pending checks.
- `budget-editing`: preserving unrelated costs, price refresh, changed itinerary reconciliation and review acknowledgment.

Existing `services/assistant/agent/context/instructions.ts` retains common source trust, catalog restrictions, save-receipt rules, conflict behavior and reply style. Task-specific detail moved into the guides. The model stays on the existing Vercel AI SDK and configured model; no new model-selection system was introduced.

## Runtime and verification

Only catalog IDs resolve to files. Reads are local and bounded by the allowlisted guide directory. `next.config.ts` includes the Markdown assets in API output tracing so deployed functions receive them. No arbitrary filesystem capability is exposed to the agent.

Web research now defaults enabled; `AGENT_WEB_SEARCH=false` explicitly disables it. The initial workflow still records unknown costs with reasons when search is unavailable. Search adds provider cost and latency. SDK source extraction was checked against the installed provider implementation and the [official web search guide](https://developers.openai.com/api/docs/guides/tools-web-search) on October 27, 2026. This source verifies the search/citation mechanism, not real account availability or the factual correctness of generated estimates.

Tests reject path traversal, verify the automatic first-guide distinction, and exercise readGuide through a real SDK loop using mocked provider responses. Integration tests verify search source events reach Budget provenance validation. A subsequent user-approved live generation confirmed that the agent reads plan-editing and budget-research. It did not produce priced entries, so research quality failed that acceptance test even though guide discovery and loading worked. See budget.md for the evidence-handoff investigation.

Keep public code responsibilities coarse: directory metadata, loading/orchestration and task documents. Add a guide only for a distinct reusable workflow, not for every field or tool. Update this guide and relevant tests whenever discovery, loading, trust or phase rules change.

Budget-specific check data and completion state live in Budget. The Agent tool adapter attaches `readGuide("budget-gaps")` when a result contains an incomplete budgetCheck. This is a small explicit integration, not a general context routing engine. Guide Markdown remains the sole owner of research/recovery instructions; Budget code owns enforceable conditions.

A second authorized live run confirmed automatic missing-price guidance and follow-up execution, but exposed confusion between the former internal `webSearch` alias and the provider's search tool. All model-facing references now use `web_search`, and research/recovery guidance explains automatic URL registration. The updated SDK regression verifies no obsolete alias appears in provider-visible instructions. Real price extraction after this naming correction remains unverified; see the follow-up acceptance record in budget.md.

## Trip-details integration

Travel brief is the existing single planning_context Library document, not a second store. It summarizes saved user evidence and distinguishes requirements, assumptions and questions. Plan owns scheduled facts; Budget owns normalized limit/scope and cost facts. Before Budget exists, the brief may hold a sourced budget request; afterward it references Budget instead of maintaining another numeric limit.

The initial instructions ask the agent to checkpoint the brief before research. Later turns discover trip-details through the directory and shared guidance when requirements change. There is no hard-coded field interview or mandatory question step. Tool-level validation checks revisions, document scope and run state, but does not assess whether the prose correctly captures every user preference. This remains a behavior to evaluate.

The new mock SDK regression exercises saveBrief, describeCatalog, searchPlaces, readPlaces and final planning commit in one run. It proves tool wiring and persistence, not autonomous model adherence or itinerary quality. No paid live generation was run for this change.

## Action feedback integration

October 28, 2026: application-tool guidance and domain data now live inside the shared action result's data field. The envelope reports outcome, effect, stable code and recovery instruction. Common action semantics are in Agent's system guidance; Budget and other workflow documents remain centrally managed here. Guides do not declare an operation saved. Receipt verification and runtime completion checks enforce that distinction. See [Agent action results](agent-actions.md).

## Itinerary quality standard

October 28, 2026: plan-quality is automatically included in first-generation context, avoiding an extra guide-loading step for this essential standard. Later itinerary edits load it through plan-editing. It owns the quality definition; first-plan owns workflow and plan-editing owns representation/protection rules. The previous exact multi-city test example was removed because it prescribed a single-base answer instead of requiring route evaluation.

The review examines actual scheduled items and overnight coverage, not labels or Budget alone. A daily anchor is a minimum organizing element, with supporting nearby activities, meals and travel where applicable. The fictional example is explicitly not evidence or a destination recommendation. No fixed event-count gate, schema change or new model is introduced. Existing typed Plan validation still checks structural validity; guide adherence and semantic completeness require live acceptance testing.

October 29, 2026: plan-quality now makes a suggested local-clock timetable the normal output, with start times plus durations/end times, geographic order and practical buffers. Its fictional example illustrates an actual timed day. first-plan invokes that standard instead of preferring period-only scheduling; plan-editing maps it to the existing suggested/fixed time fields and alternative start+duration/start+end representations. Explicit flexibility stays available. No UI or schema change is needed: the single-day view already displays saved clock times. This changes generation guidance; existing period-only Plans acquire times when the agent is asked to revise them.


October 28, 2026: trip-details and plan-editing explain that late saveBrief calls stage changes for final publication when other artifacts are pending. This is a supported transition, not a failed checkpoint. Initial brief checkpoints still persist before research; final save receipts remain the completion authority.


The same recovery follow-up routes price research through researchWeb, which returns readable sourced facts to subsequent planner steps. budget-research and budget-gaps explain using that report and preserving supported estimates after a successful proposal. Raw web_search remains available for direct lookups. This addresses a failed live trace that repeatedly replaced sourced numeric proposals with unknowns; the new research handoff passed offline checks and the separately authorized follow-up live acceptance, which retained all six researched estimates and completed the save in 97 seconds.


## V2 tool guidance

Trusted guides now use createPlan/createBudget when absent, editPlan/editBudget for existing artifacts, createDocument/editDocument for Library text, and inspectChanges for review and final save verification. The host supplies mechanical tokens at execution; retired versioned callers are not retained. There are no mandatory redundant rereads. The initial workflow applies to itinerary requests, not unrelated document-only work. Partial edits preserve unrelated facts and costs, while coordinated changes still publish once through the existing commit.


## Concrete meal choices

October 29, 2026: plan-quality requires suitable dataset venues first, followed by sourced external restaurants when the dataset cannot fit the meal or route. The fictional example now names fictional cafes and restaurants instead of modeling generic meal placeholders. plan-editing documents the narrow restaurant location, actual retrieved source URLs, unchanged-evidence reuse and unknown coordinates. first-plan delegates meal selection to that standard, and budget-research keeps aggregate meal costs distinct from itinerary venue selection. New placeholders fail Plan validation; legacy unchanged meals warn without blocking unrelated edits. Restaurant research and source checks do not establish a reservation or confirmed opening on the visit date.


## Supporting planning documents

October 29, 2026: planning-documents is a discoverable reusable guide for independently maintained Research notes.md (research kind) and Planning decisions.md (working kind). Both are absent until useful reusable evidence or a material decision exists. Common guidance, first-plan, plan-editing and budget-research invoke the lifecycle. Existing manifest metadata and create/read/edit document tools provide discovery and progressive loading; no new storage kind, model or migration is required.

Research records findings, direct source URLs, actual checked dates, applicability and outstanding external checks. Decisions record current choices, concise rationale, tradeoffs and useful alternatives. Travel brief remains authoritative for user requirements and questions; Plan and Budget remain authoritative for selected arrangements and money. Read the relevant existing file before affected edits, update that same file while preserving unrelated sections, retain dates on reused evidence and publish dependent changes together. Generated documents do not establish user confirmation or independent verification. Code still owns live validation; raw check reports and work diaries are not document outputs.


## Routes and stays guide

October 29, 2026: routes-and-stays is discoverable for researched hotel selection and map-supported timing changes. first-plan, plan-quality, plan-editing and common guidance point to it. It separates web identity/prices from positioning/routing, requires fixed-booking preservation and explains automatic checks, budgets, uncertainty, unsupported transport and corrective action.

## Booking requirements as display facts

October 30, 2026: Catalog booking requirements are system-owned information in Explore place details and Plan activity details. The primary guidance excludes automatic reservation-policy or live-availability research, booking reminders and planning delays caused by these flags. Explicit user requests may authorize informational booking research; no reservation is made. First-plan, plan-quality, routes-and-stays and the research helper no longer demand booking checks as routine work. Plan-editing retains correction of already-known stale instructions without launching new booking research. Actual user-reported bookings and fixed commitments retain their existing evidence and preservation rules. Ordinary researched Budget estimates remain required. The catalog requirement no longer generates an agent-facing validation warning.

`tests/booking-details.test.ts` covers non-blocking flag behavior, true/false/unknown detail projection, rendered card omission and real activity-detail display without authored notes, plus the prompt boundary. Existing Plan tests cover commitment protection. Prompt tests verify declared instructions, not a guarantee about every model response; no paid model run was used for this change.
