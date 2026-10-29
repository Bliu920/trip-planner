# Library

Feature name: **Library**. Individual files remain documents in the data model. Existing `documents` code paths, API routes and stored identifiers retain their technical names for compatibility.

Status: implemented and verified locally. Migration and cleanup scheduler deployment remain pending.
Last updated: 2026-10-28.

## Purpose and boundary

Library manages each trip’s uploaded files and editable Markdown, TXT and CSV files. PDF, PNG and JPEG files are read-only previews. It owns original bytes, metadata, upload verification, listing, preview/download, naming, deletion and cleanup. A user can manage the library without loading a conversation or contacting an AI provider.

A document belongs to a trip. Messages reference documents; they do not own or consume them. The same original can be reused across messages and conversations without another Storage object.

Chat owns message history, active document selection and provider-specific model input. Plan owns itinerary arrangements; the supporting context document holds durable requirements not represented there. An uploaded or research document is not itself a verified booking. Supporting context is deliberately interpreted context, with its user requirements and agent assumptions distinguished in the text. OCR indexing, semantic search, folders and tags are outside this version.

### Code map

- `lib/documents/index.ts`: frontend public entrypoint.
- `lib/file-types/index.ts`: shared, browser-safe file capability API. `formats.json` is the sole supported-format policy.
- `lib/documents/types.ts`: metadata contracts and Library name validation; delegates format validation to the shared policy.
- `lib/documents/`: library, detail and selection controls plus client requests.
- `services/documents/index.ts`: server public entrypoint and HTTP orchestration.
- `services/documents/`: metadata transactions, original bytes and lifecycle work.
- `lib/attachments/`: compatibility adapters for existing starter/composer APIs, plus chat draft integration.
- `services/attachments/index.ts`: compatibility export for existing attachment routes. It does not own another store.
- `services/chat/documents.ts`: chat-owned model-context assembly.
- `services/conversations/`: chat-owned document selection operations.
- `lib/workspace/`: composition of the Library view and Chat callbacks.

## Information model

| Object | Owner and contents | Storage | Loading boundary |
|---|---|---|---|
| Document metadata | Library: stable ID, trip reference, immutable original filename/type, current size, editable display name, lifecycle state, revision and timestamps | Existing `public.attachments` table evolved by a forward migration | List/detail loads no original bytes |
| Original and content versions | Library: immutable uploaded bytes and subsequent text versions at stable object paths | Private `trip-attachments` bucket, existing `<trip-reference>/<id>` paths retained | Download/preview or selected model context only |
| Message reference | Chat: message ID and document ID; display order remains in message parts | `message_documents`; existing message parts retain historical display snapshots | Relevant message history or document usage details |
| Active selection | Chat: documents currently available to one conversation | `conversation_documents` | Conversation snapshot / turn reservation |
| Local draft | Browser: selected local files or references to saved documents | React state only | Current composer or library upload controls |
| Interpreted fact | Plan and Agent integration: interpreted content with a source reference | Owned by the relevant domain artifact | Loaded by that domain, not Library |

Initial state: no documents and no active conversation selection. A file selected locally has no server record until upload reservation. Ready, unbound documents are valid library members. Historical names are immutable message snapshots, not a second editable name. Current availability comes from Library.

Uploaded binary originals are immutable under a document ID. Replacing a PDF/image requires a new upload. Uploaded text keeps its ID and original version when edited; later immutable versions advance its current content. Rename changes only the display name; it does not change storage paths or historical snapshots. This version does not infer replacements or deduplicate separate user uploads by filename.

## Lifecycle

| State | Meaning | Operations |
|---|---|---|
| Local only | File selected but upload not reserved | Remove selection or upload |
| `pending` | Reservation exists; transfer or verification is unfinished | Retry transfer/finalization or delete; not readable by model/download |
| `ready` | Size and format verified; content stored | Preview or edit supported text, download, rename, reference in chat, delete |
| `deleting` | New use denied, physical cleanup remains outstanding | Retry cleanup; no restore or new content access |
| `deleted` | Physical deletion settled after outstanding upload grants expire | Minimal historical tombstone; no content access |

