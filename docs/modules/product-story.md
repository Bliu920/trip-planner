# Product story

Updated October 29, 2026.

## Purpose and ownership

`/about` explains the product and engineering decisions behind 3 Days in Italy for assessment reviewers. It is an English first-person narrative, with explicit prototype limitations and AI-use disclosure. The existing start and Explore footers already link to About. Original photography attribution remains at `/credits`, using the existing photo-credit module.

`lib/product-story/index.tsx` owns the public page composition, `chapters.tsx` owns the narrative, `reading.tsx` owns chapter tracking, architecture tabs and screenshot dialogs, and `story.css` owns their responsive presentation. No runtime agent or trip behavior changes.

The architecture separates application guides from Library evidence and decisions, identifies authoritative Plan/Budget/brief ownership, describes targeted staging and receipt-backed saves, and distinguishes deterministic validation from travel quality. Keep these claims aligned with the maintained Agent, Plan, Budget and Guides documentation as the product changes. The page is a blog-style explanation, not a certified two-page print submission.

## Screenshot provenance

`public/product-story/` contains four JPEG captures of the actual production UI components. Plan and Day use the existing `tests/fixtures/plan/fixtures.ts` Florence data through a temporary preview route removed after capture. Library uses an isolated in-memory PGlite database and illustrative notes, with provider calls blocked. Explore uses the actual start page and supplied places. These screenshots contain no actual trip access codes or credentials. Captions identify the itinerary and working notes as illustrative, not verified arrangements or live research. Current photo credits still apply to the imagery visible inside the captures.

The ignored local capture adapter is `.local/product-story-fixture.ts`. It is verification infrastructure, not a deployed service. Do not ship temporary screenshot routes.

## Interaction and limits

Desktop has sticky section links and reading progress. Narrow layouts use a labelled section select. Architecture tabs use the shared Base UI keyboard behavior. Screenshots open through the shared dialog primitive with a close action, Escape dismissal and focus restoration. Chapter links and selection update the URL hash. Core narrative and native anchors remain server-rendered.

The UI reuses the global page canvas and existing focus policy, with Georgia for reading and system sans for navigation. Screenshot dimensions reserve their correct aspect ratios. Source links cite the saved planning research; those studies inform the design and do not validate this product's travel outcomes. No booking, optimal-route, production-readiness or full evaluation-suite claims are made.

## Verification

Local browser review at actual 1200px desktop and 390px mobile widths confirmed no horizontal overflow, loaded images, chapter/hash navigation, mobile selection, architecture mouse/keyboard interaction, screenshot enlargement and dismissal, and focus restoration. The credits route renders the existing attribution list. Final `npm run lint` and `npm run typecheck` passed. No backend changes, paid model calls or deployed verification are claimed. The detailed task record is retained locally.

## Guide iteration narrative

October 29, 2026: the guide section now explains how reviewed planning attempts and test results can become maintained rules, worked examples or specialised guides, retrieved in the relevant context and evaluated against motivating cases. This describes a developer-led improvement mechanism, not automatic learning or a guaranteed performance increase. The production scope paragraph also names account-free access as a deliberate choice while retaining the link's read/edit implications. Only explanatory copy changed. Follow-up verification is recorded in the locally retained guide-iteration task.
