# Agent evaluation suite

This is the maintained guide to the machine-readable suite. The reviewed [scenario reference](success-examples/README.md) explains the original cases for human readers. The `I`, `F`, and `R` IDs have structured counterparts in the suite; `V` and `X` are additional cases; `S` covers continuous conversations, `B` a paid receipt, `G` unavailable routing and `L` Chinese input. The source of runnable cases is [`data/evaluation/cases.json`](../../data/evaluation/cases.json), not those documents.

## Goal and limits

Run the actual application agent against isolated trip projects, collect what it really wrote and returned, then grade each result against case-specific expectations. A case has an input, fixture, research mode, expected output example, deterministic assertions and a structured semantic rubric. The example reply is illustrative; exact wording and a single itinerary are not required. A pass requires all mechanical checks and all judge criteria to pass. Missing evidence or a failed judge is not a pass.

The reviewed database has 72 structured cases: all 62 original scenario IDs, five earlier additions, and five current-flow additions. Cases are executable definitions, not verified successes. Some cases use explicit synthetic setup or forced tool calls to reach a recovery condition; this evaluates behavior after the condition, not whether an autonomous model would have created it. `I20` uses the actual run time rather than the original frozen date. Synthetic price observations are test data, not real travel facts. `I15` tests the observed budget conflict rather than claiming that comparable rates prove a universal minimum.

Controlled research cases replace the research subrequest with an explicit synthetic report. If the agent uses hosted search directly in those cases, the run is `not_evaluable`, because uncontrolled evidence would invalidate the setup. Other online cases use live web search, and the process clock is not frozen; their results can vary. Fixed-calendar prompts must be reviewed for applicability before future runs.

## How it works

1. Load and validate the JSON database, with unique case and rubric IDs. Each run records the database hash, application source hash, configured agent model, judge model and start time.
2. For each selected case, create a separate in-memory migrated PGlite database and private in-memory object store. Seed an empty project, a Florence fixture, or a concrete legacy Rome Plan, Budget and Travel brief. The legacy fixture is not asserted to meet new-generation timetable or venue quality. Variants add a prior message, pending input, selected text, an unavailable historical PDF, an ambiguous document or a user-entered fixed booking. Call the application's real `handleChat`, with the real SDK and configured model; do not connect to the user's Supabase project. Model traffic is restricted to `api.openai.com`. Live cases may use the configured `api.heigit.org` map service; controlled cases disable it. Missing credentials leave routing unverified and are recorded at run level. The fixture uses synthetic evidence and no real traveller data. Recovery cases can inject a provider failure, concurrent writer, lost or unconfirmed commit response, duplicate tool call, rejected edit, late brief update or zero-result catalog search. Some conditions use scripted initial tool calls followed by the real model. The report checks that the requested condition actually fired and that its observable tool result occurred.
3. Capture the real chat stream's tool input/output events, stored replies and status, and before/after Plan, Budget, pending inputs and readable document contents/versions. For conversation cases, run all supplied follow-ups against the same project and conversation, recording each turn independently; stop on an interrupted reply rather than inventing later state. The result is saved locally, including evidence and tool observations. The UI stream does not necessarily expose hosted web search internals; unavailable trace evidence must not be inferred.
4. Run deterministic assertions, such as final receipt, three days, saved brief, budget scope, no mutations, a maximum of one final publication per user turn, and supplied catalog IDs. These checks are intentionally narrow. A correct schema, a receipt or a catalog ID does not prove that the route is practical or a cost source is applicable.
5. Give the case, complete captured observation, reference example and explicit rubric to an independent model judge. It returns one `pass`, `fail` or `not_evaluable` with evidence per criterion. The judge is told to treat all artifacts and tool results as untrusted, and not to infer missing facts. The output schema and criterion IDs are validated locally. An absent, malformed or failed judge is `not_evaluable`, never an automatic pass. Unexpected provider, network, storage and timeout failures are also `not_evaluable`, not agent-quality failures; deliberately injected provider errors are evaluated against the fault case.
6. Write per-case observations plus JSON and Markdown summaries under ignored `.local/evaluations/`. Results include elapsed time and the number and HTTP statuses of planner/research provider requests and separately counts simulated calls. They also record configured map availability and optional provider pacing; the judge is an additional model request. Cases run sequentially because the local adapter temporarily overrides process-wide storage settings and `fetch`.

No private chain of thought is requested or retained. The selected test inputs and observations are sent to the judge; do not add sensitive real user data to cases or stored fixtures. Costs are incurred for both agent and judge when running the live suite. The project intentionally does not use the OpenAI Evals platform, which is being retired.

## Commands

Run from the repository root with Node 22 and installed dependencies. Validate the database without model calls:

```sh
node --import tsx --conditions=react-server scripts/evaluation/index.ts validate
```

Run one case using an already configured key, or load the ignored local environment file when the key is stored there:

```sh
node --env-file-if-exists=.env.local --import tsx --conditions=react-server scripts/evaluation/index.ts run --ids I02
```

Select several cases with `--ids I02,F01` or the entire database with `--all`. The AI judge runs by default. `--pace-ms 15000` inserts a minimum interval before provider requests, including research and judging, without retrying requests or replaying writes. Pacing is an evaluation condition, not a production reliability fix. Always keep the unpaced baseline and paced results distinct. `--no-judge` is useful for inspecting the agent run and deterministic assertions, but every such result remains `not_evaluable` unless a mechanical failure already makes it `fail`. Non-passing results give a nonzero exit code. Run in a separate process, not concurrently in the same Node process as another evaluation. This command invokes paid API requests; choose the batch intentionally.