`ready` proves storage verification only. It does not prove parseability, successful AI interpretation, lack of malware, booking validity or external factual accuracy.

### Upload and recovery

Formats and limits come from the shared policy below. Text supports empty UTF-8 files up to 256 KiB; PDF/images require at least one byte and allow up to 5 MiB. At most three files can be selected for one send/upload action. Reservation and finalization are idempotent by document ID. Retries reconcile storage rather than creating new IDs for the same attempt. Both client and server validate byte count, extension/MIME agreement, strict UTF-8 for text and signatures for binary formats before readiness. Browser MIME aliases or missing MIME values are accepted only with a recognized extension and are canonicalized before reservation and Storage upload. Signed uploads cannot replace an existing object. Text finalization records the original as content revision 1, with its hash, atomically with readiness.

A successful upload followed by failed chat submission remains in Library. A partial batch keeps successful files and retries remaining work with stable IDs. Removing a saved file from a draft does not delete the trip document. Browser reload loses local file bytes; recover finalization if Storage received the bytes, otherwise select the original again. Do not promise persistent browser drafts.

Pending transfers expire after 24 hours of inactivity. Ready documents do not expire merely because no chat references them. Quota is 30 live/reserved documents per trip; deleting objects retain their reservation until physical cleanup and upload-grant settlement are complete.

### Preview and management

The Library heading shares one row with named icon controls for creating a document, adding files and switching between grid/list views. Tooltips and accessible names describe each action; touch controls are 44px. Grid items use a quiet fill and outline. List rows have dividers only between files, with no trailing rule.

Library loads its metadata when its workspace tab first opens. The mounted library is retained across tab changes so pending selections and transfers survive switching views. It lists metadata and provides upload, preview, download, rename, use in chat and deletion. A load error is distinct from an empty library. Detail views resolve current state, including tombstones. PDF preview uses the native browser viewer only when `navigator.pdfViewerEnabled` reports support; otherwise the detail shows a concise download fallback. Download remains available for ready documents. This is capability detection, not a guarantee that every PDF will parse. See the [browser capability contract](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/pdfViewerEnabled).

The library defaults to icon view, with a list-view toggle in the same toolbar as Add files. Both views read the same metadata and expose the same open, use-in-chat and incomplete-upload actions. Icon view uses file-type symbols without fetching original bytes; list view adds aligned size/date columns, with the date hidden in narrow panels. View choice is local UI state retained across workspace tab switches, not a saved document property. Add files stages a batch; the upload panel appears only when files are selected. Routine instructions and Saved badges are omitted, while actionable upload errors and lifecycle states remain visible. Metadata refreshes through the existing focus/change subscriptions; failed loads retain a Retry action.

Chat exposes one plus button with two actions: `Upload files` opens the native multiple-file chooser; `Choose from Library` opens the trip's saved-file picker. Both stage files for the next message without sending. Before a trip exists, the starter plus button opens upload directly because no saved library exists yet. The microphone remains a separate Audio action.

The attachment adapter owns the menu, local file input and draft integration. Library exports a trigger-independent `DocumentPicker` dialog with `reference`, `onSelect`, `onClose`, optional `returnFocus` and optional `selectedIds`. Render it only while open. Already staged documents show `Attached` and cannot be added again. The menu uses Base UI's installed keyboard navigation, typeahead and dismissal behavior; it is portaled outside the clipped composer and positioned to avoid viewport edges. The dialog receives the persistent plus-button focus target so closing it does not focus an unmounted menu item. Upload locking closes the menu/picker and disables the native file input. Cancelling file selection preserves the draft and existing errors. Mobile buttons and menu rows have at least 44px targets.

