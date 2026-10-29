import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StopDetails } from "../lib/plan/day-view/details";
import type { Day, Stop, PlanPresentationData } from "../lib/plan/presentation/model";

// Render client composition inertly.
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const { DayCard, Timeline } = require("../lib/plan/presentation/components") as typeof import("../lib/plan/presentation/components");
const { PlanPresentation } = require("../lib/plan/presentation") as typeof import("../lib/plan/presentation");
const breakfast: Stop = { id: "breakfast", title: "Breakfast", kind: "food", time: "morning", duration: "Duration unknown", category: "meal", note: "" };
const museum: Stop = { ...breakfast, id: "museum", title: "Museum", kind: "sight", duration: "2 hr", coordinates: [41.89, 12.49], photo: { src: "/museum.jpg", alt: "Museum exterior", credit: "Photographer", creditUrl: "https://example.com/photo" }, sources: [{ label: "Opening hours", url: "https://example.com/hours" }] };
const day: Day = { id: "day", title: "Rome sights", date: null, photo: museum.photo!, walkingLabel: null, stayLabel: null, stops: [breakfast, museum] };
const data: PlanPresentationData = { title: "Rome", meta: ["1 day"], dateLabel: "Dates not set", budget: null, days: [day], otherItems: [], notes: [] };
const selected: string[] = [];
const edited: string[] = [];
const html = renderToStaticMarkup(<StopDetails stop={museum} onEdit={id => edited.push(id)} />);
assert.match(html, /<img[^>]*alt="Museum exterior"/);
assert.match(html, /href="https:\/\/example.com\/hours"/);
assert.match(html, /Edit activity/);
const samePhoto = renderToStaticMarkup(<StopDetails stop={museum} cover={day.photo} />);
assert.doesNotMatch(samePhoto, /<img/, "the same day-cover image is not repeated next to itself");
const unknown = renderToStaticMarkup(<StopDetails stop={breakfast} />);
assert.match(unknown, /Duration not set/);
assert.match(unknown, /Location not set/);
assert.doesNotMatch(unknown, /Free|Confirmed|<a /);

// Exercise independent commands.
function buttons(node: ReactNode): { [key: string]: unknown }[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode; [key: string]: unknown }>(node)) return [];
  return [...(node.type === "button" ? [node.props] : []), ...buttons(node.props.children)];
}
const timeline = Timeline({ stops: day.stops, selectedId: "museum", onStop: id => selected.push(id) });
const choose = buttons(timeline).find(button => button["data-stop-id"] === "museum")!;
assert.equal(choose["aria-haspopup"], undefined, "overview events navigate instead of promising a dialog");
(choose.onClick as () => void)();
assert.deepEqual(selected, ["museum"]);
assert.equal(edited.length, 0);
const details = StopDetails({ stop: museum, onEdit: id => (edited as string[]).push(id) });
(buttons(details)[0].onClick as () => void)();
assert.deepEqual(edited, ["museum"]);
const locked = renderToStaticMarkup(<StopDetails stop={museum} onEdit={() => {}} locked />);
assert.match(locked, /disabled=""/);
const noSelection = renderToStaticMarkup(<PlanPresentation data={data} initialDayId="day" />);
assert.match(noSelection, /aria-label="Trip overview"/);
assert.match(noSelection, /All 1 day/);
assert.match(noSelection, /data-expanded="true"/);
assert.doesNotMatch(noSelection, /aria-label="Details:/, "opening a day must not select an activity arbitrarily");
const overview = renderToStaticMarkup(<PlanPresentation data={data} />);
assert.match(overview, /id="[^"]*-stop-museum"/);
assert.doesNotMatch(overview, /Edit activity|Edit Day 1 title/);
const empty = renderToStaticMarkup(<DayCard day={{ ...day, stops: [] }} number={1} active domId="empty" onOpenDay={() => {}} onStop={() => {}} />);
assert.match(empty, /No activities scheduled/);
console.log("Plan expansion checks passed");
