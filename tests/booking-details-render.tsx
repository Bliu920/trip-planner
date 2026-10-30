import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { StopDetails } from "../lib/plan/day-view/details";
import { presentPlan } from "../lib/plan/presentation/model";
import { examplePlan } from "./plan-fixture";
import catalog from "../data/italy.json";
import type { Place } from "../lib/catalog";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const { PlaceCard } = require("../lib/explore/place") as typeof import("../lib/explore/place");
const required = { ...catalog[0], booking_required: true, photo: null } as Place;
const card = renderToStaticMarkup(<PlaceCard place={required} />);
assert.match(card, /View Colosseum/);
assert.doesNotMatch(card, /Booking|booking|Reservations/);

// Derive details without agent notes.
const plan = examplePlan();
assert.deepEqual(plan.notes, []);
const stop = presentPlan(plan, [required]).days[0].stops[0];
const detail = renderToStaticMarkup(<StopDetails stop={stop} />);
assert.match(detail, /Booking required\. Availability has not been checked\./);
assert.doesNotMatch(detail, /Reservation: booked/);
console.log("Booking is absent from cards and system-derived in activity details.");