Rename uses a revision check. A stale tab must reload after a conflict; it cannot overwrite a newer name. Delete is a distinct confirmed operation, explaining that existing messages and planning facts remain. Pending/deleting records remain visible for recovery. Completed tombstones do not appear in the normal list.

### Deletion and cleanup

Deletion first revokes new document use in the database, removes active selections, and preserves historical message references. Physical Storage removal is retried independently. Database and Storage are not treated as an atomic system.

The server records a conservative outstanding upload-grant window before issuing signed URLs. Supabase documents a two-hour signed-upload lifetime. Cleanup must retain the locator and recheck after the grant window so a delayed upload cannot leave an untracked original. A completed deletion must not be inferred from a single successful early remove request.

Already-admitted downloads or model requests may finish. Model context is rechecked before transmission, but bytes already delivered cannot be recalled. Deletion does not scrub existing transcript quotations, saved planning facts, provider processing or infrastructure backups.

Conversation deletion removes relationships, not originals. Hard trip deletion is currently blocked by a restrictive foreign key, including for settled tombstones. A future trip-deletion orchestrator must remove objects, relationships and tombstones deliberately before deleting the trip. Removing a trip from the browser's recent list still only forgets its reference on that device.

## Supported-file policy

`lib/file-types/formats.json` owns format IDs, labels, extensions, accepted browser MIME aliases, canonical MIME, byte limits, editor mode, preview mode, AI input mode and permission to create text. It contains no file data or domain state. Consumers import its public API through `lib/file-types/index.ts`; do not introduce another MIME allowlist.

| Format | Upload | User editing | Preview | AI access |
|---|---|---|---|---|
| Markdown (`.md`, `.markdown`) | UTF-8, 256 KiB | Plain text | Text editor | Read/create/edit text |
| TXT (`.txt`) | UTF-8, 256 KiB | Plain text | Text editor | Read/create/edit text |
| CSV (`.csv`) | UTF-8, 256 KiB | Raw CSV text | Text editor | Read/create/edit text |
| PDF (`.pdf`) | 5 MiB | None | Browser PDF viewer | Selected file input |
| PNG/JPEG (`.png`, `.jpg`, `.jpeg`) | 5 MiB | None | Image | Selected file input |

This table explains the registry, not an independent policy. TXT/CSV do not become Markdown merely because their browser MIME is generic. CSV is intentionally a plain text file: no spreadsheet parsing, formula execution, column inference or data rewriting. Markdown is edited as source; embedded HTML is not executed. Text must decode as UTF-8 without unsupported control characters. Empty text is valid and saved exactly, without an inserted newline. Binary signature validation does not establish full parseability or safety.

The policy is enforced by native file filters, client upload checks, server reservation/finalization, server content reads, editor/preview dispatch, chat selection/input construction, AI staging and database constraints. AI queries resolve current scoped metadata rather than trusting a filename or stale client MIME. Metadata lists still expose unsupported legacy records for cleanup, but opening content, selection and editing are denied. An unsupported format cannot fall back to an image or editable Markdown.

A forward SQL migration embeds a generated registry projection in `library_file_types()`. Database constraints, text staging and the private Storage bucket derive their rules from that projection. `node --import tsx scripts/file-types/index.ts` prints the projection for a **new** migration. Never rewrite an applied migration when changing policy. Update the registry, add the forward migration, implement any new format handler, and advance the parity test to that migration in one change. A registry row alone cannot provide a new parser or preview handler. `tests/file-types.test.ts` verifies registry/SQL/bucket agreement and rejects unsupported writes independently of application checks.

## Editable text

The same Library owns generated `planning_context`, `research` and `working` files and editable text of kind `upload`. Kind describes purpose/origin; MIME determines capabilities. New user-created files default to `working`; `upload` is reserved for actual uploads. Existing kind and format are immutable. Supporting context remains Markdown with its stricter 24 KiB domain limit and at most one active file per trip.

