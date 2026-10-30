# Shared dropdowns

Implemented and verified locally on October 30, 2026.

## Ownership

The configured shadcn style is base-nova. These adapters follow the official [Base UI Select](https://ui.shadcn.com/docs/components/base/select) and [Dropdown Menu](https://ui.shadcn.com/docs/components/base/dropdown-menu) compositions using the already installed Base UI dependency. Verified against the official shadcn source and installed declarations on October 30, 2026. No dependency or lockfile change.

| File | Responsibility |
| --- | --- |
| components/ui/select.tsx | Select, trigger, value, portal/content, item and controlled SelectField composition |
| components/ui/dropdown-menu.tsx | Action menus, nested menus, radio choices, separators and portaled positioning |
| components/ui/dropdown.css | Common surfaces, selected/check states, ring-free focus, mobile sizing and short motion |

The adapters follow the existing single-file UI component convention under the small-module exception. They are small, stable composition wrappers; feature state, validation and persistence remain in their original modules. SelectField accepts an explicit value, option list and change handler. Options map stored values to consumer labels, including empty-string defaults. No synthetic DOM change events or duplicated saved state are introduced.

## Inventory

Fourteen static entry-point types were migrated: eleven selection fields and three menus. Dynamic budget rows and conversation options reuse those types and do not count as additional implementations.

| Surface | Entry | Component | Consumer file |
| --- | --- | --- | --- |
| Workspace chat | Conversation history | SelectField | lib/workspace/chat.tsx |
| Standalone Explore | City | SelectField | lib/explore/controls.tsx |
| Standalone Explore | Place type | SelectField | lib/explore/controls.tsx |
| Starter Explore | Filter places, with City and Place type submenus | DropdownMenu | lib/explore/filters.tsx |
| Budget editor | Estimate covers | SelectField | lib/budget/ui/components.tsx |
| Budget editor | Cost category | SelectField | lib/budget/ui/components.tsx |
| Budget editor | Price status | SelectField | lib/budget/ui/components.tsx |
| Add-to-day dialog | Filter by city | SelectField | lib/plan/canvas/controls.tsx |
| Activity editor | Part of day | SelectField | lib/plan/canvas/controls.tsx |
| Activity editor | Move to day | SelectField | lib/plan/canvas/view.tsx |
| Library editor | File format | SelectField | lib/documents/editor.tsx |
| Library file | Rename, Reload and Delete actions | DropdownMenu | lib/documents/controls.tsx |
| Chat composer | Upload files and Choose from Library | DropdownMenu | lib/attachments/picker.tsx |
| About, mobile | Jump to a section | SelectField | lib/product-story/reading.tsx |

## Interaction and styling

Option fields use listbox/combobox semantics. Action menus and filter submenus use menu/radio semantics. Base UI owns keyboard navigation, typeahead, outside dismissal, Escape, focus restoration and collision handling. All surfaces portal out of clipped containers and sit above the shared dialogs. Selected choices use check marks; keyboard position uses a neutral fill. Triggers, items and popups do not acquire focus outlines or rings. Existing global focus policy remains in force. Disabled fields/options and unsaved-file guards remain effective.

The shared popup uses a white surface, fine neutral border, 10px radius, restrained shadow and optional 100ms entry/exit. Popups respect available height and screen gutters; long choice lists scroll. Mobile controls and rows have at least 44px hit areas. Filter submenu selection updates immediately without closing the list; Escape returns to the parent. A mobile-only Back to filters row provides the same return action for touch use. Reopening starts at the parent menu. Motion is disabled by reduced-motion preferences.

The document toolbar lets the filename shrink while bounding the format control to 45% of the row. Budget field selectors keep input styles separate from attribute selectors so CSS specificity does not enlarge checkboxes. Native date/time inputs remain date/time controls; inline disclosures and tabs remain their original interaction types.

## Verification

`tests/dropdown.test.ts` rejects native select/option tags and direct Base UI menu/select/popover imports in application code, keeping future dropdowns on the shared boundary. Actual client-render tests cover labels rather than raw values, empty choices, disabled triggers, and real Explore/Budget/editor/activity consumers.

Thirty-five focused tests passed across dropdown rendering, Library inline rendering, budget presentation, response composition, Plan presentation, attachments and document clients. Lint and typecheck passed. Browser review covered actual Explore and About plus an isolated fixture using real consumers: keyboard selection, outside dismissal, checked states, long lists, submenu reset/back, dialog portals, timing/day selection, file extension updates, budget scope/category/unknown-price submission and attachment-to-Library focus restoration. Unsaved file edits still disable rename/delete. Computed outlines and focus shadows were none. At 390px, popups remained inside screen gutters, rows were 44px and the page had no horizontal overflow. No browser warnings/errors, real trip writes or paid model calls. The temporary route was removed after review; viewport overrides were reset. Explore screenshot: `/private/tmp/shared-dropdowns.png`.

Update this guide through the shared [maintenance contract](README.md#maintenance-contract).

## About navigation update

October 30, 2026: the About landing page now has four anchor links at all screen sizes, replacing its article section select. Removed that retired dropdown consumer from the rendering fixture. Shared controls and the remaining consumer checks are unchanged.
