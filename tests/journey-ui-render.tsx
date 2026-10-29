import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { JourneyStatus } from "../lib/journeys/view";
import type { JourneyReport } from "../lib/journeys";
const report: JourneyReport = { fingerprint: "private-fingerprint", status: "checked", walkingMeters: 1200, movingMinutes: 20, findings: [],
  legs: [{ id: "private-leg-id", dayId: "day", fromItemId: "private-origin", toItemId: "private-destination", fromLabel: "Museum", toLabel: "Restaurant",
    mode: "walk", status: "checked", distanceMeters: 1200, durationSeconds: 600, reservedMinutes: 20, availableMinutes: 30,
    evidenceId: "private-evidence", checkedAt: "2026-10-29T00:00:00Z", reason: null }] };
const checked = renderToStaticMarkup(<JourneyStatus state={{ report, pending: false, failed: false, loading: false }} />);
assert.match(checked, /Journeys fit the suggested times/); assert.match(checked, /1.2 km mapped walking/);
assert.match(checked, /openrouteservice/); assert.doesNotMatch(checked, /private-/);
const partial = { ...report, status: "unverified" as const, legs: [{ ...report.legs[0], status: "unverified" as const, reason: "Confirm the entrance." }] };
const unknown = renderToStaticMarkup(<JourneyStatus state={{ report: partial, pending: false, failed: false, loading: false }} />);
assert.match(unknown, /Some journeys still need checking/); assert.match(unknown, /Museum to Restaurant/); assert.match(unknown, /partial check/);
assert.doesNotMatch(unknown, /Journeys fit/);
const lodging = renderToStaticMarkup(<JourneyStatus state={{ report: { ...report, status: "unverified", findings: [
  { code: "stay_coverage", severity: "warning", itemIds: [], message: "An overnight base is not assigned after Day 2. Confirm lodging or explain why no stay is needed." },
] }, pending: false, failed: false, loading: false }} />);
assert.match(lodging, /overnight base is not assigned after Day 2/); assert.doesNotMatch(lodging, /Journeys fit|stay_coverage/);
const failed = renderToStaticMarkup(<JourneyStatus state={{ report: null, pending: false, failed: true, loading: false }} />);
assert.match(failed, /Travel times remain unverified/); assert.doesNotMatch(failed, /0.0 km|Journeys fit/);
const pending = renderToStaticMarkup(<JourneyStatus state={{ report: null, pending: true, failed: false, loading: false }} />);
assert.match(pending, /not yet saved/); assert.doesNotMatch(pending, /Journeys fit/);
console.log("Journey status checks passed");
