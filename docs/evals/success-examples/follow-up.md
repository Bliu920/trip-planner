# Follow-up success examples

Use [shared setup and judging](README.md). Start from an independent copy of Rome base unless a case overrides it. A traveller-facing reply is an example, not an exact-match oracle. All unmentioned saved facts, stable IDs and source timestamps remain unchanged except genuinely necessary dependent updates.

## F01. Lighten one day

- Prompt: “Day two feels too busy. Keep the gallery but make the afternoon more relaxed.”
- Expected saved result: Keep Borghese Gallery and its identity. Reduce or reschedule optional afternoon sightseeing and make rest or free time explicit. Reconcile affected costs and days; preserve day one, day three, stay and unrelated costs.
- Example reply: “I saved a lighter second day, kept the gallery and made room to rest in the afternoon. I updated any affected costs.”
- Tool expectations: Inspect supplied or read day-two content and linked costs; use targeted `editPlan`, `editBudget` if costs change, and receipt-backed `commit`.

## F02. Move one optional visit

- Setup: On day three, there is a feasible afternoon slot after accounting for travel and opening uncertainty.
- Prompt: “Move the Pantheon from day two to day three, please.”
- Expected saved result: The same Pantheon item moves once to a feasible day-three slot, with relevant local travel adjusted. Its existing source and identity remain, as do unrelated items. Recheck day-two completeness and any applicable hours; reconcile only affected costs.
- Example reply: “I moved the Pantheon to day three and adjusted the surrounding travel. Please check the opening time before visiting.”
- Tool expectations: `editPlan` movement and dependent changes; reuse existing price evidence if still applicable; `commit`.

## F03. Replace an optional activity

- Prompt: “I'd rather visit a park than the Trevi Fountain on day two.”
- Expected saved result: Replace or unschedule the optional Trevi visit with a suitable catalog-backed park, such as Borghese Park if supported by the record and feasible. Avoid adding a fictional venue; update route and any affected costs, preserve other activities.
- Example reply: “I saved a park visit in place of the Trevi Fountain and adjusted the second day's route.”
- Tool expectations: Search and read the actual park record, targeted Plan edit and Budget reconciliation if needed.

## F04. Add a named catalog place

- Prompt: “Can you add the Roman Forum near our Colosseum visit?”
- Expected saved result: Use `place_004` for the Forum, fit its full catalog duration and the actual day around the Colosseum without overlapping commitments. Check whether admission is bundled before adding any cost; unknown is not automatically free.
- Example reply: “I added the Roman Forum near the Colosseum and adjusted the day. Ticket coverage and availability should be checked before booking.”
- Tool expectations: `readPlaces` for the selected Forum, `editPlan`, relevant admission research and Budget changes, then `commit`.

## F05. Remove an optional place

- Prompt: “Remove the Trevi Fountain visit. Keep the rest of the trip as it is.”
- Expected saved result: The Trevi item is removed or unscheduled as appropriate to its references; its related link is addressed without deleting unrelated notes or costs. All remaining days and arrangements retain their identities and content except unavoidable dependency repairs.
- Example reply: “I removed the Trevi Fountain visit and kept the rest of your itinerary.”
- Tool expectations: Targeted `editPlan`; inspect affected references and `editBudget` only if needed; `commit`.

## F06. User explicitly keeps free time

- Prompt: “Leave the whole afternoon of day three free. Don't replace it with another activity.”
- Expected saved result: A clearly represented free afternoon, with no sightseeing or invented activity during it. Preserve feasible morning, meals and stay; identify any displaced activity and any resulting cost change.
- Example reply: “I saved day three with the afternoon free and removed the afternoon activity from the schedule.”
- Tool expectations: Targeted Plan edit, dependent cost check and commit; no search merely to fill the space.

## F07. Trip dates shift without bookings

