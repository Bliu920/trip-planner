# Planning activity

Updated October 28, 2026. Activity records observable actions inside assistant replies: searches, reviewed material, prepared changes, saved files and cited sources. It does not store private model reasoning, raw tool arguments, full tool responses, or a second copy of documents and plans.

## Ownership

| Location | Responsibility |
| --- | --- |
| lib/activity/model.ts | Bounded display schema and safe history decoding |
| lib/activity/history.tsx, activity.css | Expandable activity rows, source links and document opening |
| lib/activity/index.ts | Public frontend API |
| services/activity/index.ts | One recorder per generation, lifecycle reduction and persist-before-publish |
| services/activity/summary.ts | Explicit projections from application results and native web search |
| services/activity/storage.ts | Scoped persistence adapter |
| services/chat/stream.ts | Feed observable SDK chunks into the recorder and finish remaining steps |
| lib/chat/use-chat.ts | Preserve prior attempt entries while the SDK regenerates a reply |

Each entry has a stable ID, generation/attempt, title, status, concise detail, source links and document references. Initial history is empty. Started entries update in place and terminal entries cannot regress. Source URLs allow only HTTP(S); raw errors and internal tool names are excluded from display. Research details report returned queries, matched places and sources, without inventing findings or implying source availability verifies every claim. Native web search does not expose a prose findings report; substantive findings remain in the assistant answer or linked research documents.

## Persistence and recovery

Apply `supabase/migrations/20261028150137_chat_activity.sql` before deploying this feature. This task leaves the migration local, following the standing migration instruction. It adds private `message_activity` rows linked to existing messages, a generation-guarded write RPC, an interruption trigger, and activity projection in the existing conversation snapshot. No additional browser endpoint or polling loop is needed. Text checkpoints do not touch activity, and activity does not consume the transcript's model-context size allowance.

Rows are ordered by their first insertion. Writes serialize against the owning message and validate trip, conversation, active generation and status. Updates are idempotent; terminal entries cannot be overwritten. Up to 600 entries are retained per assistant message across retries, each capped at 40 KB, 12 sources and 30 document references. This bounds storage without silently truncating earlier attempts. New chats retain earlier conversation history through the existing selector.

Completion, cancellation, expired heartbeats and retries settle unfinished entries as interrupted. Retries keep earlier attempts and add a new generation. The renderer marks a leftover running entry interrupted when the reply is no longer active. Missing historical activity is not reconstructed. Existing chats without entries render normally.

The recorder persists an entry before streaming it. Failure to record progress aborts generation and uses the existing honest chat persistence failure state; it never publishes an unsaved success. A crash can still occur between an actual action and recording its result. Such a step remains interrupted or unconfirmed. Existing ActionRun receipt recovery and the final saved banner are authoritative for saves. A prior failed or unconfirmed step is historical evidence, not proof that a later recovery failed.

Prepared entries do not mean saved. Brief checkpoint links appear only for persisted results. Commit results expose saved document references; the current file opens through Library's existing scoped document view. Renamed or deleted files retain their historical label; opening a missing file uses the existing recovery UI. Plan, Budget and Library retain all domain validation and persistence ownership.

## Live progress ownership

The [chat response module](chat-response.md) owns the only live spinner and announcement, in a fixed row before the response content. ActivityHistory renders static status icons and permanent disclosures. Running history never hides or replaces the live row. This prevents the spinner from jumping between the response header and individual action rows.

## Workspace behavior

Before a saved Plan exists, chat is the only visible panel. The top header opens trip content at the regular width. Library is initially selected, and reopening restores the last selected view. First saved Plan opens the normal content panel once; there is no compact mode, narrow Library, width-expansion animation, or visible empty-plan placeholder. Closing content preserves its mounted state and the chat draft. On mobile, first Plan availability does not move focus away from chat.

## Validation

`tests/activity.test.ts` exercises actual SQL history, checkpoint survival, terminal/idempotent writes, retry generations, abandonment, scope and permissions, safe result projection and storage failure. `tests/chat.test.ts` drives the installed SDK with scripted provider responses and reads activity while the reply is still running, then verifies completion and retry retention. `tests/workspace-layout.test.ts` covers chat-only start, explicit content opening, budget-first behavior, first Plan, closing, refresh and errors. No paid provider calls are needed.

Manual review uses the real Workspace and document dialog with isolated fixture data, on desktop and at 390px. Check expanding results, source links, saved file access and missing files, empty chat/Library, interrupted replies, preserved draft/caret, first-plan appearance and horizontal overflow.

Verification on October 28, 2026: lint, typecheck and all 261 tests passed. Browser review at 1280px and 390px confirmed persistent completed/interrupted activity, expandable sources, file recovery, empty states, draft preservation and no horizontal overflow. No browser warnings/errors. Temporary fixture removed. No paid model calls or remote migration execution.