`lib/documents/text.ts` defines the whole-file text contract. `lib/documents/editor.tsx` provides one plain text buffer shared by Markdown, TXT and CSV, with Save, Reload and Close. Existing files open directly into the buffer; renaming is a separate file action. New files have a compact filename/format toolbar. All text is literal file content, including headings, fences and CSV rows. There is no section parsing, section selector or formatted editing mode. New filenames without an extension receive the selected format extension. Dialogs define their own color variables because portals do not inherit workspace styles; Save and field borders remain visible. Mobile editing actions use 44px targets. `services/documents/text.ts`, exposed through `index.ts`, owns validation, scoped reads and staged writes. Text bytes live only in private Storage, not SQL or a second context store.

Each edit has a stable ID, expected metadata revision, name, kind and complete text. The existing API field `markdown` carries raw content for all supported text types for compatibility. Responses include canonical `mediaType`; saves may include it as an additional format consistency check. Creation infers format from a supported filename extension. Extensionless legacy generated names default to Markdown. Unknown suffixes are rejected; rename cannot disguise a file as another type. Existing files may keep an extensionless display name.

Publishing creates an immutable content version and advances the metadata head. Metadata revision also changes on rename; content revision advances when a save publishes content. SQL `document_versions` stores path/hash/size/author, never the body. User and agent authorship are distinguished. Uploaded text starts at version 1, preserving the original object and its outstanding upload grant. Edited uploads retain their original filename, ID and kind. Every text read verifies its hash; a concurrent head change causes a retryable conflict rather than returning mismatched content and metadata.

`validateDocumentEdit` runs before AI staging accepts an edit and again in `prepareDocument` against current metadata. `prepareDocument` reserves and uploads bytes; `publishDocument` publishes by expected revision. Workspace can publish prepared files and a Plan/Budget in one transaction. Unpublished writes stay unreadable and become cleanup candidates after 24 hours. Deletion removes the uploaded original, all published versions and staged paths. The existing grant-expiry cleanup protection continues to apply after text edits.

The editor preserves unsaved text on failed saves and external refreshes. Reload and Close confirm before discarding edits. Conflicts require reviewing current content before reapplying changes; no automatic merge. Historical versions are available through the API without a browsing UI. Agent reads also return the complete file unchanged; the read tool has no section parameter. Historical source citations may retain a section hint as metadata, which does not control file reads or edits.

- `POST /api/trips/:reference/documents/text`: create with `id`, `name`, `kind`, `expectedRevision: 0`, `markdown` and optional `mediaType`.
- `GET /api/trips/:reference/documents/:id/text?revision=N`: read an exact content revision, or current when omitted.
- `PUT /api/trips/:reference/documents/:id/text`: edit supported text, including uploads, using its expected metadata revision and existing kind.

Apply `20261028114425_supported_files.sql` after the previous migrations, before deploying this feature. It extends format/size checks, bucket MIME policy, staging and publication, and adds versioned text finalization. No live migration or Storage operation was executed for this change.

## Chat integration

Uploading to Library does not automatically expose bytes to the model. `Use in chat` stages a reference in the current composer without sending. The saved-document picker uses the same draft state as local attachments. Successful submission clears only files captured by that submission, preserving newly staged files. Welcome suggestions and message-reference navigation are held while an upload is active; failed reference navigation does not loop automatically.

A successful send atomically creates historical references and adds ready, same-trip documents to the active selection. A new conversation begins empty. The selection is capped at six unique files, also bounded by 30 MB under the per-file limit. Reusing one file does not consume multiple context slots or transmit duplicate copies within a turn.

After document reads, chat renews its generation checkpoint before contacting the provider, so slow reads cannot silently start a provider call for an already superseded turn. The active selection is shown above the composer. `Stop using` removes the file from future original-file context without deleting it from the library or removing historical messages. Previous text may still mention its contents. Selection changes reject a concurrently streaming turn. Selection-operation failures have their own error display and never offer to regenerate an unrelated reply.