- Prompt: “Move the trip to November 11 to 13, 2026.”
- Expected saved result: Three dates update together, brief retains the user's correction, and date-sensitive hours, prices and evidence applicability are revisited. A previously checked timestamp is not refreshed without a new lookup. No fabricated booking is created.
- Example reply: “I saved the trip for November 11 to 13. Some opening hours and prices still need checking for the new dates.”
- Tool expectations: Update requirements and `editPlan`; research and `editBudget` for affected costs as needed; commit related edits.

## F08. Date shift conflicts with booked event

- Setup: Borghese Gallery is user-reported booked for 2026-11-05 at 14:00 with user evidence and fixed absolute time.
- Prompt: “Move our trip to November 11 to 13.”
- Expected saved result: The existing booking retains its actual November 5 date, time and booked status, for example as an unscheduled protected item with a visible conflict. Proposed trip dates may change if they can be saved consistently; accommodation and cost consequences are surfaced. Never claim the booking was moved or cancelled. Ask for the decision needed to reconcile it.
- Example reply: “I updated the proposed trip dates, but your November 5 gallery booking remains on its original date. Would you like to keep the booking or arrange a change with the venue?”
- Tool expectations: Read protected facts, edit only authorized travel dates, preserve booking evidence and reconcile or flag dependent costs; verified commit if consistent.

## F09. Cancel a booked visit request

- Setup: Day two Borghese Gallery is user-reported booked on November 5 at 14:00, with an existing linked ticket cost.
- Prompt: “Remove the booked gallery from the itinerary. I don't want to go anymore.”
- Expected saved result: Do not delete or claim to cancel the actual booking. Retain its date, reservation and evidence, unschedule it if appropriate, and explain that cancellation must happen separately. Preserve a potentially non-refundable cost until its status is established.
- Example reply: “I took the gallery visit out of the daily schedule. Your booking still exists, so please contact the venue if you want to cancel it.”
- Tool expectations: Protected-item-aware `editPlan`; review ticket cost without silently deleting it; commit a consistent state.

## F10. New dietary constraint

- Prompt: “We are vegetarian. Please adjust our meals accordingly.”
- Expected saved result: Update sourced requirements and examine all scheduled meals. Keep demonstrably suitable meals, replace unsupported specific restaurant claims with appropriate catalog-backed choices or real web-researched restaurants with saved names, addresses and menu evidence; do not introduce generic area-only meals. Preserve sightseeing and reflect meaningful food-cost changes.
- Example reply: “I updated the meal plan for vegetarian travellers. Please confirm the menus at the meals marked for checking.”
- Tool expectations: Update Travel brief, read affected meals and evidence, use `readPlaces` or research where needed, edit dependent Plan/Budget and commit.

## F11. Increased group size

- Prompt: “Two friends are joining us, so there will be four adults. Update the estimate.”
- Expected saved result: Party size becomes four with a sourced requirement. Recalculate per-person ticket and meal quantities, preserve shared charges unless evidence requires another room or transport, and state room-capacity assumptions. The EUR 800 total limit remains a party limit, not EUR 800 per person.
- Example reply: “I updated the estimate for four adults. The room arrangement is an assumption and needs confirmation.”
- Tool expectations: Update brief and affected Budget quantities and evidence, research lodging if needed, preserve unrelated plan items, then commit.

## F12. Budget limit only

- Prompt: “Our total budget is now EUR 950 for the two of us. Keep the plan unchanged.”
- Expected saved result: Budget limit is EUR 950 for the existing party scope. No plan or cost amounts, sources or checked timestamps change solely because the limit changed. Explain estimated fit only if the whole relevant budget supports it.
- Example reply: “I saved your new EUR 950 total budget for two and kept the itinerary unchanged.”
- Tool expectations: Read current Budget and requirements as needed, update the limit and brief references with `editBudget` and appropriate document edit, commit.

## F13. Refresh prices

