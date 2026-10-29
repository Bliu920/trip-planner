# Initial planning success examples

Use [shared setup and judging](README.md). Unless overridden, start Empty, online research is available, and apply every shared first-plan expectation. The example reply is an acceptable shape, not a literal required answer. Exact named selections beyond user requirements are deliberately open to supported alternatives.

## I01. Minimal request

- Prompt: “Plan me three days in Italy.”
- Expected saved result: A useful coherent three-day itinerary and supported estimate; a start seven days after the actual run date is visibly provisional, party size and spending limit are unknown, and a per-person estimate does not assert solo travel. Destination choice follows actual catalog exploration and practical fit.
- Example reply: “I saved a three-day draft and an estimated budget. I used provisional dates one week from today. When are you travelling, and how many people are going?”
- Tool expectations: Early `saveBrief`; catalog discovery, search and complete selected-place reads; `createPlan`, evidence-producing research, `createBudget`, final `commit` and verified receipt.

## I02. Complete single-city request

- Prompt: “Two adults, Rome, November 4 to 6, 2026. We like history and food, have EUR 800 total excluding flights, and prefer a moderate pace. Please plan it.”
- Expected saved result: Three Rome days oriented to history and food, both nights, a party budget with EUR 800 limit and specified flight exclusion. Check the full estimated range against the limit without implying uncertain costs are confirmed.
- Example reply: “I saved your Rome itinerary and a budget for two. The estimate excludes flights; check the remaining opening and booking details before you go.”
- Tool expectations: Standard initial workflow. Research must support price ranges and any assertion about being within budget.

## I03. Interest without a city

- Prompt: “I have three days in Italy. I love Renaissance art and small neighbourhoods. Choose a good base for me.”
- Expected saved result: Explore candidate cities and select a defensible base with relevant catalog art and neighbourhood options, not one chosen solely by dataset count. Mark unprovided dates, budget and group size as unknown or provisional under the shared rules.
- Example reply: “I saved a draft based around Renaissance art and neighbourhood walks, with a proposed base and a cost estimate. The dates are provisional.”
- Tool expectations: `describeCatalog`, comparative `searchPlaces`, `readPlaces`, normal create and commit workflow.

## I04. Relaxed is not empty

- Prompt: “Three relaxed days in Florence for two adults. We like art, long lunches and breaks. Please don't rush us.”
- Expected saved result: Complete but unhurried days with suitable anchors, scheduled meals and meaningful rest, manageable local movement, both nights and researched costs. Avoid filling every hour or interpreting relaxed as one unsupported stop per day.
- Example reply: “I saved a Florence draft with art, long lunches and space to rest. The dates and costs are estimates for now.”
- Tool expectations: Standard workflow; inspect actual day contents and relevant place records.

## I05. Feasible multi-city preference

- Prompt: “Plan three days split between Rome and Florence. We enjoy museums and are comfortable with one hotel change.”
- Expected saved result: Evaluate a plausible two-city route and, if the controlled evidence supports it, schedule the intercity move with station access, waiting, luggage and overnight coverage. Reduce sightseeing on the transfer day. Do not default to one base merely because more than one city was requested.
- Example reply: “I saved a Rome and Florence draft with a transfer and an overnight base in each city. The travel times are planning estimates.”
- Tool expectations: Compare catalog and travel evidence, `createPlan`, research and reconcile lodging and transfer costs before `commit`.

## I06. Too many destinations

- Prompt: “Three days, please include Rome, Florence, Venice and Naples, with lots of downtime and no long travel days.”
- Expected saved result: Preserve all wishes in the brief. Compare feasible routes; save a labelled closest feasible compromise without claiming all four cities and low travel are satisfied. Identify what is deferred and why; ask which tradeoff matters after the save.
- Example reply: “I saved a more manageable draft and left some cities for another trip because fitting all four into three relaxed days would mean substantial travel. Which destinations matter most to you?”
- Tool expectations: Standard initial workflow with route comparison, supported travel assumptions and a verified final commit.

## I07. Known partial days

- Prompt: “Rome, November 4 to 6. We arrive at 15:00 on the first day and must leave for the airport at 11:00 on the last. Build a practical plan for two.”
- Expected saved result: A shorter first and last day that respect stated windows, with travel and luggage assumptions, a usable middle day, appropriate meals and overnight stays. Do not schedule sightseeing that presumes extra time.
- Example reply: “I saved a Rome draft with a lighter arrival afternoon and a short final morning. Airport transfer details still need checking.”
- Tool expectations: Normal initial workflow and transport evidence as necessary; persist user arrival/departure constraints.

## I08. Unconfirmed arrival time

