# Research notes and planning decisions

## Ownership and creation

Use the existing Library tools for two independently readable Markdown documents. Both start absent. Create a document only when there is useful material to preserve, not an empty template or a transcript of tool calls. Neither document is required for a simple trip. A document-only request does not require changing the itinerary.

- Research notes.md, kind research: external evidence worth reusing. Organize by question or place. For each useful finding record what was found, the direct source URL, actual checked date, applicable dates or conditions, and missing or conflicting evidence. Distinguish observed facts from estimates. Pending external checks belong here.
- Planning decisions.md, kind working: material choices behind the current proposal. Record the choice, its brief rationale, the requirement or evidence it addresses, significant tradeoffs, and useful alternatives with the condition for reconsidering them. Refer to the affected days or arrangements. Keep current decisions rather than an accumulating work diary.

Travel brief owns user requirements, personal unknowns and questions for the user. Plan owns the selected schedule, locations, overnight coverage and traveller-facing caveats. Budget owns costs and totals. These supporting documents explain evidence and decisions; they do not maintain another itinerary, budget or requirements list. Agent-authored notes are neither user confirmation nor independent verification of their cited facts. Preserve the original evidence when citing facts in Plan or Budget. Do not record private reasoning.

## Discover and read

Inspect the Library document manifest supplied in workspace context. These filenames are creation defaults, not hard-coded identities. Reuse an existing equivalent document after reading it; identify it by its returned ID on later operations, including after a rename. Kind alone does not establish purpose, and an unrelated working or research file must not be overwritten. If multiple files appear relevant, read the applicable ones rather than silently merging or deleting them.

Before changing venues, service hours, transport or prices, read relevant existing Research notes. Before changing city combinations, the overnight base, pace or route, read relevant existing Planning decisions. Read both when a change affects evidence and the route decision. Do not load every file for an unrelated edit. Use effective content for accepted unsaved work; use saved versions for historical evidence. A filename or file listing is not proof that its content has been read.

## Update with the affected change

Create with createDocument and update the same document with editDocument. Read the existing content first, preserve unrelated sections, and use exact unique selections or a justified full replacement. Update supporting records in the same final commit as dependent Plan and Budget changes. Refresh research only when relevant evidence is missing, stale or no longer applicable. A reused finding keeps its original checked date; a new date requires a new lookup.

After a route or venue change, update the affected decision and reconsider alternatives that depended on it. Replace or clearly mark superseded conclusions so future edits cannot mistake them for the current proposal. Resolve external checks when evidence arrives; keep unanswered personal questions in Travel brief. If a needed file is unavailable, re-establish relevant facts and state uncertainty rather than claiming it was read.

Apply actionable research corrections to the affected Plan items in the same commit, following plan-editing. Research notes must not say "walk-in only" while the Plan still asks the traveller to reserve. Update the conflicting reason/reminder or schedule, preserving actual user bookings and unrelated arrangements.

## Checks and visible reminders

Recompute planning checks against the current Plan; do not persist a raw validation report as a working document. Repair actionable errors before saving. Preserve genuinely unresolved external questions in Research notes and route tradeoffs in Planning decisions. A saved file does not make an invalid itinerary valid.

Keep necessary traveller actions, conflicts and uncertainties in Plan notes linked to the affected item IDs, so the affected day and activity can show them. Use an unlinked note only for a genuinely trip-wide reminder. Mark provisional dates in the structured date basis. Background research, comparison prose and planning rationale belong in these Library documents, not Plan notes. Represent actual lodging as stays with night coverage. Optional candidate ideas belong in the supporting documents; existing user arrangements and bookings must remain in Plan, including those still needing a day or night assignment. Never delete a booking to tidy the display.

During first planning, prioritize a usable itinerary and priced budget. Capture useful evidence concisely as you go, but do not let optional documentation displace the final save. After publication, mention a useful supporting document briefly when relevant; the Library already provides access.
