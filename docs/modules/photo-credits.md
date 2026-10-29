# Image credits

Updated: October 27, 2026.

## Product boundary

Image credits and match classifications live on `/about`. Explore cards, place dialogs, selected-place chips, Project covers and both Plan presentations omit attribution text, credit links, illustrative badges and attribution tooltips. This is the user's explicit preference of October 27, replacing the earlier inline-disclosure design. Descriptive alt text still describes the actual image; adjacent-name chip thumbnails are decorative.

The starter and standalone Explore page each have one low-emphasis About footer link. Embedded Explore does not add a duplicate footer. The source page has a return link, a short explanation of related imagery and one row per photographed catalog place. Each row includes a thumbnail, place/city, related-image classification where applicable, photographer, provider and original source link.

## Ownership and loading

`app/about/page.tsx` calls the existing canonical catalog reader with the same five-minute cache policy as standalone Explore. It renders `PhotoCredits` from `lib/photo-credits/index.ts`. `view.tsx` owns the page and shared footer, and `credits.css` owns their scoped styles. No new backend service, migration, duplicate manifest or client fetch is needed. The page loads independently of chat and Plan data. Adding or changing catalog photo metadata automatically changes its credits after cache refresh.

Supabase `place_photos` remains authoritative for photographer, provider, source URL and match metadata, with the existing seed fallback before catalog setup. Do not delete these fields or rewrite illustrative imagery as verified place photography. Metadata belongs on the credits page, not the main task interface.

## Validation

Check all 103 catalog entries appear with their source links, primary browsing has no photo overlays or credit rows, details still open and selections still work, and the source list fits at 390px. Existing catalog tests verify source metadata; this change only moves its presentation.
