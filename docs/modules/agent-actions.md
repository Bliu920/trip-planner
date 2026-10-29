# Agent action results

Implemented October 28, 2026. This is an execution boundary inside Agent, with a shared display contract. Business validation remains in Plan, Budget and Library. Guides owns task-specific instructions.

## Structure

| Location | Responsibility |
| --- | --- |
| `lib/actions/model.ts`, `index.ts` | Shared result/state schemas, types and user-facing status labels |
| `services/agent/actions/index.ts` | Required typed application-tool registration and declared effect kind |
| `services/agent/actions/results.ts` | Success, blocked and exception normalization |
| `services/agent/actions/run.ts` | Durable mutation tracking, receipt recovery and completion state |
| `services/agent/tools.ts` | Domain-specific adapters, including Budget findings and guide delivery |
| `services/workspace` | Atomic persistence, scoped receipts and artifact completeness |
| `services/chat/stream.ts` | Bounded continuation, streaming and final task outcome |

Each application tool uses `actionTool`. ESLint forbids direct `tool`/`dynamicTool` imports elsewhere under services/agent. New tools must declare read, stage, checkpoint, commit or reset behavior and return a typed result. A non-write tool cannot claim a persisted effect; commit success requires this operation's valid receipt. Business checks are not moved into this module.

## Tool contract

Every application result contains:

- `outcome`: succeeded, blocked, failed or unknown.
- `effect`: none, staged, persisted or unknown.
- `operationId`: provider call identity for reads/staging, stable workspace operation identity for writes.
- `code`, `message`: machine classification and an actionable explanation.
- `recovery`: none, correct_input, research, reload, verify, retry or stop, with instructions.
- `data`: the domain result, including findings, guidance or verified receipt.

A staged Budget with price gaps returns blocked plus staged, with findings and budget-gaps guidance in data. Schema rejection returns correction guidance. Conflicts request reload/reconciliation. Expired runs stop. Unexpected write errors stay unknown until receipt verification, even if no receipt is immediately found: an earlier request could still be in flight. Output-contract failures cannot be misclassified as input errors or prove a write failed.

SDK input errors occur before tool execution. The step handler registers their failure and delivers the structured feedback through supported SDK instructions. Provider-hosted web_search retains the provider's native tool protocol; it is a read-only external capability, not an application persistence tool. Its sources remain collected by the existing host adapter.

## Completion and recovery

Mutation attempts create durable in_progress state before their work runs. If tracking cannot be persisted, the mutation is not executed. Successful proposals and brief checkpoints still require a final commit. Checkpoint status explicitly says the brief is saved and the Plan is not yet saved.

When a model finishes with outstanding changes, the host checks the operation receipt. If necessary, it permits one continuation of at most three steps, within the 540-second request deadline. The first pass uses at most 27 planner steps, and the single recovery uses the remainder of 30 total steps. There are no automatic provider-network retries. Continuation receives the accumulated model messages and a trusted completion instruction, using the SDK instruction channel rather than inserting system messages into the message array.

If recovery still does not confirm saving, the reply is failed/interrupted and the UI shows Changes not saved or Save not confirmed. Model prose cannot create a saved badge. Read-only questions do not require receipts or extra model calls. A saved receipt survives a later model/reply failure.

Workspace also tracks which artifacts the run attempted to change. A rejected or discarded Plan, Budget or document proposal must be corrected before commit; an unrelated successful write cannot hide it. Reload discards proposals but retains these obligations within the run. Initial brief checkpoints require a Plan before final completion.

`inspectChanges` reads this run's authoritative receipt. A lost final-commit response can be recovered without repeating side effects. Further commit calls use the same operation identity and the existing SQL idempotency guard. The host includes the current input ID automatically. Other pending input IDs remain validated.

## Persistence

Migration `20261028090216_action_results.sql` adds scoped action-state recording, receipt lookup and a message trigger. It introduces no new state table. The compact data-action part is retained in the existing message JSON through text checkpoints, interruption and retry. Actual commit receipts override stale failure markers. Anonymous/browser roles cannot call the new RPCs. The functions were applied to the configured Supabase project on October 28, 2026.

Retries receive prior action state in workspace context. SQL validates project scope and current generation before recording state; stopped or replaced runs cannot overwrite newer tracking. Receipt lookup works after interruption and serializes against publication. Saved status cannot be recorded without a matching database receipt.

## Verification and limits

Tests cover structured responses, malformed results, conflicts, stopped runs, tracking failures before mutation, lost responses after real local database commits, project isolation, durable restart context, invalid SDK inputs, bounded recovery, question-only replies and invalid proposals hidden by unrelated writes. Provider responses are scripted through the actual installed SDK. UI checks use an isolated local database and prohibit real provider traffic.

Verification on October 28, 2026: all 221 tests, lint, typecheck and production build passed. Browser checks confirmed saved, unsaved and unconfirmed indicators remain after reloading the conversation.

This enforces observable action results and verified save status. It cannot prove the semantic correctness of generated plans or prices, force a model to understand every result, or infer every intended write from arbitrary prose when no mutation tool is attempted. Historical replies lacking action records retain their existing status/receipts; missing historical evidence is not invented. If the process disappears mid-action, in_progress is displayed as unconfirmed until recovery. No new paid AI test was run for this change.

2026-10-28 consumer copy audit: Consumer status omits revision counters and describes prepared changes as not saved yet. The receipt and recovery contracts remain unchanged; uncertain saves still require verification before retrying.

Consumer save banners derive text from the stored outcome and known failure code. Raw tool/recovery messages remain available to the agent but are not displayed as banners; this also protects previously stored technical messages.

Consumer copy audit verification: lint, typecheck and 106 targeted tests passed. Rendered Explore and Trip details were checked; no live trip or file data was changed.


## V2 editing integration

V2 mutation tools require a transient edit token and use atomic domain batches. Accepted content survives rejection, while independent per-artifact obligations prevent an unrelated write from hiding the failure. Invalid SDK input also records its artifact obligation. A later valid correction clears that obligation. Existing SQL receipt verification and early brief checkpoint remain the publication mechanisms.

Application tools deduplicate accepted mutation executions by SDK call identity within one ActionRun, including the recovery continuation. The original result is replayed without executing another add or checkpoint. Changed arguments with the same call identity are blocked. This cache is transient, not a new durable receipt history. Failed attempts can be corrected and retried. Provider-hosted search remains read-only.
