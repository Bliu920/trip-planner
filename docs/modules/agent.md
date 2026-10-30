# Agent

Owner: model execution, public tools, guidance and completion. Updated October 30, 2026. This document describes the current authoring contract; historical experiments remain in [browser records](../testing/browser/README.md).

## Boundaries

| Module | Owns |
| --- | --- |
| services/assistant/agent/index.ts | Public full-harness entry |
| services/assistant/agent/loop.ts | Bounded execution and recovery, authoritative stop classification |
| services/assistant/agent/model.ts | One Responses model/tool pass |
| services/assistant/agent/context/ | History, selected originals and dynamic instructions |
| services/assistant/agent/authoring/ | Semantic command schemas and conversion to domain operations |
| services/assistant/agent/tools/artifacts.ts | Validated public artifact capabilities |
| services/assistant/agent/actions/ | Typed outcomes, mutation identities and receipt-based completion |
| services/workspace/ | Effective state, source handles, proposals and atomic publication |
| services/workspace/drafts/ | Private accepted-progress lifecycle |
| lib/planning-review/ | Pure shared blockers and advisory quality findings |
| services/assistant/ | Turn/generation reservation, transport and reply persistence |

Plan, Budget, Library and Chat keep their existing ownership. The agent has no arbitrary shell, SQL or filesystem tool. External research supplements the supplied Italy places; named attractions remain catalog-backed.

## Public authoring

createPlan initializes the start date and three day headers. editPlan adds or updates activities, stays and travel with ordinary place, venue, clock and duration fields. createBudget initializes settings; editBudget adds/updates costs with explicit price scope, occurrence quantities and source handles, then reviews the complete estimate. Creation and later edits use the same semantic commands. Batches contain at most twelve commands.

The host constructs nested location, evidence, timing and coverage objects. It supplies mechanical edit tokens only at execution. Tokens never enter model arguments, context or tool results. Internal/manual APIs retain their concurrency checks. There is one public authoring protocol. The former AGENT_AUTHORING_VERSION setting is retired and ignored. Full-artifact creation/replacement and low-level domain commands are rejected at the public tool boundary. Internal proposals, editToken, revisions and receipt checks remain in use.

| Purpose | Public tools |
| --- | --- |
| Context/guidance | readEnvironment, readGuide |
| Library | listDocuments, readDocument, createDocument, editDocument, saveBrief |
| Plan | readPlan, createPlan, editPlan |
| Budget | readBudget, createBudget, editBudget, resolveBudgetGaps |
| Places/evidence | describeCatalog, searchPlaces, readPlaces, readMessage |
| Online research, when enabled | researchWeb, web_search |
| Map evidence, when configured | resolvePlace, getJourneys |
| Review/publication | inspectChanges, commit, reloadWorkspace |

With research and maps absent, the registry exposes 21 tools. The overlapping addDayActivities, standalone addStay and addBudgetCosts tools have been removed. The addStay command inside editPlan remains available.

## Workflow and context

The first request loads the relevant generation guides. It saves the Travel brief first, explores places, builds daily arrangements in small batches, prices the selected itinerary, repairs checks and publishes once. Incomplete input uses explicit defaults and proposals; follow-up questions come after the first draft. A recommendation or saved Brief alone is insufficient.

Effective reads include accepted working changes. Saved reads use the pinned public base. Scoped Plan/Budget reads and independent Library document loading keep boundaries clear. Runtime context refreshes after each step, with a bounded Brief and manifest rather than repeated stale copies. Larger artifacts require scoped reads. Raw user input stays in Chat; Research notes preserve external evidence and Planning decisions preserve material choices, not private reasoning or duplicate ledgers.

Routine context includes active sources and the latest sixteen discoveries; all exact handles remain in the server index. Safe step diagnostics record instruction/history byte lengths and message count, not raw contents. Sources receive short operation-scoped handles that expand to original URLs/document versions and checked times. Reuse preserves original timestamps. A new confirmed document-backed user price needs a current updated Brief version, not a stale document citation. This enforces version ownership, not semantic proof of every quoted fact.

