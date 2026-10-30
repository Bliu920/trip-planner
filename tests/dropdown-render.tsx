import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const { SelectField } = require("../components/ui/select") as typeof import("../components/ui/select");
const { ExploreControls } = require("../lib/explore/controls") as typeof import("../lib/explore/controls");
const { BudgetForm } = require("../lib/budget/ui/components") as typeof import("../lib/budget/ui/components");
const { DocumentEditor } = require("../lib/documents/editor") as typeof import("../lib/documents/editor");
const { ItemFields } = require("../lib/plan/canvas/controls") as typeof import("../lib/plan/canvas/controls");
const { fixture, places } = require("./fixtures/plan/fixtures") as typeof import("./fixtures/plan/fixtures");
const { tableBudget } = require("./budget-ui-fixture") as typeof import("./budget-ui-fixture");

// Check controlled labels, including empty values and internal IDs.
const options = [{ value: "", label: "All cities" }, { value: "internal-uuid", label: "Florence" }];
for (const [value, label] of [["", "All cities"], ["internal-uuid", "Florence"]]) {
  const html = renderToStaticMarkup(<SelectField aria-label="City" value={value} options={options} onValueChange={() => {}} />);
  assert.match(html, /role="combobox"/);
  assert.match(html, new RegExp(`data-slot="select-value"[^>]*>${label}<`));
  assert.match(html, /aria-label="City"/);
  assert.match(html, /cursor-pointer/);
  assert.doesNotMatch(html, /<select|<option|focus-visible:ring|focus:ring/);
}
const disabled = renderToStaticMarkup(<SelectField aria-label="Locked field" value="" options={options} disabled onValueChange={() => {}} />);
assert.match(disabled, /<button[^>]*disabled=""/);

// Exercise real consumers with their own labels and form composition.
const plan = fixture();
const item = Object.values(plan.items).find(item => item.kind === "visit")!;
const surfaces = [
  { name: "Explore", element: <ExploreControls filters={{ query: "", city: "", type: "" }} onChange={() => {}} cities={["Florence"]} types={["museum"]} />, labels: ["City", "Place type"] },
  { name: "Budget", element: <BudgetForm snapshot={{ budget: { ...tableBudget, entries: [tableBudget.entries[0]] }, revision: 1, needsReview: false, plan: null }} locked={false} onSave={async () => true} onClose={() => {}} />, labels: ["Estimate covers", "Category", "Price status"] },
  { name: "File format", element: <DocumentEditor reference="fixture" />, labels: ["File format"] },
  { name: "Activity timing", element: <ItemFields item={item} plan={plan} places={places} locked={false} save={async () => true} close={() => {}} actions={null} />, labels: ["Part of day"] },
];
for (const surface of surfaces) {
  const html = renderToStaticMarkup(surface.element);
  assert.doesNotMatch(html, /<select|<option/, surface.name);
  for (const label of surface.labels) assert.match(html, new RegExp(`aria-label="${label}"`), surface.name);
  assert.equal((html.match(/data-slot="select-trigger"/g) ?? []).length, surface.labels.length, surface.name);
}
console.log("Shared dropdown labels, empty values, disabled fields and real consumers passed.");
