import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DayBudgetSummary } from "../lib/budget/ui/day";
import { diningBudgetFixture } from "./budget-day-fixture";

const { plan, budget } = diningBudgetFixture();
const render = (overrides = {}) => renderToStaticMarkup(<DayBudgetSummary snapshot={{ revision: 1, budget, plan, needsReview: false }} dayId={plan.days[0].id}
  itemIds={plan.days[0].itemIds} loading={false} error="" onOpen={() => {}} {...overrides} />);
const html = render();
assert.match(html, /€53 to €128/);
assert.match(html, /Estimated day share/);
assert.match(html, /1 of 3 covered meals/); assert.match(html, /2 of 6 covered meals/);
assert.match(html, /Full allowance: €15 to €30/); assert.match(html, /Full allowance: €90 to €300/);
assert.match(html, /Full budget &amp; sources/); assert.match(html, /Per person/);
assert.doesNotMatch(html, /Shared with other days|Not allocated to this day|Partial estimate/);
assert.doesNotMatch(html, /<details open/);
assert.match(render({ snapshot: null }), /Not estimated yet/);
assert.match(render({ snapshot: null, error: "Unavailable" }), /Check budget/);
assert.match(render({ snapshot: { revision: 2, budget, plan, needsReview: true } }), /Needs review/);
budget.entries.push({ ...budget.entries[2], id: "pass", label: "Shared museum pass", planItemIds: ["admission-0", "admission-1"] });
assert.match(render(), /Not allocated to this day/);
assert.match(render(), /shared costs are excluded from this subtotal/);
console.log("Daily dining amount, allocation and state rendering checks passed");
