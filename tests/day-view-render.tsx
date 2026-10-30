import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StopDetails } from "../lib/plan/day-view/details";
import { presentPlan } from "../lib/plan/presentation/model";
import { examplePlan } from "./plan-fixture";
import { restaurantMeal } from "./restaurant-fixture";
import type { Day, Stop, PlanPresentationData } from "../lib/plan/presentation/model";

// Render client composition inertly.
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const { DayCard, Timeline, TripSummary } = require("../lib/plan/presentation/components") as typeof import("../lib/plan/presentation/components");
const { PlanPresentation } = require("../lib/plan/presentation") as typeof import("../lib/plan/presentation");
const { DayMap } = require("../lib/plan/day-view/map") as typeof import("../lib/plan/day-view/map");
const breakfast: Stop = { id: "breakfast", title: "Breakfast", kind: "food", time: "morning", duration: "Duration unknown", category: "meal", note: "" };
const museum: Stop = { ...breakfast, id: "museum", title: "Museum", kind: "sight", duration: "2 hr", coordinates: [41.89, 12.49], photo: { src: "/museum.jpg", alt: "Museum exterior", credit: "Photographer", creditUrl: "https://example.com/photo" }, sources: [{ label: "Opening hours", url: "https://example.com/hours" }] };
const day: Day = { id: "day", title: "Rome sights", date: null, photo: museum.photo!, walkingLabel: null, stayLabel: null, stops: [breakfast, museum] };
const data: PlanPresentationData = { title: "Rome", meta: ["1 day"], dateLabel: "Dates not set", budget: null, days: [day], otherItems: [], notes: [] };
const selected: string[] = [];
const edited: string[] = [];
const html = renderToStaticMarkup(<StopDetails stop={museum} onEdit={id => edited.push(id)} />);
assert.match(html, /<img[^>]*alt="Museum exterior"/);
assert.match(html, /href="https:\/\/example.com\/hours"/);
assert.match(html, /<section class="dp-details" aria-label="Details: Museum" tabindex="0">/);
assert.doesNotMatch(html, /aria-label="About Museum"/, "the entire card is one keyboard-scrollable region");
assert.match(html, /Edit activity/, "the editing action remains inside the card's scroll content");
const samePhoto = renderToStaticMarkup(<StopDetails stop={museum} cover={day.photo} />);
assert.doesNotMatch(samePhoto, /<img/, "the same day-cover image is not repeated next to itself");
const unknown = renderToStaticMarkup(<StopDetails stop={breakfast} />);
assert.match(unknown, /Duration not set/);
assert.match(unknown, /Place not chosen yet/);
assert.doesNotMatch(unknown, /Free|Confirmed|<a /);

// Real restaurant facts remain usable even without a map pin.
const restaurantPlan = examplePlan();
restaurantPlan.items["meal-a"] = restaurantMeal();
restaurantPlan.days[0].itemIds.push("meal-a");
const restaurantStop = presentPlan(restaurantPlan, []).days[0].stops[1];
const restaurantHtml = renderToStaticMarkup(<StopDetails stop={restaurantStop} />);
assert.match(restaurantHtml, /Fictional Cafe A, 1 Fictional Street, Rome/);
assert.match(restaurantHtml, /href="https:\/\/example.com\/cafe-a"/);
assert.match(restaurantHtml, /Not located on map/);
assert.doesNotMatch(restaurantHtml, /Place not chosen yet/);
const resting = renderToStaticMarkup(<StopDetails stop={{ ...breakfast, kind: "stay", category: "rest", locationState: "not_applicable" }} />);
assert.doesNotMatch(resting, /Place not chosen|Not located on map/);
const emptyMap = renderToStaticMarkup(<DayMap places={[]} selected={null} selectionRequest={0} onSelect={() => {}} />);
assert.equal(emptyMap, "");
const mapped = renderToStaticMarkup(<DayMap places={[{ id: museum.id, title: museum.title, coordinates: [41.89, 12.49], number: 2 }]} selected="breakfast" selectionRequest={1} onSelect={() => {}} />);
assert.match(mapped, /aria-label="Day map"/);
assert.match(mapped, /1 mapped place/);
assert.doesNotMatch(mapped, /maps\/dir|Locations are not set/);
for (const detailed of [false, true]) {
  const timelineHtml = renderToStaticMarkup(<Timeline stops={day.stops} detailed={detailed} onStop={() => {}} />);
  assert.doesNotMatch(timelineHtml, /<img|pp-stopThumbnail|pp-stopBody/, "timeline images and their layout wrappers are removed in both modes");
  assert.match(timelineHtml, /data-kind="sight"/);
  assert.match(timelineHtml, /data-kind="food"/);
}
const illustrative = { ...museum, photo: { ...museum.photo!, match: "illustrative" as const } };
assert.doesNotMatch(renderToStaticMarkup(<StopDetails stop={illustrative} />), /<img/, "illustrative photos never stand in for a venue");

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
// Every day has one persistent card owner in either mode.
const threeDays = { ...data, days: [day, { ...day, id: "second", title: "Second day", stops: [] }, { ...day, id: "third", title: "Third day", stops: [] }] };
for (const initialDayId of [null, "second"]) {
  const rendered = renderToStaticMarkup(<PlanPresentation data={threeDays} initialDayId={initialDayId} />);
  for (const id of ["day", "second", "third"]) assert.equal((rendered.match(new RegExp(`data-day-id="${id}"`, "g")) ?? []).length, 1);
  assert.equal((rendered.match(/class="pp-days pp-stage"/g) ?? []).length, 1);
}
// Inactive header controls cannot receive focus.
const header = (expanded: boolean) => renderToStaticMarkup(<TripSummary title="Rome" meta={["3 days"]} dateLabel="Dates flexible" budget={null} embedded expanded={expanded} onBudget={() => {}} onDate={() => {}}
  navigation={<nav aria-label="Trip days"><button className="cursor-pointer" type="button">All days</button></nav>} />);