Routine route context groups repeated uncertainties while preserving exact conflicts and unknown coverage. Full getJourneys results remain available on demand, and identical journey warnings keep the union of all affected IDs. Checks separate hard structural/source/protected-fact failures from advisory completeness. Repairable time conflicts can remain accepted working content, but final publication remains strict. Uncommitted activity kinds can be corrected; booked/kept/fixed facts and stay/travel boundaries remain protected. A complete valid activity replacement resolves its target's rejected fields. Corrected unaccepted creations track their day intent rather than the model's mistaken activity role. Other targets/days retain their obligations. Known deleted IDs are idempotent during a request and its Retry; never-known IDs still reject. Rejected obligations survive unrelated successful changes and reload.

After verified publication, a final-only request receives the current user input and authoritative saved facts, including host-calculated Budget totals. Tools are disabled and obsolete intermediate failures are removed from that terminal context. For an initial planning request, the closing reply asks up to three important unanswered confirmations after describing the saved draft, without repeating supplied facts. Ongoing planning history is preserved until this boundary. Only a receipt for the current operation proves final saving.

## Durable accepted progress

AGENT_DURABLE_DRAFTS=true enables the additive migration 20261030090952_working_drafts.sql. The default is false until that migration is verified. The configured project received the migration on October 30, 2026; private table/RPC access is service-role only with RLS. Disabling recovery does not silently discard an existing unfinished snapshot.

A private snapshot belongs to one exact input/operation, conversation and trip. It is not a public partial itinerary. Each application mutation is recorded before durable acknowledgement, including unresolved rejection obligations. Retained state includes accepted Plan/Budget, staged document versions, source handles, research-gap observations, known deletions and a bounded 100-result mutation identity cache. It excludes private reasoning and a permanent step transcript.

Retry claims a new active generation and restores only an unchanged public base. A new message, even with identical wording, is independent. Concurrent public changes cause a conflict requiring explicit reload/reconciliation, never an automatic merge. Restore revalidates domain content, sources, document versions and protected facts; route/review findings are recalculated. Resumed changes still need final commit.

Writes compare generation, base revision, snapshot version and stable write identity. A lost response is verified or retried only with that same identity. Unconfirmed progress persistence stops further mutation and restores the last confirmed in-memory state. A final commit receipt remains authoritative after a lost response.

Final publication and the private published marker share one transaction. The early Brief checkpoint advances its own snapshot base atomically. Stop and timeout prevent later changes; an already accepted database commit can still finish and is resolved by its receipt. UI mentions preserved progress only after a verified current, unexpired snapshot, while retaining the actual stop reason.

Retention is seven days. Expired payloads are cleared in bounded batches on subsequent planner traffic; no scheduled pruning job is configured. Metadata remains. Retry of expired progress returns an explicit expiry result.

## Runtime configuration

Default model is gpt-6.1-terra; OPENAI_MODEL=gpt-6-luna is the authorized inexpensive override. Both planning and research use the selected model. Initial requirement interpretation and final review use medium reasoning; initial assembly, pricing and published reporting use low. Follow-up planning stays medium and factual research stays low. Unknown/deprecated overrides fail before saving a user turn. No silent model fallback. Existing server-only OPENAI_API_KEY and Supabase credentials are required. AGENT_WEB_SEARCH defaults true. HEIGIT_API_KEY enables supported map queries; absent map evidence stays explicitly unverified.

