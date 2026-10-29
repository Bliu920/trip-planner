# Agent

Status: implemented and tested locally, including a synthetic real-provider generation. Hosted migrations and deployment verification remain pending.
Last updated: 2026-10-28.

## Responsibility and boundaries

Agent executes tasks using injected environment capabilities. It owns model invocation, task guidance, the tool schemas and the bounded tool-call loop. It does not own Plan or Budget rows, document bytes, conversations or microphone capture.

| Code | Responsibility |
|---|---|
| `services/agent/index.ts` | Public execution entry point, model configuration and bounded SDK loop |
| `services/agent/contracts.ts` | Injected environment capability contract |
| `services/agent/guidance.ts` | Common source-trust, receipt and reply guardrails |
| `services/agent/tools.ts` | Validated model-facing tools and actionable tool errors |
| `services/agent/research.ts` | Bounded web research returning readable evidence to the planner |
| `services/workspace/index.ts`, `session.ts`, `database.ts` | Application integration: load environment, stage proposals, coordinate atomic publication |
| `services/chat/index.ts`, `stream.ts`, `documents.ts` | Saved turn reservation, selected-file assembly, streaming and reply persistence |
| `lib/chat`, `lib/workspace` | Existing chat and application UI integrations |

Workspace integration is not another self-contained product module. It is the small application layer connecting independent Plan, [Budget](budget.md) and [Library](library.md) contracts. No separate Research module exists. Catalog retrieval and optional web search are agent capabilities; useful research outputs are ordinary documents.

## Environment

Each run starts with the current Plan, Budget (including its review flag) and environment revision, full supporting context if present, a document metadata index, pending failed inputs, the current saved user-message source and any previous save receipt. Other documents load on demand as complete text files. Chat supplies authoritative saved history and only currently selected uploads; it never trusts a client-supplied transcript.

Selected catalog interests travel with each saved user message as `data-place` parts containing IDs. The [Place references module](place-references.md) validates IDs, derives display data and supplies canonical source facts to the model history. These references are interests rather than mandatory stops or reservations; accompanying user text determines priority. The provider path is unchanged. This integration was verified on October 26, 2026 with persisted-history and mocked-provider tests.

Initial raw input stays in Chat. The legacy trip notes remain a read-only compatibility source once planning starts. New ongoing requirements belong in the Plan or supporting Markdown, not an independently editable notes field. Existing original files and chats retain their IDs.

All chats in one trip see the same Plan/context. A conversation is an interaction history, not the owner of a separate agent state or plan. A new chat does not reset the project.

## Workflow and data flow

| Step | Reads | Produces or changes |
|---|---|---|
| Reserve turn | Trip and selected conversation | Persisted user input, assistant generation token |
| Open environment | Current Plan/context, document index, failed inputs, receipt | Consistent starting revision; nothing proposed is published |
| Research | User context, catalog records, selected files, optional web sources | Evidence and candidate choices; supported text files can be staged |
| Propose | Current Plan plus interpreted request | Private candidate Plan, validation findings; no saved mutation |
| Stage context | Current Markdown and metadata revision | Complete replacement text held in request memory |
| Commit | Expected environment revision, generation token, validated proposal | Upload immutable file versions, then publish document pointers and Plan in one SQL transaction; save receipt |
| Present | Actual commit receipt and final model text | Streamed reply; persisted save summary; refresh Plan and Library views |
| Retry | Original message, latest shared state, existing receipt | Receipt recovery without a second mutation, or a fresh attempt when no save occurred |

The first generation uses supplied details and makes labelled proposals for missing nonblocking details. Missing dates default to a labelled start one week ahead. Destination choices follow preferences and feasibility across one to three cities rather than a fixed Rome default. A missing spending limit stays unknown, while the agent researches numeric ranges for ordinary included costs. Requests outside three-day Italy scope are clarified. There is no mandatory intake form.

Durable preferences such as walking limits or dietary needs are recorded in context if they are not explicitly represented as sourced Plan requirements. Context does not copy the transcript or maintain a second itinerary. Research documents record evidence and concise decisions, not hidden reasoning.

## Tools

