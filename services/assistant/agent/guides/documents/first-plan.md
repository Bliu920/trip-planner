# First plan

## Expected output

Apply this workflow to itinerary requests. A document-only task or explicit discussion request does not require creating an itinerary or budget.

Produce both an itinerary and a budget in this first turn, supported by a saved Travel brief, and save the complete draft. The itinerary covers three days in Italy and meets plan-quality: complete daily arrangements with supporting activities, meals, meaningful travel and overnight coverage, not just one place per day. A recommendation in chat, a saved brief, or a clarification question alone does not fulfill the initial planning request.

## Finish the draft before asking questions

For an initial travel request, complete the first draft before asking follow-up questions. This also applies to brief or incomplete input and requests phrased as "What would you suggest?" or "What do you recommend?" Treat these as requests to create a plan, not as question-only conversations. Do not ask permission to start, ask the user to choose a city first, or end the turn after saving only their preferences.

Use the trip-details defaults, explicit provisional choices and visible unknowns to keep planning. Missing dates, group size, budget, preferred cities or conflicting preferences do not require an answer before producing the draft. An unknown spending limit does not prevent a budget estimate; unavailable exact prices require research-informed ranges and explicit assumptions under budget-research.

When the full request is infeasible, make and save the closest feasible proposal within the supported three-day Italy scope. Use plan-quality to compare plausible routes and balance the stated destination, pace and travel-time preferences. Do not automatically turn a multi-city request into a single-base plan. Preserve the original request in the brief, label the compromise as your proposal, and explain which wishes the draft defers or cannot satisfy. Do not pretend it fulfills every constraint, override explicit prohibitions, move fixed bookings or invent feasible transfers. Ask the user to confirm or revise the tradeoff only after saving.

Honor an explicit instruction to stop, pause, ask questions first or discuss options without creating a plan. Otherwise, work through validation and recoverable tool errors to the final commit. If a real execution failure prevents saving, report the actual unsaved state and blocker; never present a brief checkpoint as a completed plan.

## Step 1: Understand and save the input

Follow trip-details for the fields to collect, missing-information defaults, evidence distinctions and Travel brief structure. Read the supplied workspace, current input and relevant attachments. Save or update the brief using saveBrief before researching places or staging other artifacts. This checkpoint preserves the requirements if later planning fails; it is not a completed plan.

Read plan-editing and budget-research before proposing those artifacts. Apply planning-documents when preserving reusable research or material route decisions; discover and read relevant existing supporting files before relying on them. Use the brief throughout the workflow to check decisions, revisiting earlier steps when evidence changes feasibility.

## Step 2: Explore cities and core activities

Use describeCatalog to discover available cities, activity types, tags and price tiers. Use searchPlaces with filters derived from the brief to compare suitable city combinations and their available activities. A city count describes dataset coverage, not quality. Do not interpret no matching records as proof that a city has no suitable activities. Relax optional filters explicitly; do not discard hard user constraints.

Read full candidate records with readPlaces. Select user must-go places first, then suggest other core activities that fit their preferences. Check opening/seasonal information, date compatibility, constraints, likely duration, transport feasibility and indicative price tier. Research external facts where needed. Missing hours are unknown. Keep unresolved scheduling checks visible. Booking requirements are displayed by the app and do not add a research or reminder task.

## Step 3: Build the daily itinerary

If no effective Plan exists, call createPlan with the start date and three day IDs/titles only. Use editPlan addStay for lodging and addActivity commands for each day's stops, real meals and breaks, usually 4 to 8 arrangements unless the user's constraints call for fewer. Supply a place ID or researched venue/sourceId, local startTime and realistic duration; the host builds the internal objects. Keep stable IDs. The same editPlan commands support later corrections and user commitments. Correct a rejected batch without resending accepted days.

Apply plan-quality to every available day, including relaxed trips. Select a main activity as an anchor, then build nearby complementary activities, meals and practical movement around it. One activity per day is a minimum source-coverage rule, not the definition of a finished day.

Arrange core activities geographically and around fixed commitments. Read routes-and-stays for researched hotels and map-based travel checks. Establish overnight bases and account for door-to-door intercity transfers before assigning sightseeing time. Do not make arrival/departure days sparse solely because the user has not supplied times. Add useful meals, breaks, transfers and supporting activities based on location, pace, interests and likely spending. Leave slack for travel and rest; do not fill every hour. Include alternatives only when useful and keep them separate from the selected schedule and budget.