assert.match(header(true), /class="pp-headerLayer pp-headerFacts" data-active="false" aria-hidden="true" inert=""/);
assert.match(header(false), /class="pp-headerLayer" data-active="false" aria-hidden="true" inert=""/);
assert.match(header(true), /class="pp-headerLayer" data-active="true" aria-hidden="false"/);
assert.equal((header(true).match(/class="pp-headerSlot"/g) ?? []).length, 1);
const empty = renderToStaticMarkup(<DayCard day={{ ...day, stops: [] }} number={1} active domId="empty" onOpenDay={() => {}} onStop={() => {}} />);
assert.match(empty, /No activities scheduled/);
// Contextual lodging, reminders and removed bottom sections.
const overnight: Stop = { ...breakfast, id: "stay", title: "Proposed central base", time: "Overnight", duration: "Accommodation", category: "stay" };
const contextualDay = { ...day, stayLabel: overnight.title, stays: [overnight], reminders: [{ id: "entry", text: "Reserve entry" }] };
const lodgingCard = DayCard({ day: contextualDay, number: 1, active: true, domId: "stay-day", selectedId: "stay", expanded: true, onOpenDay: () => {}, onStop: id => selected.push(id) });
const lodgingButton = buttons(lodgingCard).find(button => button["data-stop-id"] === "stay")!;
assert.equal(lodgingButton["aria-pressed"], true);
(lodgingButton.onClick as () => void)(); assert.equal(selected.at(-1), "stay");
const lodgingHtml = renderToStaticMarkup(lodgingCard);
assert.match(lodgingHtml, /View overnight stay: Proposed central base/);
assert.match(lodgingHtml, /Reserve entry/);
const contextualData = { ...data, days: [contextualDay], otherItems: [overnight],
  notes: [{ id: "background", text: "Background rationale must not appear" }],
  reminders: [{ id: "trip", text: "Confirm arrival time" }], pendingItems: [{ ...overnight, id: "unassigned", title: "Stay awaiting nights" }] };
const cleaned = renderToStaticMarkup(<PlanPresentation data={contextualData} />);
assert.doesNotMatch(cleaned, /Stays and unscheduled arrangements|Plan notes|Planning checks|Background rationale must not appear/);
assert.match(cleaned, /Confirm arrival time/); assert.match(cleaned, /Check stay dates/);
const selectedStay = renderToStaticMarkup(<StopDetails stop={{ ...overnight, reminders: [{ id: "check-in", text: "Confirm check-in time" }] }} onEdit={() => {}} />);
assert.match(selectedStay, /Confirm check-in time/); assert.match(selectedStay, /Edit activity/);
// Overview groups retain order while detailed clocks stay available.
const timedStops: Stop[] = [
  { ...breakfast, time: "09:00" },
  { ...museum, time: "10:30", endTime: "11:30", duration: "Until 11:30" },
  { ...breakfast, id: "lunch", time: "12:00" },
  { ...breakfast, id: "rest", time: "14:00", omitted: true, canToggle: true },
  { ...breakfast, id: "dinner", time: "18:00" },
];
const timeLabels = (markup: string) => [...markup.matchAll(/<time[^>]*>(.*?)<\/time>/g)].map(match => match[1]);
const renderTimes = (stops: Stop[], detailed = false) => renderToStaticMarkup(<Timeline stops={stops} detailed={detailed} onStop={() => {}} onToggleOptional={() => {}} />);
const grouped = renderTimes(timedStops);
assert.deepEqual(timeLabels(grouped), ["Morning", "", "Afternoon", "", "Evening"]);
assert.doesNotMatch(grouped, /09:00|10:30|11:30|12:00|14:00|18:00/);
assert.match(grouped, /aria-label="Morning, Museum"/, "a repeated period stays accessible without another visible label");
assert.deepEqual(timeLabels(renderTimes(timedStops, true)), timedStops.map(stop => stop.time));
assert.match(renderTimes(timedStops, true), /Until 11:30/);
assert.match(renderTimes(timedStops, true), /Restore Breakfast/);
const overviewCard = renderToStaticMarkup(<DayCard day={{ ...day, stops: timedStops }} number={1} active domId="period-overview" onOpenDay={() => {}} onStop={() => {}} />);
const detailedCard = renderToStaticMarkup(<DayCard day={{ ...day, stops: timedStops }} number={1} active expanded domId="period-detail" onOpenDay={() => {}} onStop={() => {}} />);
assert.deepEqual(timeLabels(overviewCard), ["Morning", "", "Afternoon", "", "Evening"]);
assert.deepEqual(timeLabels(detailedCard), timedStops.map(stop => stop.time));
const legacy = ["morning", "morning", "afternoon", "morning", "Flexible", "", "05:30", "06:00", "11:59", "17:59", "23:59", "24:00"].map((time, index) => ({ ...breakfast, id: `legacy-${index}`, time }));
assert.deepEqual(timeLabels(renderTimes(legacy)), ["Morning", "", "Afternoon", "Morning", "Flexible", "", "Night", "Morning", "", "Afternoon", "Evening", "Flexible"]);
assert.deepEqual(legacy.map(stop => stop.time), ["morning", "morning", "afternoon", "morning", "Flexible", "", "05:30", "06:00", "11:59", "17:59", "23:59", "24:00"], "grouping never edits or reorders saved times");
const rangedDetails = renderToStaticMarkup(<StopDetails stop={timedStops[1]} />);
assert.match(rangedDetails, /10:30 to 11:30/);
console.log("Plan expansion checks passed");