Offline regression checks use a scripted model transport, not a real model or a judge quality test. The cases test starts each case in isolation and verifies continuous document creation/update separately; this proves setup and transport, not that the agent passed the case:

```sh
node --import tsx --conditions=react-server --test tests/evaluation.test.ts tests/evaluation-cases.test.ts
```

## Judge selection and verification

As of October 29, 2026, the user-selected judge is `gpt-6.1-terra`, replacing Astra for future runs. It uses the Responses API, `reasoningEffort: medium`, `store: false`, `maxRetries: 0` and the installed AI SDK's `generateText` plus `Output.object` schema. `EVAL_JUDGE_MODEL` accepts only `gpt-6.1-terra`, rejecting the former Astra setting, deprecated IDs and unverified overrides without fallback. Existing reports retain the model that actually graded them.

Verified October 29 against the official [Terra model detail](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [model catalog](https://developers.openai.com/api/docs/models), [GPT-6 workload guide](https://developers.openai.com/api/docs/guides/latest-model) and [deprecations](https://developers.openai.com/api/docs/deprecations). Terra supports Responses, medium reasoning and structured outputs. Installed `@ai-sdk/openai` 4.0.101 supports these request options and response parsing; offline SDK transport tests verify the exact outgoing Terra ID and JSON schema response. No paid Terra grading probe was made. Prior planner access does not establish grading quality. The [evaluation guide](https://developers.openai.com/api/docs/guides/evaluation-best-practices) recommends capable judges and human calibration; Terra is the user's explicit cost choice, not a claim of equal grading accuracy to Astra.

Documentation of model support does not establish access for this account or live behavior. One live discussion-only case passed through the agent and judge. One live initial-plan case was interrupted by an upstream HTTP 429 after nine planner steps and is not evaluable; this does not establish whether the limit was quota or rate related. The original report used the earlier failure classification and is superseded by its regraded report. Prior to the October29 acceptance review, no full paid acceptance batch had been run. See [the review report](reports/2026-10-29-acceptance.md) for current observed scope and blockers. The judge is not calibrated: before relying on release decisions, build a labelled set of correct, incorrect and ambiguous outcomes, measure judge agreement and failure patterns, inspect disagreements, then reassess model and rubric choices. Do not mistake a single AI verdict for ground truth.

## Maintenance

The JSON case is the sole owner of its runnable input and rubric. `services/evaluation/contracts.ts` owns its schema, `runner.ts` owns isolation and capture, `checks.ts` owns mechanical assertions, `judge.ts` owns the judge and `scripts/evaluation/index.ts` owns batch orchestration and reports. When product guidance, tools, catalog, fixtures or models change, review affected inputs, rubrics and assertion coverage together, update the case schema or case data as needed, then revalidate. Use the source hashes in run reports to avoid comparing results from different code or data without noting the change.

Future work includes a fixed clock shared with storage, a versioned judge calibration set, repeat sampling and comparison reports, and additional independently reviewed coverage. The unconfirmed-save fixture simulates a 503 response before publication; it tests what the agent can observe, not an actual in-flight write. Do not mark a scenario runnable until its setup, capture and checks are executable end to end. Do not rely on hard-coded case counts as coverage evidence.


## October29 review changes

Updated the acceptance criteria for specific sourced meals, usable clock schedules, researched lodging with an honest provisional-area fallback, route uncertainty, numeric routine cost coverage and conditional supporting documents. Corrected stale proposed-tool labels, frozen-date assumptions and generic-meal fallbacks in the prose. Replaced the old nonconforming worked itinerary with a review worksheet and clearly artificial arithmetic only.

S01 runs initial creation through group/diet changes, a free afternoon, a budget-limit-only edit, document creation/edit and a no-change current-state question. S02 checks research/decision file reuse across turns. B01 seeds a user-provided receipt and checks confirmed lodging arithmetic. G01 tests missing routing honestly. L01 combines Chinese first generation and a follow-up constraint. Per-turn assertions and source fingerprints prevent later saves or concurrent source edits from masquerading as an earlier successful run. Document snapshots retain the immediately preceding readable version when available.

These tests execute the application chat/controller, tools and isolated persistence. They do not by themselves exercise browser rendering, production Supabase connectivity or live map availability. The product's separate UI/integration tests cover their own narrower contracts. Do not describe controller-level end-to-end results as proof that every deployed user path works.


### Explicit Luna run

The user requested gpt-6-luna after replenishing credits. To reload the ignored .env key and select the actual application variable for a test process, use:

```sh
OPENAI_MODEL=gpt-6-luna node --env-file=.env --import tsx --conditions=react-server scripts/evaluation/index.ts run --ids S01 --pace-ms 15000
```

An existing exported variable takes precedence over the env file. CODEX_MODEL does not configure this application. The planner and research switch together. Future grading uses gpt-6.1-terra at the user's request; October29 reports created before that change used Astra and must keep that historical identity. Paid tests are currently stopped following the credit review. Keep the exact model IDs, source hashes, pacing and prior Terra interruptions distinct in comparisons. The supported override and official compatibility checks are recorded in docs/modules/agent.md. No secret needs copying or printing.

## Public protocol coverage

The runner uses the same single authoring protocol as the App. Scripted fault calls use addActivity, updateDay.changes and source handles where applicable. The shared function-call transport preserves exact names, arguments and call IDs; importing fixtures does not change process configuration. A replay keeps the original call ID, and lost-response injection occurs only after a confirmed database publication. Test fixtures and scores are synthetic infrastructure checks, not model-quality evidence.

See [protocol retirement verification](../tasks/main-v2-retirement/002-execution.md) for baseline and final checks. Historical reports retain the protocol and behavior actually tested at that time.