In the neighborhood research query, explicitly request one suitable real hotel with its exact name, street address, city and official source, alongside representative shared-room prices. General accommodation price research alone does not select a hotel. Research one suitable real hotel for the planned nights and shared-room assumptions, and choose meal venues whose actual service suits breakfast, lunch or dinner. A restaurant's existence does not establish breakfast service. A proposed hotel does not require confirmed room availability or a date-specific quote. Use a provisional base area only when the property's identity or suitability cannot be established, with the reason recorded. Research meals for each day around its selected anchors: name the sight and neighborhood in the query, ask for nearby venues with addresses and suitable service, then choose from that local cluster. Do not reuse one breakfast venue across distant morning anchors merely because its menu is known. For full days, review breakfast, lunch and dinner individually; do not lose a meal while repairing a timing conflict.

Build a suggested local-time timetable under plan-quality, with clock starts and realistic durations or end times for the day's activities, meals and movement. Follow plan-editing's timing representation so these times appear in the saved itinerary. Use known catalog durations with their source and reasonable ranges for selected meals, breaks and transfers. Check the sequence against seasonal hours, arrival/departure constraints and travel time, including buffers. Different locations need movement time even when map lookup is unavailable. Schedule meaningful cross-neighborhood transfers with explicitly estimated allowances; do not end a visit at the exact start of a meal elsewhere. Keep named attractions catalog-backed. Select specific meal venues under plan-quality: suitable dataset choices first, then web-researched restaurants when needed, saving their names, addresses and sources under plan-editing.

## Step 4: Validate and research the budget

Once each day has a coherent anchor, meals and overnight coverage, initialize and price Budget before adding minor visits or separate local walking entries. Resolve concrete blocking conflicts, while retaining honest unknowns; avoid polishing every optional detail before any costs exist. Complete the daily authoring batches and correct validation findings before final price reconciliation. Review dates, geographic order, hard constraints, existing user bookings and travel time against the brief. Initialization alone is not a finished itinerary.

Research applicable prices using researchWeb when available. Its readable evidence report keeps price facts available through later steps. Cover stays, travel within the trip, food and paid activities; explicitly state exclusions, including whether travel to/from Italy is included. Use the brief's date and group assumptions according to trip-details and budget-research. No spending limit is needed to produce an estimate.

Initialize an absent Budget with createBudget settings only, then record numeric estimates using editBudget addCost commands linked to the Plan's IDs. Include sources, charging units, quantities and explicit per_person/whole_party scope. Use review after checking the whole estimate. Read budgetCheck and resolve missing prices before unrelated document work. Use comparable research and explicit assumptions when exact quotes are unavailable. Ordinary lodging, food and paid activities need numeric estimates; exceptional evidence failure remains an explicitly incomplete budget. Never invent source facts or use zeros for missing prices. Reconcile totals and coverage against the selected days, nights and the user's limit.

## Step 5: Review, save and confirm

Run plan-quality's review on the actual scheduled items and overnight stays. Repair missing daily arrangements, then check the itinerary and budget against the brief, including source uncertainty, schedule feasibility, fixed bookings, coverage and double counting. Stage any final brief corrections with editDocument, including replacing provisional numeric budget requirements with references to the saved Budget representation. Keep substantive unresolved questions visible. Under planning-documents, create or update useful Research notes and Planning decisions with the affected changes. Link necessary traveller-facing reminders to actual Plan items; keep background research and comparisons in Library.

Correct remaining validation errors and pending checks. Leave enough steps for targeted research, a corrected proposal and commit within the bounded run. Commit the plan, budget and final document edits together, once. A rejected proposal or saved:false result is not saved. Only report successful planning after a commit receipt.

Keep each day's displayed order chronological. After the final Plan correction, reconcile any affected costs and use editBudget review against that final itinerary before committing.

Before ending the turn, confirm that the itinerary and budget have a successful final commit receipt. If only the brief is saved or proposals remain staged, continue planning and saving instead of handing the decision back to the user. Summarize the result and material uncertainty briefly, letting the panels carry details. Only then ask the relevant unanswered confirmation questions defined in trip-details.