- Setup: A controlled research report returns new comparable prices with actual test source facts, units and retrieval time for the existing stay and meals.
- Prompt: “Refresh the hotel and meal estimates using current prices, but leave our activities alone.”
- Expected saved result: Update only affected estimates with observed facts, unit calculations, date and room assumptions. Old evidence retains its timestamp unless actually revisited. Unrelated activity entries and Plan stay unchanged.
- Example reply: “I refreshed the hotel and meal estimates. They remain estimates, and the hotel has not been booked.”
- Tool expectations: `researchWeb` obtains readable observations, `editBudget` updates specified entries, `commit` verifies the save.

## F14. Hotel change with user-provided booking

- Setup: The user supplies the hotel name and location in this message; no independent reservation system exists.
- Prompt: “We booked Hotel Example at Via Esempio 12 for both nights. Use it as our base.”
- Expected saved result: Save the user-provided specified hotel and reported booking for the two nights, with user-message provenance. Adjust routes and relevant lodging assumptions without implying the system booked it or inventing its rate. The name and address are synthetic input, not catalog recommendations.
- Example reply: “I updated the plan to use the hotel you booked for both nights. Its cost still needs confirmation if it wasn't included in your booking details.”
- Tool expectations: `editPlan` stay, requirements update and affected Budget work, using user-provided evidence; no external booking action.

## F15. Question only

- Prompt: “Why did you put the Colosseum on day one?”
- Expected saved result: No mutation or commit. Explain the actual existing schedule and relevant known reasons, distinguishing inference from explicitly recorded rationale. Do not invent a decision history.
- Example reply: “The current plan pairs the Colosseum with other Rome sights on day one. I can't tell from the saved plan whether there was another specific reason for that choice.”
- Tool expectations: Read day one if not already available; no write.

## F16. Proposal without saving

- Prompt: “What would a lighter day two look like? Just suggest options, don't change anything yet.”
- Expected saved result: Existing artifacts remain unchanged. Offer one or more feasible options, identify impact on protected activities and costs as conditional, and avoid saying anything was saved.
- Example reply: “You could keep the gallery and leave the afternoon free, or move one shorter visit to another day. I haven't changed the plan.”
- Tool expectations: Read relevant current Plan and, if necessary, Budget; no mutation or commit.

## F17. Requirements correction from earlier evidence

- Setup: A prior user message says “No churches.” The brief incorrectly says “Churches are fine.” The earlier message is retrievable.
- Prompt: “I said no churches earlier. Please fix the plan.”
- Expected saved result: Verify the original message if necessary, correct the brief and remove any unprotected church visit, repairing related schedule and costs. Preserve unrelated content; do not treat the mistaken brief as user consent.
- Example reply: “I corrected the trip preferences and removed the church visit. The rest of the plan remains in place.”
- Tool expectations: `readMessage` when the original text is not already available, update brief and affected Plan/Budget, commit.

## F18. Create a reusable document

- Prompt: “Create a packing checklist in my Library for this three-day trip. Don't change the itinerary.”
- Expected saved result: A useful editable Markdown working document with a concise packing checklist appropriate to the known trip, clearly distinguishing suggestions from known requirements. Plan and Budget stay unchanged. Do not fabricate weather or bookings.
- Example reply: “I saved a packing checklist in your Library. Your itinerary is unchanged.”
- Tool expectations: `createDocument` with a supported working kind and content, then `commit`; no Plan or Budget mutation.

## F19. Edit an existing document

- Setup: A saved working document `Packing.md` contains exactly one line `Bring one jacket.` and another line `Bring comfortable shoes.`
- Prompt: “In my packing checklist, replace ‘Bring one jacket.’ with ‘Bring a light jacket and a rain layer.’ Keep everything else.”
- Expected saved result: The single exact replacement is saved in the same document, with the shoes line and all unrelated bytes preserved. The prior version remains accessible under the existing version policy; Plan and Budget do not change.
- Example reply: “I updated the jacket item in your packing checklist and kept the rest as it was.”
- Tool expectations: Use supplied current content or `readDocument`, `editDocument` with a unique exact selector, then `commit`.

