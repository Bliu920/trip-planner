# Create and edit a budget

Read budget-research for realistic ranges and evidence rules. Budget is the one price ledger. Daily and trip totals are derived, never copied into another maintained document.

## Small cost commands

createBudget initializes scope, travelers, limit, assumptions and exclusions. editBudget adds or modifies up to twelve costs/settings commands at a time. addCost supplies id, label, category, planItemIds, unit, quantity, min/max, priceScope, assumptions and sources [{sourceId,detail}]. Use actual retrieved source handles from research or existing evidence. The host supplies original URLs, check times and document versions.

priceScope states whether the amount is per_person or whole_party. min/max are for one stated charging unit, and quantity multiplies once. For a double room costing EUR 240 for both adults and both nights, use whole_party, coveredTravelers 2, unit stay and quantity 1. The host converts to EUR 120 per person, not EUR 240 per person and not four nights. State sharing assumptions explicitly when not supplied.

updateCost changes only named fields and retains other amounts, source timestamps and links. Changes to scope or group size require reconciling all affected costs and the spending limit, not only changing a label. Never refresh a timestamp without new research.

## Coverage and user facts

Within the spending scope defined in budget-research, ordinary stays, food, local movement and paid activities need researched numeric estimates, using comparable evidence with explicit assumptions when exact quotes are unavailable. A missing price is not zero. Check actual coverage as well as whether saved entries contain numbers.

Link meals, lodging and admissions to their Plan item IDs. Shared allowances can cover several meals; do not also add a second full cost for the same meals. A combined ticket is one charge covering its included sights. Included breakfasts can link to the lodging charge; remove separately paid breakfast costs. Mark genuine free or excluded costs explicitly with supporting facts, not guesses.

User-confirmed booking amounts do not require pretending a website quoted them. Update the Travel brief with the actual user fact and its original message reference before changing the price, then cite the new returned document sourceId/version for Budget evidence. Reading an old brief does not update it. An existing source handle cannot support a fact newly supplied after that version. Keep the original statement as authority. Confirmed means an exact supplied or verified amount; representative rates remain estimated and do not confirm availability.

## Review and publication

Use review after content changes to acknowledge the whole estimate against the effective Plan. It does not mean all source facts or availability are confirmed. Reconcile changed nights, dates, travelers, selections and fees. After removing an unbooked activity, remove its obsolete charge as well as its links. Retain an already-paid or non-refundable charge only with an explicit explanation and evidence. Moving an activity does not itself cancel its ticket.

Read budgetCheck. Fill routine price gaps; use resolveBudgetGaps only after the documented exceptional research failure. Unknown costs keep the total explicitly incomplete. A limit-only edit may preserve unchanged unknowns without claiming a fresh full review. Resolve reported blockers before commit and preserve uncertainty in the final answer.


## Count occurrences separately from travellers

quantity counts occurrences of the quoted unit, never an extra multiplication by party size. One admission or one 72-hour pass per adult uses quantity 1 and priceScope per_person, even for two adults. Two shared room-nights use quantity 2 and priceScope whole_party; the host divides the room price across coveredTravelers. A total booking for both nights uses quantity 1 with unit stay. Keep these cases distinct when reviewing each cost.

For meal allowances, keep the unit and multiplier consistent: one daily allowance times three days, nine individual meal prices times nine meals, or one whole-trip food allowance times one. The number of linked meals does not independently multiply a daily or trip total. If the upper estimate exceeds the user limit, recheck arithmetic and research affordable choices; explain any unresolved excess without inventing lower prices.
