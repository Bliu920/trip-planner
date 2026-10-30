import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inspectPlan } from "../lib/plan/model";
import { presentPlan } from "../lib/plan/presentation/model";
import { guidance } from "../services/assistant/agent/context/instructions";
import { readGuide } from "../services/assistant/agent/guides";
import { examplePlan } from "./plan-fixture";
import catalog from "../data/italy.json";

test("catalog booking flags remain presentation facts, not agent validation tasks", () => {
  for (const requirement of [true, false, null]) {
    const plan = examplePlan();
    const places = [{ ...catalog[0], booking_required: requirement }];
    const before = structuredClone(plan);
    assert.equal(inspectPlan(plan, places).findings.some(f => f.code === "booking"), false);
    const detail = presentPlan(plan, places).days[0].stops[0].details?.find(d => d.label === "Booking");
    if (requirement === true) assert.match(detail!.value, /Booking required/);
    if (requirement === false) assert.match(detail!.value, /No booking requirement listed/);
    if (requirement === null) assert.equal(detail, undefined, "unknown is not a false requirement");
    assert.deepEqual(plan, before, "display metadata never mutates the saved itinerary");
  }
});

test("booking flags neither authorize research nor require reminders in planning guidance", () => {
  assert.match(guidance, /Research booking information only when the user explicitly requests it; never make a reservation/);
  assert.match(guidance, /Preserve user-reported bookings and fixed commitments/);
  const quality = readGuide("plan-quality").content;
  const first = readGuide("first-plan").content;
  const stays = readGuide("routes-and-stays").content;
  assert.doesNotMatch(quality, /bookings are checked|closures and booking guidance|opening or reservation checks/);
  assert.match(quality, /app supplies booking requirement information in activity details/);
  assert.match(first, /Booking requirements are displayed by the app and do not add a research or reminder task/);
  assert.doesNotMatch(stays, /an explicit availability check/);
  const research = readFileSync("services/assistant/agent/tools/research.ts", "utf8");
  assert.doesNotMatch(research, /menu prices and booking guidance/);
  assert.match(research, /ordinary venue or price research does not require either/);
});

test("rendered cards omit booking metadata while real activity details retain it", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "tests/booking-details-render.tsx"], { encoding: "utf8", timeout: 30000 });
  assert.match(output, /system-derived in activity details/);
});