V2 exposes 23 tools with online research enabled, 21 without both research tools. The model-facing legacy proposePlan, proposeBudget, stageDocument and verifySave tools have been replaced. Internal whole-object staging methods remain persistence adapters.

| Responsibility | Tools |
| --- | --- |
| Current environment and guidance | readEnvironment, readGuide |
| Library | listDocuments, readDocument, createDocument, editDocument, saveBrief |
| Itinerary | readPlan, createPlan, editPlan |
| Costs | readBudget, createBudget, editBudget, resolveBudgetGaps |
| Catalog and evidence | describeCatalog, searchPlaces, readPlaces, readMessage, researchWeb, web_search |
| Review and save | inspectChanges, commit, reloadWorkspace |

Effective reads include accepted unsaved changes. Saved reads use the run's pinned base, and historical document reads identify an exact immutable content revision. readEnvironment checks the latest server head without discarding or rebasing drafts. reloadWorkspace explicitly resets unsaved work only after all replacement reads succeed. Concurrent publication remains protected by existing SQL revisions and generation checks.

Each mutation requires the current run-local editToken. Successful accepted edits/checkpoints/resets advance it; reads do not. Mutations run sequentially, and stale tokens return actionable conflicts. The token adds no database state or authorization mechanism. SDK call replay returns the original successful mutation result; reusing that call identity for different arguments is rejected.

Plan operations cover dates, day fields/order, add/update/replace/move/reorder/unschedule/remove items, notes and deliberate whole replacement. Budget operations cover scope, limit, assumptions, exclusions, entry changes, review and whole replacement. Document operations cover host-allocated creation, rename, full content replacement and exact unique text replacement. All batches are atomic. Shallow field updates preserve omitted values and require complete supplied nested objects. They never introduce the manual editor's direct_edit provenance.

Accepted drafts survive a rejected replacement, with a separate rejection obligation blocking final save until corrected. Plan checks preserve protected facts against saved and effective state. Plan notes/locations must be repaired explicitly in the same batch; Budget links may temporarily need repair in the overlay, but a newly staged Budget cannot publish dangling links. Unrelated source details and original checked timestamps stay intact.

inspectChanges reports affected IDs, blockers, price coverage, advisory first-plan readiness and authoritative save status through the existing receipt verifier. Readiness findings do not fabricate prices or become another durable receipt. Actual route quality and exceptional sparse-day/exclusion choices still need semantic review. An early saved brief is not final completion.

Runtime context refreshes after each step instead of appending stale copies. It includes a bounded Travel brief and lightweight effective manifest. Complete Plan values up to 20,000 serialized characters and Budget values up to 16,000 are preloaded; larger values use explicit full/scoped reads. Already supplied current content counts as read. Selected binary originals are marked available only after the host actually loaded them into this request.

Tool input is validated locally with reused JSON schema definitions. Provider normalization does not replace domain/source/protection validation. The catalog tools read the shared supplied Italy dataset; external research supplements it, including real sourced restaurant fallback when supplied meal venues are unsuitable. Named attractions remain catalog-backed. No arbitrary shell, filesystem, URL-fetch or SQL capability is exposed.

Implementation lives in contracts.ts, tools.ts, artifact-tools.ts, feedback.ts and existing runtime/research/action modules. Workspace session.ts owns existing staging/persistence orchestration; artifacts.ts adapts V2 operations, draft.ts owns transient tokens/rejection obligations, and views.ts computes scoped reads and advisory quality findings. Pure domain operations live in lib/plan/operations.ts, lib/budget/operations.ts and services/documents/edits.ts.

## Publication and recovery

`20261026145652_planning_integration.sql` adds request runs, operation receipts and cross-module source validation. It coordinates the public SQL contracts of Plan and Library under the trip lock.

1. Model proposals stay in server memory.
2. Document bytes upload to unique immutable paths, with staged-write metadata registered first.
3. The transaction checks generation token, deadline and expected trip revision, then publishes documents, Plan and any staged Budget together.
4. Any conflict or invalid source rolls the transaction back. Uploaded but unpublished files are cleaned after 24 hours by Library cleanup.
5. Repeating a committed assistant operation returns its receipt. A failed final reply cannot erase a successful Plan save.