The shared supporting context is loaded by workspace integration independently of per-chat selection. Other supported text files load on demand or through explicit selection; Markdown/TXT/CSV are supplied as text, while PDFs/images remain file input. The chat adapter builds provider-specific messages. Historical references are labeled as references only; selected originals are supplied once with the latest user message. Deleted/inactive originals are not silently reloaded from history. A selected file read failure preserves the saved message and offers retry or removal from selection before retrying. The model must distinguish supplied content from verified external facts.

## HTTP contracts

All trip routes use the existing bearer-like UUID trip-reference access model. Anyone with that reference can read and edit its documents. The server validates scope; clients cannot supply storage paths or credentials.

| Route | Contract |
|---|---|
| `GET /api/trips/:reference/documents` | Metadata list, including pending/deleting records, excluding deleted tombstones |
| `POST /api/trips/:reference/documents` | Reserve `{id,name,mediaType,size,source}`; returns `{document,ready,uploadUrl?}` |
| `GET /api/trips/:reference/documents/:id` | Current detail metadata and usage references, including tombstones |
| `PATCH /api/trips/:reference/documents/:id` | Rename `{name,revision}` with optimistic concurrency |
| `DELETE /api/trips/:reference/documents/:id` | Delete `{revision}`; cleanup may remain pending |
| `POST /api/trips/:reference/documents/:id/finalize` | Verify received bytes and finalize readiness |
| `GET /api/trips/:reference/documents/:id/content` | Authorized download; `?inline=1` requests preview |
| `DELETE /api/trips/:reference/conversations/:id/documents/:documentId` | Stop using the file in this conversation |
| `POST /api/internal/documents/cleanup` | Bounded cleanup authenticated by a dedicated bearer secret |

Existing attachment routes remain compatibility adapters, including starter ID resolution. New clients use document routes. Content and metadata responses are not publicly cached. Preview and download do not expose service credentials or persist public object URLs.

## Operations

Apply `supabase/migrations/20261026110643_documents.sql` after the existing trip, chat and attachment migrations. Do not edit applied migrations or re-upload existing documents. Backfill historical references and active selections, preserve message display snapshots and existing object IDs/paths. Migration tests execute the prior schema with existing data, apply the new migration and check IDs, paths, historical references and conversation-independent document survival.

Storage uses the existing `SUPABASE_URL` and server secret configuration. Cleanup additionally requires `DOCUMENT_CLEANUP_SECRET`, configured only on the server and the trusted scheduler, with at least 32 characters. `.env.example` contains an empty placeholder. Do not put it in client-visible environment variables or docs.

A trusted external scheduler should POST to the cleanup endpoint periodically, for example every five minutes, with `Authorization: Bearer <DOCUMENT_CLEANUP_SECRET>`. Each request claims at most 10 due records and processes Storage removal concurrently. Failed claims become retryable after five minutes. The route declares a 60-second maximum duration, subject to hosting support. Endpoint implementation is not proof that a scheduler has been deployed. If cleanup fails, deleting records remain inaccessible and retryable; unfinished cleanup continues to consume quota. Use the library states, server logs and bounded endpoint result to diagnose work. Avoid logging document contents, signed URLs or secrets.

