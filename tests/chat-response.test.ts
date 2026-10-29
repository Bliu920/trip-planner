import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildTranscript } from "../lib/chat-response/state";
import { idle, scenarios, user, reply, entry } from "./chat-response-fixture";

test("all live phases share one progress owner and one reply key", () => {
  const keys = new Set<string>();
  for (const scenario of scenarios) {
    const items = buildTranscript(scenario.messages, scenario.state);
    const live = items.filter(item => item.active);
    assert.equal(live.length, ["Completed", "Stopped", "Failed"].includes(scenario.name) ? 0 : 1, scenario.name);
    if (live.length) {
      assert.equal(live[0].message.role, "assistant");
      assert.equal(live[0], items.at(-1));
      assert.ok(live[0].progress);
      keys.add(live[0].key);
    }
    assert.equal(new Set(items.map(item => item.key)).size, items.length);
  }
  assert.equal(keys.size, 1, "placeholder, tools, gaps, text, reconciliation and retry preserve identity");
});

test("tool status changes the row text, never its presence", () => {
  const labels = scenarios.slice(0, 7).map(scenario => buildTranscript(scenario.messages, scenario.state).at(-1)?.progress);
  assert.deepEqual(labels, ["Working on your trip...", "Working on your trip...", "Checking places...", "Working on your trip...", "Preparing your plan...", "Working on your trip...", "Checking saved conversation..."]);
});

test("loading and preparing own one shell; errors and idle refresh do not pretend to work", () => {
  assert.equal(buildTranscript([], { ...idle, loading: true })[0].progress, "Loading your conversation...");
  assert.equal(buildTranscript([], { ...idle, starting: true })[0].progress, "Preparing your conversation...");
  assert.deepEqual(buildTranscript([], { ...idle, starting: true, startError: "Failed" }), []);
  const complete = [user, reply([], "Done", "complete")];
  assert.equal(buildTranscript(complete, { ...idle, syncing: true }).at(-1)?.progress, null);
  assert.equal(buildTranscript(complete, { ...idle, remoteBusy: true }).at(-1)?.progress, null);
  assert.equal(buildTranscript([user, reply()], { ...idle, remoteBusy: true, historyError: "Offline" }).at(-1)?.progress, null);
  const streamed = { ...reply([], "Live text"), metadata: undefined };
  assert.equal(buildTranscript([user, streamed], { ...idle, syncing: true }).at(-1)?.progress, "Checking saved conversation...");
});

test("earlier turns keep their keys and cannot acquire another turn's progress", () => {
  const first = [user, reply([], "Done", "complete")];
  const oldKey = buildTranscript(first, idle)[1].key;
  const items = buildTranscript([...first, { ...user, id: "user-two" }], { ...idle, busy: true });
  assert.equal(items[1].key, oldKey);
  assert.equal(items[1].progress, null);
  assert.equal(items.at(-1)?.key, "reply-user-two-0");
});

test("prior retry attempts cannot supply the current running label", () => {
  const old = entry("old", "running", "Old work");
  const current = { ...entry("new", "complete", "New work"), attempt: "89fd9d92-d38d-4a5e-93c1-09747c76a964" };
  const items = buildTranscript([user, reply([old, current])], { ...idle, busy: true });
  assert.equal(items.at(-1)?.progress, "Working on your trip...");
});

test("real rendered responses enforce first-position single-spinner layout", () => {
  // Client rendering needs the normal React condition, not react-server.
  const output = execFileSync(process.execPath, ["--import", "tsx", "tests/chat-response-render.tsx"], { encoding: "utf8", timeout: 30000 });
  assert.match(output, /Rendered 12 response scenarios successfully/);
  assert.match(output, /Rendered Markdown, safety, literal-user and streaming checks successfully/);
});

test("workspace delegates response rendering instead of adding a competing indicator", () => {
  const workspace = readFileSync("lib/workspace/chat.tsx", "utf8");
  assert.match(workspace, /buildTranscript\(messages,/);
  assert.match(workspace, /<ChatResponse key=\{item.key\}/);
  assert.doesNotMatch(workspace, /LoaderCircle|animate-spin|data-chat-activity|<ActivityHistory|Working on your trip/);
  const history = readFileSync("lib/activity/history.tsx", "utf8");
  assert.doesNotMatch(history, /LoaderCircle|animate-spin|aria-live|role="status"/);
});
