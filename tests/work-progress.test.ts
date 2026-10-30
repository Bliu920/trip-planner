import assert from "node:assert/strict";
import { test } from "node:test";
import { activityEntries, activityRun, groupActivity, type ActivityEntry } from "../lib/activity/model";
import { latestWorkSteps, workElapsed, workLabel } from "../lib/work-progress/timing";

const attempt = "12fd9d92-d38d-4a5e-93c1-09747c76a964";
const run: ActivityEntry = { id: "run", attempt, kind: "run", startedAt: "2026-10-29T12:00:00.000Z", title: "Work on your trip", status: "running", detail: "", sources: [], documents: [] };
const steps = Array.from({ length: 8 }, (_, index) => ({ ...run, kind: undefined, startedAt: undefined, id: String(index), title: `Step ${index}` }));

test("preview contains the latest four current-attempt steps in order", () => {
  assert.deepEqual(latestWorkSteps(steps, run).map(step => step.id), ["4", "5", "6", "7"]);
  assert.equal(latestWorkSteps(steps.slice(0, 2), run).length, 2);
  assert.equal(latestWorkSteps(steps, { ...run, attempt: "89fd9d92-d38d-4a5e-93c1-09747c76a964" }).length, 0);
  assert.equal(steps.length, 8);
});

test("consecutive repeated actions accumulate before selecting four preview rows", () => {
  const repeated = Array.from({ length: 7 }, (_, index) => ({ ...steps[0], id: `guide-${index}`, title: "Review planning guidance", status: "complete" as const }));
  const entries = [...steps.slice(0, 4), ...repeated];
  const original = JSON.stringify(entries);
  const preview = latestWorkSteps(entries, run);
  assert.deepEqual(preview.map(row => row.id), ["1", "2", "3", "guide-0"]);
  assert.equal(preview.at(-1)?.title, "Review planning guidance (7)");
  assert.equal(preview.at(-1)?.count, 7);
  for (let count = 1; count <= repeated.length; count++) {
    const row = groupActivity(repeated.slice(0, count))[0];
    assert.equal(row.id, "guide-0", "group identity stays stable as calls arrive");
    assert.equal(row.title, `Review planning guidance${count > 1 ? ` (${count})` : ""}`);
  }
  assert.equal(JSON.stringify(entries), original, "grouping does not modify stored calls");
});

test("intervening actions and retry attempts break consecutive groups", () => {
  const review = { ...steps[0], title: "Review planning guidance" };
  const groups = groupActivity([review, { ...steps[1] }, { ...review, id: "again" }, { ...review, id: "retry", attempt: "89fd9d92-d38d-4a5e-93c1-09747c76a964" }]);
  assert.equal(groups.length, 4);
  assert.ok(groups.every(group => group.count === 1));
});

test("grouped activity retains every outcome and evidence without claiming success after failure", () => {
  const failed = { ...steps[0], status: "failed" as const, detail: "Could not read the guidance", sources: [{ url: "https://example.com/first", title: "First source" }] };
  const complete = { ...steps[0], id: "second", status: "complete" as const, detail: "Read the guidance", documents: [{ id: attempt, name: "Travel notes.md" }] };
  const [group] = groupActivity([failed, complete]);
  assert.equal(group.status, "failed");
  assert.deepEqual(group.entries, [failed, complete]);
  assert.equal(groupActivity([complete, { ...complete, id: "live", status: "running" }])[0].status, "running");
  assert.equal(groupActivity([complete, { ...complete, id: "uncertain", status: "unconfirmed" }])[0].status, "unconfirmed");
});

test("elapsed time uses saved duration after completion and never page-open age", () => {
  const start = Date.parse(run.startedAt!);
  assert.equal(workElapsed(run, true, start + 12345), 12345);
  assert.equal(workElapsed(run, true, start - 3000), 0);
  assert.equal(workElapsed({ ...run, elapsedMs: 24000 }, false, start + 86400000), 24000);
  assert.equal(workElapsed(run, false, start + 86400000), null);
  assert.equal(workElapsed(undefined, false, null, 3200), 3200);
});

test("headers distinguish active, completed, stopped, failed and legacy work", () => {
  assert.equal(workLabel(true, "streaming", 12900, "Checking places..."), "Working · 12s");
  assert.equal(workLabel(false, "complete", 24000, null), "Worked for 24s");
  assert.equal(workLabel(false, "interrupted", 12000, null), "Stopped after 12s");
  assert.equal(workLabel(false, "failed", 3000, null), "Could not finish after 3s");
  assert.equal(workLabel(false, "complete", null, null), "Worked");
  assert.equal(workLabel(true, undefined, null, "Loading your conversation..."), "Loading your conversation...");
});

test("work durations switch to minutes at sixty seconds across all outcomes", () => {
  for (const [elapsed, duration] of [[0, "0s"], [59999, "59s"], [60000, "1m"], [61000, "1m 1s"], [119999, "1m 59s"], [120000, "2m"], [135000, "2m 15s"], [345000, "5m 45s"], [3600000, "60m"]] as const) {
    assert.equal(workLabel(true, "streaming", elapsed, null), `Working · ${duration}`);
    assert.equal(workLabel(false, "complete", elapsed, null), `Worked for ${duration}`);
    assert.equal(workLabel(false, "interrupted", elapsed, null), `Stopped after ${duration}`);
    assert.equal(workLabel(false, "failed", elapsed, null), `Could not finish after ${duration}`);
  }
});

test("run markers do not become visible steps; the newest run supplies timing", () => {
  const latest = { ...run, id: "retry", attempt: "89fd9d92-d38d-4a5e-93c1-09747c76a964" };
  const parts = [run, steps[0], latest].map(data => ({ type: "data-activity", data }));
  assert.deepEqual(activityEntries(parts), [steps[0]]);
  assert.deepEqual(activityRun(parts), latest);
  assert.equal(activityRun([{ type: "data-activity", data: { ...run, elapsedMs: -1 } }]), undefined);
});