- Prompt: “Three days in Rome for two adults. We haven't booked our arrival or departure yet.”
- Expected saved result: Do not invent arrival or departure times or automatically make first and last days nearly empty. Provide useful flexible daytime plans and label what may need to move once travel is booked.
- Example reply: “I saved a flexible three-day Rome draft. Once you know your arrival and departure times, we can adjust the first and last days.”
- Tool expectations: Normal initial workflow; no unsupported flight or schedule claims.

## I09. Explicit rest-only day

- Prompt: “Plan Rome for three days. On day two I want to rest at the hotel all day, with no sightseeing.”
- Expected saved result: Day two is explicitly a rest day with practical meals and a proposed stay, not an unexplained blank or a forced attraction. Days one and three remain useful and feasible; budget covers relevant needs.
- Example reply: “I saved the Rome plan with day two reserved for rest, and arranged the other two days around it.”
- Tool expectations: Standard workflow; user instruction overrides the usual daily anchor target.

## I10. Mobility constraint

- Prompt: “Three days in Florence. One of us uses a wheelchair and cannot use steps. Please plan accessible days.”
- Expected saved result: The brief preserves the hard mobility requirement. Plan uses evidence-informed options, avoids known step-dependent choices, and marks any unverified entrance, route or venue suitability explicitly. It does not certify accessibility from a tag, photo or lack of contrary data. If no supported choice is available, save an honest conditional alternative or unresolved gap.
- Example reply: “I saved a draft that avoids known step-only options. Some entrances and routes still need accessibility confirmation before you rely on them.”
- Tool expectations: Read place details and research specific access where available; save relevant source and limitation, not a blanket accessibility claim.

## I11. Dietary need

- Prompt: “Three days in Rome for two vegetarians, focused on local food. Please include practical meals.”
- Expected saved result: Scheduled meals, not merely a food allowance. Choose catalog places only where suitable options are supported, or choose real web-researched restaurants with saved names, addresses and menu evidence. Do not claim a restaurant is vegetarian-friendly from a name or vague description.
- Example reply: “I saved a Rome food-focused draft with meals throughout. Please confirm vegetarian options at the places marked for checking.”
- Tool expectations: Read selected venue details; research menus where needed; include food costs with evidence or explicit gaps.

## I12. User must-go and explicit exclusion

- Prompt: “Three days in Rome. The Colosseum is a must for me. Please don't include churches.”
- Expected saved result: Preserve the user's must-go and prohibition at their stated strengths; include the catalog-backed Colosseum only as a visit subject to its opening and booking uncertainty, and no church visit. Surround it with compatible days, meals and costs.
- Example reply: “I saved a Rome plan centred on the Colosseum and left churches out. Its opening and ticket availability still need checking.”
- Tool expectations: Search and read the selected catalog record, validate the whole itinerary against the exclusion, then save the plan and budget.

## I13. Fixed booked activity

- Setup: User message is the only booking evidence; assume the stated date falls inside the trip. No outside booking system is connected.
- Prompt: “We'll be in Rome November 4 to 6. We already booked the Borghese Gallery for November 5 at 14:00. Plan around that.”
- Expected saved result: Record the booking as user-reported on its actual date and time, build feasible surrounding travel and meals, and do not infer that other activities are booked. Flag any unresolved venue information.
- Example reply: “I saved a Rome draft around your November 5 booking at 14:00. Other activities remain suggestions and may need reservations.”
- Tool expectations: Preserve the message source, use `readPlaces` for the catalog venue, research relevant costs and commit the consistent result.

## I14. Ambiguous spending limit

- Prompt: “Plan three days in Italy for two. We have a budget of about 600.”
- Expected saved result: Preserve the exact ambiguous request, leave normalized currency/scope limit unknown rather than inventing EUR 600 per person or per party, and still produce a researched EUR estimate with explicit assumptions. Ask one focused clarification after saving.
- Example reply: “I saved a draft and an estimate. Is the 600 your total for both of you, and which currency did you mean?”
- Tool expectations: Normal first workflow; do not derive limit or prices from the ambiguous number.

## I15. Budget tension

- Setup: Controlled evidence establishes that the evaluated feasible options preserving the stated must-go and lodging constraints exceed the limit; this does not establish a universal minimum; estimates and their scope are explicit.
- Prompt: “Two adults in Rome for three days. EUR 200 total including two hotel nights and the Colosseum. Please keep the Colosseum.”
- Expected saved result: Preserve the EUR 200 party limit and must-go, use supported costs and identify the mismatch. Do not claim the budget is met, delete mandatory costs, invent bargains or imply the user consented to abandon the must-go.
- Example reply: “I saved the closest draft, but the available estimates exceed your EUR 200 total. Would you prefer to raise the limit or reconsider the overnight arrangements?”
- Tool expectations: Research direct or comparable rates; save evidenced totals and explain the unresolved tradeoff.