## F20. Conflicting pending request

- Setup: A previous failed turn requested removing the Colosseum and remains pending. The current saved itinerary still includes it.
- Prompt: “Keep the Colosseum, please. Just make day three less busy.”
- Expected saved result: Preserve the Colosseum and current user intent. Lighten day three without silently marking the incompatible earlier removal as handled; preserve unrelated days and handle affected costs. Ask about the conflict only if it matters beyond the clear latest correction.
- Example reply: “I kept the Colosseum and saved a less busy third day.”
- Tool expectations: Consult pending input context, targeted `editPlan` and affected Budget changes, then `commit` without falsely claiming the incompatible request was fulfilled.

## F21. Explicitly reported booking change

- Setup: Day two Borghese Gallery is user-reported booked on November 5 at 14:00. The user actually reports having changed it in the current message.
- Prompt: “I changed my gallery reservation with the venue. It is now November 5 at 16:00. Please update the plan around it.”
- Expected saved result: Update the protected appointment to the user-reported 16:00 time with current user evidence and explicit authorization. Rework surrounding activities and travel so the new window is feasible. Do not say the assistant changed the external booking or invent a confirmation.
- Example reply: “I updated the plan around the 16:00 gallery time you reported. I haven't made any changes with the venue.”
- Tool expectations: Read protected facts, pass the appropriate authorization with `editPlan`, reconcile affected items and costs, then commit.

## F22. Plan-only edit leaves budget stale

- Setup: Rome base, with a linked estimated cost for the Pantheon. The runtime permits an unchanged saved Budget to remain visibly stale after a Plan-only edit. Research is unavailable during this turn.
- Prompt: “Replace the Pantheon with a different afternoon activity. It's fine if we check the costs later.”
- Expected saved result: Choose a supported suitable alternative or a clearly stated unresolved alternative; preserve the old Budget and its evidence instead of deleting a potentially relevant cost. Show that costs need review and do not claim an updated or complete estimate. Do not stage a new Budget with dangling references.
- Example reply: “I saved the itinerary change. The budget still reflects the earlier plan and needs reviewing.”
- Tool expectations: Targeted `editPlan`; confirm unchanged Budget is visibly stale under the actual contract; final `commit`. If the edit cannot be saved consistently, report the actual blocker rather than pretending it saved.

## F23. Document-only CSV output

- Prompt: “Create a simple CSV packing checklist in my Library with columns Item and Packed. Don't alter the trip.”
- Expected saved result: A new working `.csv` document has a valid header and useful rows, with the requested two columns. Values are suggestions and no weather or reservation fact is invented. Plan, Budget and existing documents remain unchanged.
- Example reply: “I saved a CSV packing checklist in your Library. Your itinerary and budget are unchanged.”
- Tool expectations: `createDocument` in the supported CSV format, preserve raw text and `commit`; do not require a spreadsheet engine or create a Markdown file under a CSV name.

## F24. Unsupported user-entered price

- Setup: The existing stay has an estimated nightly cost with synthetic comparable evidence. The user supplies no receipt or confirmation for the new number and research returns no relevant corroboration.
- Prompt: “Change the hotel price to EUR 30 a night.”
- Expected saved result: Record the user's requested amount as a request or assumption, not as an independently verified quote. Do not attach unrelated old evidence to it or mark it confirmed. If no appropriate evidence supports an amount, retain an explicit unknown and disclose the gap rather than fabricating a price; preserve any valid unrelated entries.
- Example reply: “I noted your requested hotel price, but I couldn't verify it. The hotel cost still needs confirmation.”
- Tool expectations: Examine current evidence, research if available, make only a supported `editBudget` with applicable gap handling, and report the actual final save state.
