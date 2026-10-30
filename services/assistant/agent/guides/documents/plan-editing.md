# Create and edit an itinerary

## Work in small batches

createPlan initializes the date and three day IDs/titles. editPlan adds and changes arrangements with the same simple commands. Build one day's coherent schedule at a time, up to twelve commands per batch. Correct the rejected batch without resending accepted days. Read the effective day/items when their current content is not supplied.

addActivity supplies id, dayId, title, kind, local startTime and a durationMinutes/durationRange or endTime. Catalog durations can be reused. Use placeId for supplied places; for researched meals use venue {name,address,city,sourceId}. Reuse another arrangement's location through locationItemId. The host constructs internal timing and evidence fields. Do not construct Basis, TimePoint or full Plan objects.

Timed additions are inserted in local-clock order unless afterItemId explicitly selects placement. A startTime correction also updates the activity's position within its day.

updateActivity changes only named fields. For example, changes {startTime:"12:30"} keeps the existing duration, venue and evidence. Explicit null clears a supported value; omitted fields stay unchanged. Use changes {kind:"meal"} to correct an uncommitted activity classification, or replaceActivity for a complete corrected activity. moveItem selects a day and optional afterItemId: omitted appends, null prepends. Moving does not automatically change the clock time. Reconcile the affected day's connections and costs.

## Concrete places and sources

Named attractions come from supplied places. Prefer suitable supplied restaurants/cafes; supplement with real researched restaurants when needed. Source handles come from research results and the environment. A retrieved link supports only the facts actually found there; it does not confirm a booking or availability.

New meal venues need a real name, street address, city and retrieved identity evidence. Reuse existing locations and their original evidence without refreshing timestamps. Generic meals such as "lunch near the base" are not completed recommendations. Explicit user-arranged or included meals may use userLocation or includedInStayId, backed by the user's actual statement. An included hotel breakfast is not another paid restaurant meal.

For userLocation, copy the exact location wording from the user's message; supply userLocationMessageId when citing an earlier message. For includedInStayId, the source user message must name the property and explicitly confirm the included meal; a researched hotel alone is not user confirmation. The host checks location wording against the actual message, not an agent-authored brief or research note. Naming a location does not make it booked, fixed or mandatory. Use area for your own proposed neighborhoods and walking/free-time windows (kind free_time), not userLocation. A user naming a city does not establish that they selected your streets or walking route. Preserve existing location evidence when an edit changes only the time or title.

When research corrects a selected place's hours, closures or access restrictions, update that Plan item's reason and affected timing/reminders before saving. Cite the correction in Research notes when useful; recording it there alone does not correct the itinerary. For example, if the official venue closes earlier, revise a late visit to fit before closing. Do not generate booking reminders from catalog flags; the app displays those facts in activity details. If evidence already obtained contradicts an existing agent-written booking instruction, remove that stale instruction without starting additional booking research. Keep the original catalog record and any real user booking intact. If evidence remains conflicting, describe the specific uncertainty rather than asserting both versions. At final review, compare the affected Plan instructions with the research used for this change; no fresh search is needed when the evidence is already available.

## Timetable, travel and lodging

Save concrete local times and bounded windows. Prefer startTime plus durationMinutes or durationRange; endTime is an alternative, not a third independently maintained value. Catalog durations retain their evidence. Missing durations require an explicit realistic proposal. Read plan-quality for complete days, nearby supporting activities, meals, breaks and pacing. Respect explicit empty periods and one-activity requests. For a requested free window, check the full interval of every affected arrangement, using the upper duration estimate; an activity that starts before the window but ends inside it still conflicts. Leave realistic movement time between the remaining stops.

addTravel/updateTravel describe from/to, mode and a timed interval, arrival or departure. Meaningful city transfers need actual door-to-door time and service research; a road route does not verify a train or ferry. Implicit movements are checked even without separate travel items. Route failures remain unverified.

addStay/updateStay use a researched hotel, userLocation or explicitly provisional area, plus afterDayIds. The host maintains compatible overnight boundaries. Preserve user-provided arrival/departure locations. Keep lodging outside daily activity sequences. Read routes-and-stays when resolving route or property questions.

## User commitments

setCommitment is only for explicit user bookings, kept arrangements and fixed clock times. It uses the current user input or the specified real messageId. Ordinary agent-selected stops and proposed hotels are not booked or fixed. Preserve unrelated commitments. Changing protected facts requires explicit current user authorization, not a desire to silence validation.

## Review and save

inspectChanges returns current blockers, coverage findings and honest save status. A rejected change leaves the prior accepted candidate available but does not fulfill that requested change. Correct the specific issue; unrelated title edits do not resolve invalid timing.

Use upsertReminder only for necessary traveller-facing caveats, linked to affected items. Research notes and Planning decisions in Library hold useful reusable evidence and material choices. They do not duplicate the schedule, costs or private reasoning. Follow planning-documents when creating/updating them.

Budget owns prices and quantities. Reconcile affected fees, meals, nights and transport with editBudget. Removing an item does not cancel a booking or automatically delete its costs. Repeating an already accepted deletion is harmless; an unknown target ID still needs correction. Repair dangling links before publication. Review the final Plan and Budget together, then commit once. Only the verified receipt confirms saving; a saved Travel brief is preliminary progress.
