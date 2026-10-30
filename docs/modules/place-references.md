# Place references

Status: implemented, tested and migration applied to Supabase. Updated October 26, 2026.

## Purpose

Users select interesting catalog places in the starter Explore tab, then describe how to combine them in ordinary text. Each place appears as a removable thumbnail/name chip above the text area. Selection expresses interest, not a required visit, reservation, scheduled PlanItem or permanent favorite.

## Ownership and boundaries

| Information | Owner and storage | Loading boundary |
| --- | --- | --- |
| Place facts and cover photo | Existing catalog, keyed by Place ID | Existing catalog API and server loader |
| Draft selections | `PlaceSelection` provider around the starter; ordered React state | Independent of search/filter/tab state |
| User instructions | Existing textarea and message text | Existing composer lifecycle |
| Starter handoff | Public place IDs in the existing start URL, alongside file IDs | Resolved before the first chat send; URL removed after persistence is confirmed |
| Saved selections | `messages.parts`, one `data-place` part containing `{ id }` per selected place | Existing conversation snapshot |
| Display labels and images | Derived from current catalog, never trusted from request data | Server snapshot hydration, client draft catalog objects |
| Agent reference context | Derived from persisted IDs and the supplied source catalog | Existing saved-message context assembly, including retries |

The brief remains plain text. References never get serialized into its editable contents. The URL only carries public catalog IDs, not titles, images or complete place facts. There is no extra favorites table, duplicated place database, or new global selection store. Before first send, the handoff URL is the pending selection owner; after send, the persisted message is authoritative. Reloading a fresh handoff reconstructs selections; reloading a saved chat reads message parts. An unsent starter draft does not survive a full page reload, matching the existing text draft.

## Module composition

- `lib/place-references/model.ts`: reference contract, ID parsing, selection reducer and catalog resolution.
- `lib/place-references/view.tsx`: provider, add/remove toggle, chips, expansion and detail loading.
- `lib/place-references/references.css`: scoped controls and responsive chip styling.
- `lib/place-references/index.ts`: public frontend API.
- `services/places/place-references/index.ts`: bounded server adapter for ID validation, snapshot hydration and model context. This uses the small-module exception because the complete adapter is under 80 lines.

Explore owns the full place detail dialog. It accepts optional actions, allowing this module to reuse details without duplicating them. Explore passes the module's toggle into its card and dialog. The standalone Explore page remains read-only when no message draft provider is present. Workspace messages reuse the same chips with removal disabled by omission, because sent messages are historical input.

## Interaction lifecycle

The card body opens details; the separate plus button adds the place. Plus becomes a check, with pressed state and an accessible action name. Clicking it again removes the selection. The detail button and chip remove button use the same state. IDs are unique and retain selection order. Draft selections persist across tab changes and filters. Controls lock during trip creation/upload handoff, while opening details remains available.

Chips show a thumbnail, truncated name and remove action. Full name/city are available through title and accessible labels; clicking opens the canonical detail view. Thumbnail images are decorative beside the place name, with a map-pin fallback if an image fails. Attribution and image classification live on the separate [Image credits page](photo-credits.md). Up to four chips show directly. More than four collapses to three chips plus a count toggle; expanding reveals every selection. This keeps small screens compact without losing inspect/remove access.

Selecting places alone enables send. The starter supplies a short ordinary planning request when no text is entered. Files and places can coexist. The request transports only place IDs; client-supplied names, images or extra metadata are ignored. Draft state survives creation or upload failure. A failed initial catalog handoff offers retry and retains its URL. Once the request is accepted locally, the existing pending-message mechanism retains the structured parts across network failures and resends. Saved turns retain references when a reply fails or is regenerated.

## Persistence and validation

`20261026172536_place_references.sql` adds only `chat_begin_turn_places`, a service-role-only wrapper around the existing atomic turn function. It validates distinct IDs against `public.places`, calls existing access/concurrency/document handling, appends ID-only message parts in the same transaction, and includes historical `placeIds` in the returned model-history projection. Errors roll back the entire turn. Existing snapshot and planning-source functions already read message parts and need no schema change.

The original turn RPC stays available. Application turns use the new wrapper so ordinary messages and retries retain historical place references. The wrapper rejects null IDs, duplicates, unknown places, more than 103 selections and replacement references during reply retry. The existing 40,000-character conversation budget includes stored reference parts. Browser roles cannot execute the wrapper; existing table access and RLS remain unchanged.

Server request validation rejects malformed/unknown IDs before provider access. Canonical place facts come from the supplied Italy catalog, also used by the planner's catalog tools. Photo enrichment is display-only. The model receives explicit guidance that references express interest, that accompanying text sets priorities, and that time/geographic conflicts must be addressed rather than forcing every selected place into the plan. Reference descriptions remain untrusted source material.

## Verification

The migration was applied through the Supabase SQL editor on October 26, 2026. Live transactional verification confirmed ID-only message persistence, ordered model-history references and denied browser-role execution. The verification transaction rolled back all temporary data. No test project remains.

Lint, typecheck, all 125 tests and production build pass. New tests cover unique toggling, invalid IDs, place-only messages, atomic persistence, history/retry preservation, cross-trip isolation, role access, canonical hydration and provider context from saved IDs. Provider integration uses a deterministic mock; this task did not spend tokens on a live model generation. Browser checks cover card/detail addition, chip inspection, expansion, removal synchronization, tab retention, place-only send enablement and 390px layout without horizontal overflow.

Parent: [Explore catalog](explore.md). Integration: [Agent](agent.md). Screenshots: `/private/tmp/place-references-desktop.png` and `/private/tmp/place-references-mobile.png`.

## Explore control presentation

Updated October 28, 2026: the image-corner toggle has a 28px visible circle inside a 44px hit target. It remains visible on touch screens and turns green with a check when selected. The detail dialog places this same plus/check control in its persistent top header beside Close. The detail variant changes placement only, keeping the same symbol, selected color and 44px hit target. Accessible labels and native tooltips explain Add to message and Remove from message; selection state remains shared with the card and composer. Card opening and selection remain separate controls, with unchanged selection/context behavior.
