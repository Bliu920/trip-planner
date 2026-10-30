# Frontend reading guide

Updated October 30, 2026. This cleanup preserves existing UI, endpoints and saved data.

## Start here

| Location | Responsibility | When to change it |
| --- | --- | --- |
| `app/` | Route entry points and page composition | Add or connect a page |
| `lib/workspace/` | Content views, chat and workspace navigation | Change how features fit together |
| `lib/<feature>/index.ts` | Public API and composition | Find supported imports before implementation |
| Feature components and CSS | Rendering and styling | Change UI without changing persistence |
| Feature hooks and clients | Draft state, requests and notifications | Change loading or synchronization |
| Feature models and operations | Browser-safe contracts and domain rules | Change data meaning or validity |
| `components/ui/` | Shared controls, dialogs, dropdowns and scrolling | Change behavior shared across features |
| `services/` | Server execution and storage | Follow an API route into backend behavior |

Keep boundaries coarse. A small component can stay in one file. Extract a responsibility when it has a lifecycle, domain rule or reuse that deserves independent reading and verification. Avoid layers that only forward arguments.

## Common changes

- **Library actions:** start with `documents/detail.tsx`, state in `use-detail.ts` and requests in `client.ts`. Text drafts and saves live in `use-editor.ts`; upload selection and retries live in `use-upload.ts`. List layout and file navigation remain in `library.tsx`. See [Library](library.md).
- **Chat synchronization:** `chat/use-chat.ts` owns lifecycle, request version guards, polling and pending sends. `transport.ts` converts SDK requests, `history.ts` performs history requests and `reconcile.ts` contains pure merging/save recognition. Keep those decisions out of Workspace rendering.
- **Response presentation:** `chat-response/` owns transcript identity and response composition; `work-progress/` owns the trailing work disclosure. See [Chat response](chat-response.md).
- **Plan editing:** start with `plan/editor/` and its existing session/persistence boundary. Preserve domain operations and conflict handling rather than duplicating them in components. See [Plan](plan.md).

## Formatting and checks

Run `npm run format`, `npm run format:check`, `npm run lint` and `npm run typecheck`. Run relevant regressions with `npm test`. Formatting covers `lib/`, `components/` and app TSX/CSS. Backend code, datasets and migrations are outside this formatting pass.

Prettier is pinned to **3.9.10**, verified October 30, 2026 against the [official installation guide](https://prettier.io/docs/install). The exact dependency, lockfile and root configuration keep formatting reproducible. No editor extension is required.

## Cleanup boundary

Unused Activity/Itinerary previews, their dedicated Trace/Collapsible/Badge support, unused Separator and obsolete TripEditor were removed after checking imports and exports. Current chat, composer, plan and document surfaces remain. This pass adds no state library, context provider, API route or database migration.

`tests/chat-sync.test.ts` protects request identity, pending-send confirmation, retry activity and verified saves. Existing render regressions protect file navigation and response layout. `tests/frontend-cleanup-fixture.tsx` provides isolated manual Library/chat review. Its requests are intercepted in memory; production routes do not mount it. Temporarily re-export it from a local preview page to repeat review, then remove that page.

Verification: 501 offline tests, format:check, lint, typecheck and production build passed. Six initial Library/editor/picker renders match the baseline markup. Memory-only browser review verified failed/successful saves, draft protection, navigation, rename/delete cancellation, CSV creation, upload retry, streaming completion, conversation creation and message retry/regeneration. No browser warnings/errors or remote writes.
