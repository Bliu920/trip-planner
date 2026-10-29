# Plan and supporting context

## Interpret requirements

Read trip-details when creating or changing travel requirements. It owns field-specific missing-information behavior and Travel brief organization. Read the existing supportingContext and relevant input evidence before editing. Update the same brief when requirements change; preserve unrelated facts. A selection of stops does not itself preserve the user's underlying interests or constraints.

## Edit the itinerary

Use three stable day IDs and stable item IDs. Days reference activity/travel items; stays live outside the daily sequence with coverage. Unscheduled items remain in items. Distinguish user keep, optional, and reservation state. Booking is a reported user fact, not an action you can perform. Removing an item from the itinerary never cancels a booking.

Preserve booked items and fixed absolute times; moving trip dates does not move bookings. Preserve facts not targeted by this input. authorizedItemIds is only for items the CURRENT user explicitly authorized changing, not a way around validation. Do not use it to resolve conflicts silently. Keep stable IDs across revisions.

Sources must be real user message IDs, available documents with their actual content revision, catalog IDs, or retrieved web evidence. Agent-generated documents are not user confirmation. Historical references are not proof that files remain accessible.

## Itinerary quality

Read plan-quality before creating or revising an itinerary. It owns the complete-day standard, nearby supporting activities, meals, travel, overnight coverage, pacing and exceptions. Check the affected days and their connections after an edit. At least one suitable catalog-backed activity per day is a source-coverage minimum, not the target number of arrangements or proof of a complete day. An agent-selected anchor is not a user must-go.

Check this coverage when creating or revising days. Respect explicit rest-only requests and genuine arrival/departure, accessibility or availability constraints. If no suitable catalog activity fits, explain the exception in the plan rather than inventing a venue or forcing an unsuitable stop. Never add an activity just to obtain a cover image.

## Save related changes

saveBrief checkpoints requirements before staging dependent changes. For later document changes, editDocument only stages; commit publishes them with the plan and budget. saveBrief also stages a brief update when other work is already staged; respect the returned effect and continue to commit. Use the existing planning_context document ID, or newContextDocumentId if none exists. Research and working documents are optional reusable outputs. Do not record private reasoning; write concise evidence, decisions and open questions.

Budget owns prices, quantities, spending ceilings, price evidence and calculated totals. Do not save another budget in plan notes or supporting context. Link budget entries to stable plan item IDs when applicable. Read budget-editing when changes affect nights, travelers, dates, paid activities, transport or meals. Reconcile affected entries before committing if possible; otherwise leave the budget unreviewed and explain the gap. A plan edit must not silently remove priced or user-recorded arrangements.

## Targeted editing

Use readPlan/readBudget for current effective content when it is not already supplied. editPlan changes specific days, items, notes or dates atomically. Preserve unrelated arrangements and source evidence. Repair note/location references explicitly in the same batch. Coordinate affected costs with editBudget and review against the resulting Plan. createDocument creates reusable Markdown, TXT or CSV outputs; editDocument supports exact unique replaceText, replaceContent and rename. Every mutation uses the latest editToken. Rejected edits leave the accepted draft readable but must be corrected before final save. inspectChanges checks actual differences and save status; commit publishes all accepted changes once.


When citing accepted unsaved document text, use its explicitly returned proposedContentRevision and label it as draft evidence. A later text change requires revalidating dependent Plan/Budget content. Final publication checks the actual prepared version. An agent-authored research file preserves external evidence; it does not create user confirmation or independently verified price facts.