Official storage references: [signed upload URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl) and [Storage client removal implementation](https://github.com/supabase/supabase-js/blob/master/packages/core/storage-js/src/packages/StorageFileApi.ts). Current implementation assumptions were checked on 2026-10-26.

## Verification

Supported-file verification (2026-10-28): full-project lint, typecheck, all 239 tests and the production build passed. The final focused policy/client run passed 17 tests. Coverage includes registry/SQL/bucket parity, canonical MIME handling, unsupported and disguised formats, UTF-8/control validation, empty files, CSV bytes, uploaded version 1, stale/concurrent saves, hash failures on downloads/AI reads, cross-trip isolation, AI staging rejection and cleanup of original/version paths. Existing chat, planning and attachment suites remain green.

Browser checks used the production UI with disposable PGlite/object storage and no live providers. Verified CSV creation, TXT/CSV uploads, editing uploaded TXT, reload, unsaved-close cancellation, automatic extension selection, unsupported SVG rejection, read-only image/PDF controls and desktop/390px layout. Save is visible in the portaled dialog, mobile editing buttons are 44px, and the mobile page has no horizontal overflow. Screenshots: `.local/library-text-editor-desktop.png` and `.local/library-text-editor-mobile.png`.

PDF verification limit: this embedded test browser reported native PDF capability but rendered a blank viewer both in Library and at the direct PDF URL. File delivery and headers were verified; successful native PDF pixel rendering is not claimed. A temporary header compatibility experiment did not resolve it and was reverted. The original private-content security headers remain intact. Download is always available and browsers reporting no native viewer receive an explicit fallback. Live migration, Storage/CORS, deployed cleanup and an independent normal-browser PDF rendering check remain deployment checks.


Automated coverage includes: existing upload security, same-trip reuse, cross-trip denial, atomic reference/selection persistence, metadata-only list, stale rename, deletion versus finalization, historical references after delete, Storage failure retry, late signed uploads, pending expiry, quota reclamation and migration backfill.

Validation commands: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

Icon/list view verification (2026-10-26): lint, typecheck, the seven document-client tests and production build passed. Browser checks covered both layouts at desktop and 390px, long filenames, 44px mobile actions, keyboard view selection without rings, empty and incomplete-upload states, opening a file, staging it in chat, retaining upload drafts across view switches, completing an upload, and retaining the selected view across workspace tabs. Final upload checks used the production UI with disposable PGlite/object storage; no live Supabase or model requests were made. Screenshots: `.local/documents-icon-view.jpg`, `.local/documents-list-view.jpg`, `.local/documents-icons-mobile.jpg`.

- Final full-project lint, typecheck and all 83 tests passed after the review fixes.
- The production build passed, including after the unified attachment menu change.
- Browser verification used a disposable PGlite database, local object map and mocked provider stream behind a localhost fixture. Verified standalone image upload, saved-document staging without sending, send/reuse without a duplicate object, active-selection removal, preview, rename preserving original filename, deletion confirmation/cancellation, and focus restoration.
- Desktop and 390px mobile library views were inspected. The mobile document width equals the viewport width (390px), with no horizontal overflow. Screenshot evidence is local under `.local/documents-desktop.jpg` and is not a production-data capture.
- The plus menu was checked at desktop and 390px mobile widths. Verified Enter/arrow navigation, Escape and outside-click dismissal, menu-to-dialog focus handoff, focus restoration, existing-selection labels, draft preservation, native multi-file chooser, starter direct upload, and a combined saved/new-file send with the mocked provider. Mobile trigger and menu items measured 44px with no horizontal overflow. Browser logs had no errors or warnings. Evidence: `.local/attachment-menu-desktop.jpg` and `.local/attachment-menu-mobile.jpg`.
- Physical deletion, late-upload cleanup and migration behavior were tested through SQL/service fixtures, not by deleting live files. No live migration, Supabase upload/deletion or model request occurred. Live bucket/CORS behavior and deployed scheduler execution still need environment verification.

Small HTTP/compatibility adapters use the small-module exception. The document contract is a pure shared file; frontend files are separated into client state, library, reusable detail/picker controls and public exports, plus styles.

## Limitations and future work

No OCR/indexing, account-level ownership, folders, binary replacement, rich text editor, spreadsheet editor, version browsing UI or deletion of transcript quotations. No automatic plan mutation. Cleanup needs deployment configuration. The current take-home limits are explicit product constraints, not assertions that file count alone measures provider context cost.

Integration preserves the concurrent Audio feature and avoids changing its composer and prompt-input files. After its task completed, its authoritative guide moved to [audio-input.md](audio-input.md), with the previous path retained as a redirect. Both modules follow the same maintenance contract.

## Change history

- 2026-10-28: Applied the explicit plain-editor correction. Removed section parsing/replacement utilities and the agent section-read option. Existing files open as one text buffer; new filenames/formats use a compact toolbar, and rename remains a separate file action. Verified Markdown/TXT/CSV in the running UI and Markdown save/reload. Lint, typecheck and 43 relevant tests passed. Screenshot: `.local/library-plain-editor.png`.

- 2026-10-28: Added the shared file capability registry, UTF-8 Markdown/TXT/CSV uploads and editing, read-only PDF/image dispatch, AI query/stage enforcement and a generated SQL policy. Text uploads retain their original as revision 1. Simplified the editor and added policy, lifecycle, integrity and concurrency regression checks. Deployment requires the supported-files migration. Verification results are recorded below.

- 2026-10-26: Re-audited Library naming with case-insensitive source searches, TypeScript/JSX string inspection across 137 files, maintained-document/link validation and rendered workspace/menu/picker checks. Fixed two remaining fallback messages and two descriptive documentation phrases. Fresh feature-name searches were clean; 25 documentation links, lint/typecheck and 19 relevant tests passed. Existing document nouns, technical identifiers and historical task records are intentional.

- 2026-10-26: Standardized Library across current UI wording, server error instructions, agent guidance, the README and maintained module guides. Moved this guide to library.md and retained the old guide URL as a redirect. Individual document data structures, existing routes and storage identities are unchanged, matching the user-confirmed scope of visible wording and documentation. Lint/typecheck and 41 relevant tests passed.

- 2026-10-26: Renamed the UI feature to Library, including the workspace tab, heading, attachment menu, picker and loading/accessibility labels. Technical module names and APIs are unchanged. Lint and typecheck passed.

- 2026-10-26: Added editable Markdown, immutable content revisions, section editing, hash-verified reads, staged-file cleanup and atomic Plan integration. Added independent text and integration tests. Uploaded-original behavior and Voice Input remain unchanged. See [Agent](agent.md) for execution and deployment details.

- 2026-10-26: Added icon and list library views, compact view/upload controls, direct file opening and per-file chat/retry actions. Removed the permanent upload instruction panel, repetitive Saved labels, duplicate Open actions, verbose success copy and the redundant preview instruction. Both views preserve the existing upload/retry lifecycle and use fill-based button focus feedback. Lint/typecheck, document-client tests, production build and desktop/mobile browser checks passed.
- 2026-10-26: Removed the plus/composer button and attachment-menu focus outlines following the user's visual preference. Keyboard focus uses restrained fill changes; dialog focus restoration and menu navigation are unchanged. The shared preference is maintained in docs/ui-principles.md. Lint/typecheck passed; browser verification confirmed no outline or shadow on the keyboard-focused plus button.
- 2026-10-26: Replaced the chat upload/folder pair with one plus menu. Made the saved picker trigger-independent, restored focus across the menu/dialog handoff, and marked existing draft selections as Attached. Starter keeps direct upload. Lint, typecheck, all 83 tests and production build passed. See Verification for browser checks.
- 2026-10-26: Implemented trip-owned documents, reusable chat references, active selection, library management, optimistic rename, durable deletion and bounded cleanup. Preserved existing IDs and stored originals. Added migration tests and client/context/lifecycle coverage, resolved draft/navigation/focus races, and established shared maintained guides for Library and Audio. Live migration and scheduler setup remain pending.

## Maintenance

Every change to this module, its migration, cleanup operations or chat/workspace integration must update this guide in the same change. Keep current-state sections accurate and add a dated change entry with verification. Follow the shared [maintenance contract](README.md#maintenance-contract). Do not maintain a competing lifecycle specification in task paperwork.

## Shared project refresh

2026-10-27: Document notification exports now delegate to `lib/trips/events.ts`. The public `notifyDocumentsChanged` and `subscribeDocuments` contracts and legacy browser channel names remain compatible. Plan and Chat can use project invalidation directly without importing Library. Uploads, storage, permissions and document editing are unchanged. Verified with document-client and project-event regression tests.

## Travel brief checkpoint

The agent's trip-details guide defines the contents of the single planning_context document, initially named Travel brief.md. It is a sourced requirements view with preferences, budget reference, dates/arrival/departure, group/activity needs, existing arrangements/constraints and questions. Application rules stay in services/guides; the brief contains project-specific interpretation only. Plan and Budget retain their own facts.

The saveBrief tool publishes an independent checkpoint through planning_save_brief before dependent planning proposals. It reuses immutable Markdown versions, metadata revisions, private Storage and cleanup. No new document kind or content table is added. Stopping planning does not roll back a published brief and does not imply a completed plan. Final-stage brief updates can still be staged with the plan/budget commit.

Project content starts with chat alone. The top header opens or closes trip content at the regular width, initially showing Library. Reopening restores the last selected view. Plan and Budget tabs appear when their saved artifacts exist; failed loads remain reachable for recovery. The first saved Plan opens the content panel and selects Plan once per project session. Later refreshes preserve the selected view. A Budget arriving first does not open a panel. Mobile keeps focused chat visible when the first Plan arrives. Mounted surfaces retain state across tab switches. Saved files and research actions are accessible from persistent assistant-message activity. See [Planning activity](activity.md).

2026-10-28: Removed the pinned Travel brief shortcut from chat and made all project content available independently of Plan state. Verified Library during delayed/failed Plan loading, preserved selected tabs and drafts when the first Plan arrives, and mobile navigation at 390px. Uses existing Library documents and context ingestion.

2026-10-28: Replaced the compact Library layout with chat-first visibility and explicit regular-width content access. Saved-artifact availability still comes from existing Plan/Budget sessions. First Plan opens once without moving mobile chat focus.

2026-10-28: Simplified Library controls into the title row, replaced the two view buttons with one toggle, added outlined grid cards, and removed trailing list dividers. Browser review covered 280px/340px/1000px panels, 390px mobile, long names, view switching and opening/closing the existing editor. No data lifecycle changes. Final lint and typecheck passed.

2026-10-28 consumer copy audit: The default planning document is Travel brief.md. Upload/deletion recovery explains file availability and retry actions without storage-cleanup terminology. Service failures no longer ask travellers to apply migrations. File formats, versions, content and lifecycle rules are unchanged.

Consumer copy audit verification: lint, typecheck and 106 targeted tests passed. Rendered Explore and Trip details were checked; no live trip or file data was changed.


## V2 agent text operations

The model uses listDocuments and readDocument for effective or pinned saved state. Effective metadata includes newly staged files and renames. Lists support filters and token-bound pagination; full text reads are exact and never silently shortened. Historical reads require saved view and do not supply a current edit token.

createDocument accepts a supported filename, kind and content, with host-allocated identity. editDocument applies atomic rename, replaceContent or exact unique replaceText operations. Existing upload-origin text remains editable. Renaming retains format/kind; PDF/images remain read-only, and availability records whether the original was actually supplied in the current request. Missing binary selection is an actionable result, never a claim that the document was read.

The external field content maps to the existing internal markdown field for Markdown/TXT/CSV. Storage, immutable versions, metadata revisions, file limits and SQL publication remain unchanged. The single Travel brief keeps its reserved identity. Initial saveBrief directly checkpoints it; generic creation only stages. Later changes join final publication.

Draft document citations expose their predicted content revision explicitly as unsaved. Editing that text again invalidates dependent draft Plan/Budget evidence until revalidated. Final preparation checks the actual immutable revision before publication. Citations to exact historical saved content remain historical evidence.