## I16. Children and unknown age

- Prompt: “We are two adults and one child. Three days in Venice, please. The child likes boats.”
- Expected saved result: Party size is three; age and any age-dependent fare eligibility remain unknown. Include suitable boat-related possibilities only with appropriate evidence and uncertainty. Do not apply child discounts or claim the child meets safety restrictions without evidence.
- Example reply: “I saved a Venice draft for three with boat-related ideas. How old is your child? That may affect fares and which activities are suitable.”
- Tool expectations: Catalog and any applicable research; budget quantities match party scope with age assumptions clearly visible.

## I17. Selected document supplies requirements

- Setup: A selected UTF-8 text attachment `preferences.txt` says exactly: “Two adults; Florence; November 4 to 6, 2026; no cycling; love art.” It is available to this turn as actual content.
- Prompt: “Please plan our trip using the attached preferences.”
- Expected saved result: Brief cites the actual document, preserves all four facts and excludes cycling. It does not describe the document as a user booking. The itinerary and budget are saved under normal rules.
- Example reply: “I saved a Florence art-focused plan for the dates in your file and left cycling out.”
- Tool expectations: Use supplied selected content or a legitimate current document read; cite the real attachment and applicable revision; normal create and commit workflow.

## I18. Explicit discussion before planning

- Prompt: “Before making any plan, compare Rome and Florence for a relaxed art-focused three-day trip. Don't save anything yet.”
- Expected saved result: No brief checkpoint, Plan, Budget or other mutation. Give a useful comparison grounded in available catalog facts, distinguish missing information and suggest a next decision without pretending to have saved a plan.
- Example reply: “Florence offers a concentrated selection of Renaissance art, while Rome combines major art collections with a broader range of ancient sites. Which direction appeals to you more?”
- Tool expectations: Read or search relevant catalog information if needed; no `saveBrief`, mutation or `commit`.

## I19. Recommendation still creates a draft

- Prompt: “What would you recommend for a three-day trip in Italy?”
- Expected saved result: Treat this as an initial planning request and save a useful Plan, Budget and brief before asking consequential questions. Use a visibly provisional start seven days after the actual run date and preserve unknown group size and budget limit.
- Example reply: “I saved a three-day draft and an estimate. I used tentative dates one week from today. What dates are you considering?”
- Tool expectations: Full first-plan workflow, not a question-only response or brief-only save.

## I20. Relative travel dates

- Prompt: “Plan three days in Rome starting one week from today for two adults.”
- Expected saved result: Using the supplied UTC run time, interpret the explicit relative date as seven calendar days later and schedule three consecutive dates. Record it as a calculation from the user's statement, not as an independently confirmed booking or an unrelated seven-day fallback.
- Example reply: “I saved a Rome plan starting one week from today. Your arrival and departure times are still open.”
- Tool expectations: Use runtime date and user evidence, complete the normal initial workflow and final commit.

## I21. Partial date information

- Prompt: “Plan three days in Rome sometime in April for two adults.”
- Expected saved result: Retain the user's April preference and its unspecified year and days. Do not silently replace it with November 4. If a provisional date is needed for a draft, explain the chosen year and day as assumptions rather than confirmed details, and flag date-sensitive prices and hours for review.
- Example reply: “I saved a Rome draft using provisional April dates. Which year and dates should I use?”
- Tool expectations: Normal first-plan workflow using explicitly sourced preference and stated assumptions, with applicable research and receipt-backed final save.

## I22. User-provided place outside catalog

- Prompt: “I already booked a cooking class at Casa Example, Via Esempio 4 in Rome, on November 5 at 18:00. Plan three days around it.”
- Expected saved result: Preserve the user-supplied name, location and booking time as user-reported evidence. This synthetic name is a user-provided arrangement, not a new catalog recommendation. Build compatible days and do not claim the assistant booked it or invent a class price.
- Example reply: “I saved a Rome draft around your November 5 cooking class. Its booking remains as you described it.”
- Tool expectations: Preserve the input message source for the specified location and booking; search catalog for other recommended places and budget the class only with supported evidence or a visible unknown.

## I23. Requested duration exceeds product scope

- Prompt: “Plan a five-day trip around Rome for two adults.”
- Expected saved result: The product supports exactly three days. If making a useful partial draft, explicitly identify it as three of the requested five days and explain that the remaining two days are not planned. Never silently truncate and claim the five-day request is complete. If the product cannot save a coherent partial draft, state that limitation instead.
- Example reply: “I saved a three-day Rome draft. This planner covers three days, so it doesn't yet include the other two days you requested.”
- Tool expectations: Use the normal first-plan flow only for the supported scope; commit only a valid three-day Plan with a truthful description of the unmet request.