A request timeout or Stop prevents subsequent commit attempts. A commit already accepted by the database may finish before cancellation reaches it; its receipt is authoritative. Failed/interrupted unsaved inputs remain discoverable in the next environment. The current input must be included in handled IDs when publishing, and reloading after a conflict adopts any context document another writer created. The internal withdrawal operation is reserved for explicit user-directed resolution; no automatic withdrawal is performed.

The existing conversation lock prevents overlapping turns in one chat. Different chats may run concurrently; optimistic publication makes the losing run reload and reconcile. This is shared-state safety, not a multi-agent orchestration product. Durable background execution, queues, agent scheduling and collaborative text merging remain deferred.

## Runtime and deployment

Default model: `gpt-6.1-terra` through the Responses API. An explicit `OPENAI_MODEL=gpt-6-luna` override is also supported for the user-requested lower-cost evaluation. Both planning and research use the selected model. Unknown and deprecated model overrides fail before a user turn is saved; there is no silent fallback. `CODEX_MODEL` is not read by this application.

Verified against official OpenAI documentation on 2026-10-26: [model](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [deprecations](https://developers.openai.com/api/docs/deprecations), [function calling](https://developers.openai.com/api/docs/guides/function-calling). Recheck these when deliberately changing models; do not silently accept untested overrides.

Configuration:

- Existing server-only `OPENAI_API_KEY` and Supabase server credentials.
- `OPENAI_MODEL=gpt-6.1-terra` or omit for that default. Explicit `gpt-6-luna` is accepted; the evaluation process can set it without editing private environment files.
- `AGENT_WEB_SEARCH=true` by default. Explicit false disables it. Search adds provider cost and latency.
- Existing Library cleanup secret and trusted scheduler.

Execution limits: 30 planner SDK steps total, with up to 27 normal steps and one optional recovery continuation using the unused portion of the 30-step total, 14,000 output tokens per step, 540-second request deadline, no automatic provider retries, sequential tool execution and response storage disabled. The route requests a 600-second hosting duration; the deployment plan must actually allow it. Chat checkpoints run during long tool work. Saved reply text remains bounded to 16,000 characters. Existing chat input and file limits remain in force.

A researchWeb invocation uses one additional model request with at most four hosted tool calls and 4,000 output tokens, no retries, and the same parent abort signal. It counts as one planner tool step; its internal model request is additional to the planner request count. This uses the existing Vercel AI SDK. It does not introduce Codex SDK, a sandbox or a background worker.

## Verification

- Pure Plan fixtures, PGlite migrations and a mocked private object store exercise module behavior independently.
- Integration tests execute the real AI SDK with scripted provider function-call events: propose, commit, final reply, persisted receipt and reload.
- Tests cover stale document edits, source isolation, file integrity, rollback of Plan plus documents, interrupted generation, receipt retry and database-role denial.
- A real-provider synthetic Rome request exercised catalog lookup, Plan validation and commit against local-only test capabilities. No real trip, upload or booking was used or changed.
- Browser checks cover shared plans across chats, direct day movement, retained save receipts, Markdown creation and editing, and desktop/390px layouts with no horizontal overflow. See the implementation task outcome for final commands and viewport results.

A smoke test is not a quality benchmark. Natural-language interpretation, constraint completeness and researched operational details remain empirical concerns. Structural tests do not prove semantic correctness of every model proposal.

## Maintenance

Update this guide whenever tools, prompts, model defaults, limits or workspace integration change. Keep Plan and Library tests runnable without a model. Test a provider change with real function calls as well as fixtures. Maintain the shared [module contract](README.md#maintenance-contract).

## Naming update

- 2026-10-26: Naming audit corrected the remaining presentation-row reference to Library views. No runtime contract changed.

- 2026-10-26: Updated cross-module feature naming to Library and linked its renamed guide. Existing technical contracts are unchanged.

## Workspace Plan integration

2026-10-27: The workspace Plan panel now renders the shared Plan presentation, with manual controls available through Edit plan. Chat completion publishes `notifyTripChanged` from the shared trips boundary, refreshing Plan and Library through compatible subscriptions. Plan writes retain revision checks and retry receipts. No provider, tool, model or agent execution changes were made. Plan state is scoped to the project, so switching conversations does not reset it.


## Budget and guide integration

2026-10-27: Added [Budget](budget.md) as an independent module and [Guiding documents](guides.md) as the small trusted instruction library. Workspace snapshots include current Budget. The prompt lists five task guides; absent/empty Plan automatically includes first-plan guidance. A new chat on an existing Plan loads follow-up guidance on demand. Initial itinerary commits now require a nonempty Budget proposal, allowing explicit unknown costs when research is unavailable.

`planning_commit_budget` coordinates publication when Budget is staged, preserving the existing no-budget commit path for other updates. Source URLs are collected from actual SDK web-search events, opened URLs and citations; new unsupported URLs are rejected. Existing source evidence can be reused unchanged. Guide Markdown is explicitly included in API deployment tracing. The model ID and existing SDK are unchanged. The Budget migration was applied successfully to the configured Supabase project. New browser checks and SDK research flows used isolated data and mocked provider responses. The user subsequently approved one live-provider budget generation. Guide loading, search and atomic publication succeeded, but all six costs remained unknown despite returned search URLs. Budget research acceptance failed; see the live result in budget.md. No second real generation was attempted.

## Budget research recovery

2026-10-27: Budget proposals now return mechanical price coverage and pending IDs. The tool adapter attaches the centralized budget-gaps guide when action is required. commit repeats the Budget-owned check and returns saved:false before document preparation or database publication if gaps remain. A new resolveBudgetGaps capability records bounded, explicit unresolved-cost explanations after observed follow-up search, or when search is disabled. It never supplies or confirms a numeric price. The hosted-search completion hook is supplied by the host, not an agent-callable counter.

First-plan/research guides now require staging Plan before research and immediately recording useful price facts before unrelated work. Existing model, provider storage setting, search context and run limits are unchanged. Real SDK scripted tests cover the failed all-unknown path and recovery. A separately authorized live run exercised gap recovery but exposed a search-name misunderstanding and an omitted current input ID. Both interfaces were subsequently corrected. Those final corrections have not had another live generation; semantic research quality remains unverified.

The hosted tool key and all model-facing references now use `web_search`, matching the provider wire tool. Guidance explicitly explains that the host registers its source URLs automatically. The commit adapter always includes the authoritative current input ID from the environment, plus any additional pending IDs selected by the model. The workspace retains its validation of allowed IDs; no model-supplied identity replaces host state. This removes the need for the model to copy a known message ID just to save its current task.

## Travel brief and shared catalog workflow

Updated October 27, 2026. Initial context includes trip-details and first-plan. The agent checkpoints a sourced Travel brief with saveBrief before researching and staging dependent artifacts. The tool returns the refreshed workspace and planningComplete:false; only final commit creates a completion receipt. Later requirement changes update the same brief, with trip-details loaded on demand. The run remains bounded; guides instruct the agent to reserve steps for validation, budget recovery and commit.

Catalog discovery/search/read tools use the shared Catalog contracts described in [Catalog queries](catalog.md). searchPlaces now accepts one structured query, including city/type/tag/price-tier filters and paging; its former query/city-only interface is replaced. This is a thin tool adapter in the existing toolset, not a separate search service.

Workspace brief.ts coordinates immutable document staging and the planning_save_brief RPC. The migration 20261027140742_brief_checkpoint.sql is required after budgets. It checks the current project revision, active generation, streaming state and deadline, then publishes only an agent-authored planning_context write. It cannot publish plan/budget artifacts or mark inputs handled. Unchanged retries reuse the write identity to recover a lost response; explicit reload resets pending write state before reconciliation. Checks run before the published-write retry path so stopped generations remain blocked.

Before other changes are staged, saveBrief publishes a checkpoint. Once plan, budget or document edits are staged, saveBrief stages the brief with them and returns saved:false, staged:true and requiresCommit:true. It shares document staging revision and scope validation, and only final commit publishes that update. This lets late brief corrections preserve the staged plan and budget instead of failing on call order. A failed or stopped planning run can leave a valid saved brief and pending input. The next session loads that context. Chat refreshes Library on the checkpoint event and provides a brief link before a Plan exists. Saved chat history retains its existing text/receipt format; full tool traces are streamed, not newly persisted by this change.

Verification uses PGlite and the real SDK with a mocked provider. It covers checkpoint persistence, final commit, lost responses, conflicts/reload, cancellation, anonymous RPC denial and catalog calls. No paid live model run or hosted migration application was performed.

## Action result contract

October 28, 2026: all application tools now use the checked action boundary described in [Agent action results](agent-actions.md). Success, staging, persistence, blocked operations and unknown write outcomes are explicit. Save status is receipt-backed and survives chat reload. The host checks completion and may allow one bounded recovery continuation; question-only replies do not require a save. Workspace refuses commits that omit a previously requested artifact after rejection or reload. The action-state migration is applied to the configured Supabase project. Provider/model selection is unchanged.

## Estimate and step-budget update

October 28, 2026: budget-research now requires numeric estimates for routine included costs, using retrieved comparable prices and explicit extrapolation when exact quotes are missing. The root instructions, first-plan and gap/editing guides share this policy. Genuine evidence outages still preserve unknowns honestly and must be reported as incomplete.

MAX_AGENT_STEPS is 30, including 3 reserved recovery steps. The last three steps of each pass receive a completion reminder. The installed AI SDK stop condition counts completed steps with no hard-coded 25-step ceiling. OpenAI's [max_tool_calls](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) controls built-in tools per response, not this multi-request SDK loop (checked 2026-10-28). At that iteration, the independent 210-second app and 240-second hosting/database limits were unchanged. The later Reply diagnostics and longer workflows update below supersedes those time limits.

2026-10-28 consumer copy audit: The system guidance now requires consumer language in replies and saved trip content, with no internal catalog/schema/tool/receipt wording. Source links, meaningful versions, uncertainty and save accuracy remain required.

2026-10-28: File queries and staging use the [Library format policy](library.md#supported-file-policy). Text reads use authoritative MIME and verified versions. Every supported text format is read as a complete file. The read tool has no section parameter. Planning context remains Markdown; no model or prompt budget changed.

Consumer copy audit verification: lint, typecheck and 106 targeted tests passed. Rendered Explore and Trip details were checked; no live trip or file data was changed.

## Reply diagnostics and longer workflows

October 28, 2026: chat saves a data-failure part with a controlled reason code, elapsed milliseconds, completed SDK steps and finish reason when a reply cannot finish. The stream emits the same part; history preserves it. The UI maps codes to plain-language explanations for time, planning/output allowances, provider limits/errors, stopped requests and incomplete work. It never renders technical diagnostics or guesses a historic failure cause. Save state still comes from the independent action receipt.

The 30-step total reserves at least 3 steps for recovery. If the first pass stops earlier than 27 steps, recovery may use all remaining steps. A saved operation that ends on a tool call or without text can use recovery for a final explanation with tool_choice none, preventing repeated changes. Local tool-input failures still participate in normal action recovery rather than being treated as provider outages. Exhausting recovery is an interrupted reply even when a commit succeeded.

The application timeout is 540 seconds, and the route hosting request and planning database lifetime are 600 seconds. The 20-second progress heartbeat and 90-second abandoned-reply recovery remain unchanged. Apply 20261028132354_chat_failures.sql before deploying this server code. It adds an atomic, generation-guarded reply/diagnostics write and extends planning_begin. Hosted application duration must be supported by the deployment plan; maxDuration cannot override a provider's hard cap. [Vercel limits](https://vercel.com/docs/functions/limitations), checked 2026-10-28, list a 300-second Hobby maximum with Fluid compute. This 600-second route therefore needs a suitable hosting plan or long-lived server; account eligibility was not verified. The migration has been applied to the configured Supabase project.

The reported January coastal-trip reply was saved after about 165 seconds with a commit receipt and no text. It predates these diagnostics. That timing rules out the application's 210-second deadline for this occurrence; no recorded evidence distinguishes step exhaustion from a provider or empty-response failure. Do not label it retrospectively as a proven timeout or step limit.

Regression checks use the real SDK with scripted provider responses and isolated PGlite. They cover timeout vs cancellation, output exhaustion, rate limiting, invalid-tool recovery, 30-step exhaustion, commit-at-limit final explanation without another save, persisted reasons and protected writes. No paid generation is needed for these mechanical checks. Live itinerary and price quality remain separate acceptance tests.

### Chat presentation (October 28, 2026)

The shared AgentMessage omits visible speaker labels and retains accessible group names. Workspace removes the redundant Trip assistant heading while preserving history and new-chat controls. User bubbles fit their content up to 75% of the transcript width; assistant content uses the full available width. `lib/chat-response/text.tsx` owns a six-line user-message preview with Show more/Show less. It measures overflow at the current width, including after responsive resizing. This is presentation state only: saved/model-bound text is unchanged, assistant replies remain fully visible and attachments stay outside the collapsed text. Starter prompts use the same presentation. Existing response keys and inline activity lifecycle are unchanged.

Verification: local desktop and 390px mobile fixture checks confirmed no visible role labels, 75% maximum user width, short bubble fit, six-line collapse, full expansion, recollapse, long URL wrapping and no horizontal page overflow. Lint and typecheck passed. Temporary preview removed; no live AI calls or database changes.


## Completion recovery (October 28, 2026)

A reported first-plan failure stopped after 19 completed steps and about 149 seconds. Its durable last action error rejected saveBrief because other artifacts were already staged. This is evidence of an action-order failure, not timeout or step exhaustion. The historical record does not retain every tool result, so it cannot establish every earlier blocker. The assistant's price-check explanation was unsupported by that record.

After a mutation begins, recoverable unfinished work sets tool_choice to required. A verified final save sets it to none so the model can explain the saved result without another mutation. A provider answer violating required tool choice enters the same bounded recovery path rather than being reported as a provider outage. Genuine question-only turns and explicit stop/fatal outcomes retain their existing handling.

Chat buffers answer text and publishes only the final step's answer from the last pass. Tool activity continues streaming, and the heartbeat keeps the run alive. This prevents an abandoned answer from being concatenated with its replacement. The final text, save receipt and any failure reason are persisted independently. This deliberately delays answer prose until the pass finishes; it does not delay tool activity.

Regression coverage includes late brief updates joining the atomic commit, revision/cancellation guards, required tool choice while unfinished, reply-only behavior after save, unused recovery steps, a single final answer and the unchanged 30-step ceiling. The historical live acceptance record is local and is not included in this repository.


### Live acceptance and readable research

The authorized October 28 acceptance run failed after 30 planner requests and 339 seconds. It prepared a fuller itinerary with 7, 6 and 7 daily arrangements but did not publish it. The trace repeatedly alternated between seven researched numeric costs and seven unknown costs. It also exposed generic masking of BudgetReview's corrective instructions and intermediate prose concatenated within one pass. Follow-up code preserves budget validation instructions, resets answer prose at each step, and labels unfinished work at the total ceiling as step_limit even when its last finish reason is a tool-choice violation.

The installed OpenAI adapter maps hosted web-search results to action metadata and URL lists when replaying them between calls. Those outputs do not contain readable price excerpts. Official [reasoning guidance](https://developers.openai.com/api/docs/guides/reasoning) documents stateless encrypted-context replay; the adapter already requests it for this model. [Web search guidance](https://developers.openai.com/api/docs/guides/tools-web-search) describes sources and search results. Verified October 28, 2026. Missing readable evidence is an observed integration limitation and a plausible cause of the reversals, not proof of the model's private reason.

researchWeb now performs a bounded read-only research request and returns its cited factual report as an ordinary tool result. The planner receives the facts, units and conditions in later steps without treating its own budget proposal as independent evidence. URLs are registered through the same source validator. Empty output remains explicitly incomplete. Existing model ID and stateless storage remain unchanged. Budget guidance directs price research through this tool and distinguishes preserving evidence from correcting genuinely unsupported estimates.

All 266 offline tests passed after these changes. The follow-up research path has SDK integration tests with scripted provider results. A separately authorized second live acceptance generation subsequently passed, as recorded below. The initial failed run remains distinct from this successful follow-up.


October 28 follow-up acceptance: the same four-destination prompt completed in 97 seconds with 11 planner requests and one research request. Persisted state contained three days with 5, 6 and 5 scheduled arrangements, meals each day, catalog visits, a local transfer and two-night lodging coverage. The six-entry researched budget had zero unpriced costs and a computed EUR 239 to 491 per-person estimate, with explicit room-sharing assumptions and travel exclusions. One successful commit and one final reply were restored from isolated storage, with no failure event. The proposed single-base compromise and deferred destinations were stated before follow-up confirmation questions. This is one successful real-provider test on local code, not hosted deployment validation or a reliability-rate estimate.

October 28, 2026: response presentation now belongs to [lib/chat-response](chat-response.md). It composes one trailing work disclosure through lib/work-progress. The header owns the only spinner; the default active preview shows the latest four steps. Completion collapses to the saved elapsed-time header, while explicit expansion keeps all history available. Activity history retains permanent results with static icons inside the expanded disclosure. Transcript projection preserves reply identity through placeholder, streaming and retry, and handles live replies without metadata during saved-history reconciliation. See the response guide for regression protection and browser evidence.


## Provider rejection diagnostics

A provider_limit failure can occur before any planner step. services/chat/provider.ts distinguishes structured temporary rate errors from credit, spend and usage limits, using specific error.code before a broad insufficient_quota type. Legacy ambiguous errors remain ambiguous. Persisted optional details keep restored UI instructions accurate without expanding the SQL failure-code allowlist. Safe server diagnostics contain allowlisted classifications only; raw prompts, error text and credentials are never logged. The model, 30-step allowance and 540-second deadline are unchanged.

Official error-code and rate-limit guides were fetched October 28, 2026: [error codes](https://developers.openai.com/api/docs/guides/error-codes) and [rate limits](https://developers.openai.com/api/docs/guides/rate-limits). Tests synthesize provider responses through the installed SDK and database. The user's historical failure retained only provider_limit, zero steps and roughly 2.2 seconds, so its exact provider cause cannot be reconstructed from those logs.


## Real meal selection

October 29, 2026: shared guidance now requires catalog-first suitable meal venues, using the existing researchWeb or web_search for real restaurants when needed. researchWeb reports venue identity/address, meal service, closures, menu prices and booking guidance, distinguishing missing evidence. No dedicated restaurant API or model change was introduced. Plan tools reuse the extended shared location schema; observed URLs feed restaurant provenance validation through the existing research registration path. plan-quality owns selection and completeness, plan-editing owns representation, and budget-research coordinates selected meals with aggregate cost estimates. Generic new meal placeholders cannot pass Plan validation.


## Reusable research and decisions

October 29, 2026: common guidance now delegates supporting-file ownership and lifecycle to planning-documents. Research notes and Planning decisions use the existing document manifest and create/read/edit tools, with conditional creation, purpose-aware reuse after renames, relevant reads before affected changes, dated evidence and updates alongside dependent Plan/Budget changes. They do not duplicate the Travel brief, selected schedule or cost ledger. No provider or model change was made.


## Position and journey tools

October 29, 2026: When HEIGIT_API_KEY is configured, resolvePlace and getJourneys are available through the existing toolset. Automatic feasibility checks run independently of whether the model calls them. Reports omit route geometry. routes-and-stays owns hotel selection, positioning references, supported travel modes, corrective steps and honest incomplete status. No AI model or SDK provider change was made. See [Locations and routes](geo.md).


### Luna evaluation compatibility

Verified October29,2026 against the [official Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna), [current model catalog](https://developers.openai.com/api/docs/models), [GPT-6 task guide](https://developers.openai.com/api/docs/guides/latest-model) and [deprecations](https://developers.openai.com/api/docs/deprecations). Exact ID: gpt-6-luna. Documented support includes Responses, streaming, function tools, structured output and web search. The existing low reasoning effort, store:false, sequential tool calls and streaming output are supported; no Chat Completions migration or sampling option changes are needed. Installed @ai-sdk/openai4.0.101 accepts the exact Responses ID and existing options. Configuration regression verifies explicit Luna, the unchanged Terra default and rejection of deprecated/unknown overrides before provider access or saving a user turn. Public compatibility does not establish account access or successful trip planning; live test outcomes are recorded separately in the evaluation report. The independent judge stays gpt-6-astra unless separately authorized and verified.