Official catalog/task/deprecations reverified October 30, 2026: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [task guide](https://developers.openai.com/api/docs/guides/latest-model), [deprecations](https://developers.openai.com/api/docs/deprecations). Documentation support does not prove account access or successful live execution. Reverify before changing a model.

Reasoning support was rechecked October 30 against the model pages and task guide linked above. The phase policy balances observed judgment failures under uniformly low reasoning against B045's timeout under uniformly medium reasoning. Actual Responses wire tests verify phase-specific effort, store=false and sequential calls. Live quality and latency are evaluated rather than inferred from those options.

The total planner allowance is 50 steps, with five reserved for bounded recovery, at most three passes, 14,000 output tokens per step and a 540-second request deadline. Hosting duration requests 600 seconds and must be supported by deployment. No automatic provider retries; mutations execute sequentially; provider response storage is disabled. Saved reply text is bounded to 16,000 characters.

researchWeb is an additional selected-model request, bounded to 45 seconds, two hosted search calls and 4,000 output tokens. It returns readable facts, units, applicability and actual retrieved sources. It counts as one planner tool step; its internal provider usage is additional. Timeout returns incomplete evidence and never fabricated prices.

## Verification and limits

Deterministic tests use the real SDK with scripted provider events, PGlite migrations and a fake private object store. They cover public schemas, source identity/versioning, protection, atomic rollback, deadlines, lost responses, private recovery, stale generations, expiry, conflicts, anonymous-role denial and truthful failure/save presentation. Protocol retirement verification is recorded in [the execution report](../tasks/main-v2-retirement/002-execution.md). App integration tests and the evaluation runner send the same literal authoring calls. Their transport fixture does not rename tools, inject tokens or convert complete artifacts. Internal domain/SQL tests retain explicit tokens and are separate from public protocol coverage. Live acceptance is tracked below.

[Acceptance campaign](../testing/browser/campaigns/2026-10-29-authoring.md) owns counters and independent browser records. Final Luna first-request generations pass for Rome, Bologna/Florence and incomplete input; scoped edits, booking/price reconciliation, read-only recall and interrupted-work recovery are also exercised. The sole gpt-6.1-terra comparison publishes Plan/Budget in 27 steps and 210.985 seconds, with one corrected authoring issue. Its EUR 362 to 649 estimate exceeds the requested EUR 600 per-person ceiling at the upper end, explicitly reported as a quality limit. Actual local configuration is restored to gpt-6-luna. No reliability percentage is inferred. Structural validation cannot prove every external fact or natural-language requirement; full generations still take several minutes and missing map credentials cannot produce verified journeys.

Update this guide when tools, limits, guidance, recovery or model configuration changes. Keep historical run evidence separate from the current contract.

### Location provenance and research corrections

userLocation is checked against the text of an actual user message. It defaults to the current input; userLocationMessageId selects an earlier message, and the source retains that message's actual conversation ID. A location named by the user is not automatically booked, fixed or mandatory. Agent-proposed neighborhoods use area with an assumption basis, including free_time walking windows. Read projections preserve the original basis instead of turning every specified location into a user claim. Unrelated timing/title edits retain existing location evidence. This check verifies text attribution, not the semantic intent of every sentence, and does not retroactively rewrite saved trips.

The existing plan-editing and planning-documents guides require actionable research corrections to reach the affected Plan reason, reminder and timing in the same commit. Catalog records and real user bookings remain intact. This is a focused behavioral improvement, not a deterministic checker of arbitrary web claims or a change to budget estimation. No extra research call is required when applicable evidence is already available.

Safe context telemetry reports only byte totals by text, reasoning, tool-call and tool-result category. Required opaque provider reasoning remains in active history. Declared authoring-schema field/enum names feed error diagnostics automatically; argument values and private dynamic keys stay redacted.

## Harness execution boundary

October 30, 2026: `runAgent(messages, environment, signal, observer)` runs the complete bounded workflow. `model.ts` owns an internal `runPass`; callers cannot bypass recovery through the public entry. One ActionRun spans all passes. The returned execution result owns the stop cause, final text, verified action state and safe diagnostics. Observer snapshots are transient read-only views used by Turn for heartbeats and exceptional finalization, not additional stored context.

Assistant's Turn coordinates selected inputs, generation renewal, progress recording and reply persistence. Its final delivery report combines the Agent result with actual stream/storage facts. Agent completion, artifact publication and reply storage remain distinct. Stream encoding, conversation persistence and progress presentation have separate modules. Existing SQL, guides, tool schemas and protocol names are unchanged.

### Luna acceptance configuration

User-requested test model: `gpt-6-luna`, verified October 30, 2026 against the [official model catalog](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-6 usage guide](https://developers.openai.com/api/docs/guides/latest-model) and [deprecation notices](https://developers.openai.com/api/docs/deprecations). Use an isolated test process with `OPENAI_MODEL=gpt-6-luna`; no default-model change or Terra fallback is part of this refactor. The existing Responses endpoint, medium/low reasoning, function tools and web search remain in use. Installed dependencies are `ai` 7.0.152 and `@ai-sdk/openai` 4.0.101; verify actual lockfile versions in each run record. Official support and mocked request validation do not prove account access. Each live attempt records its actual model and outcome separately.
