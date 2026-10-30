# Product story

Updated October 30, 2026.

## Purpose and ownership

`/about` introduces 3 Days in Italy as a product. The hero is “AI travel planner”, followed by a full static Plan and Chat workspace. Alternating visual/text sections explain discovery, the daily itinerary and budget, and Library. Design rationale supports the feature narrative. Agent architecture, guide iteration and research references sit in optional disclosures, followed by scope and AI-use notes. This web explanation is not a verified two-page submission note.

`lib/product-story/index.tsx` composes the page. `chapters.tsx` owns feature sections and disclosures. `reading.tsx` owns sticky anchor navigation and the optional architecture tabs. `story.css` owns the landing layout. Start Page navigation links to About, and original photography attribution remains at `/credits`.

## Static workspace

`lib/product-demo/index.ts` composes the full hero workspace and exports shared example data. `data.ts` owns fixed illustrative arrangements/costs and existing catalog photo selections. `workspace.tsx` composes production `DayCard` and `TripSummary` components with static Chat. `demo.css` scopes the workspace layout. The workspace is inert and described as an image; mobile scales both panels together.

## Feature previews

`lib/product-preview/index.tsx` exposes DiscoveryPreview, TripPreview and LibraryPreview, and owns presentation-only day/budget tabs. `visuals.tsx` composes static UI with production PromptInput, PlaceChips, PlaceCard, ExploreControls, DayCard, StopDetails, DayMap and BudgetDetails components. `data.ts` owns catalog-backed examples and the derived sample budget. `previews.css` scopes preview framing and responsive behavior. Discovery follows the actual Start Page hierarchy: prompt first, Explore/Projects navigation and compact controls second, then the original card grid with image-corner toggles and ratings. Its desktop canvas scales the source UI rather than restyling the cards. The budget is a derived view of the same sample cost data used in the hero. It contains illustrative estimates without researched sources and must never be saved as a real budget.

The embedded UI is inert and exposed as described illustrations. Only the external preview tabs change what the landing page shows. No trip loading/saving or AI requests are involved. The daily preview uses the actual DayMap with fixed catalog coordinates, selected Uffizi activity and no researched route geometry. OpenStreetMap tiles load in the browser, as in the real product. Photographs use the existing catalog Pexels URLs, so the image host and map tile host remain dependencies. Named places come from `data/italy.json`; schedules, costs, chat, preferences and files are examples. Do not substitute live workspace or provider components, which own network operations.

Desktop sections alternate visual/text placement. Tablet and mobile layouts place copy before each visual. On mobile, discovery scales a mobile Start Page with the first example card, the day keeps its timeline and map, the budget uses a two-column table and Library stacks its files and document. Preview panels reserve space to prevent vertical jumps when switching. Keyboard arrows move tab focus; Enter activates the selected view. No automatic animation is introduced.

## Captures and verification

The rendered landing page no longer embeds screenshots. The previous `public/product-story/*.jpg` assets remain on disk but are not page dependencies. Existing photographer credits still apply to all catalog imagery.

The [product landing task](../tasks/main-about-demo/004-product-landing.md) records current checks. The focused render check covers the hero and all four feature visuals, including inert markup and absence of backend/map requests during rendering. Browser checks cover desktop/mobile layout, image loading, preview switching and the optional explanation. No paid model calls, real trip edits or deployed verification are claimed.
