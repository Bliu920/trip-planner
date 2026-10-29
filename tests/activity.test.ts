import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { ActivityRecorder } from "../services/activity";
import { completed, source } from "../services/activity/summary";
import { activityEntries, activityRun, type ActivityEntry } from "../lib/activity/model";
import { createDatabase, seed, reference, otherTrip, conversation, generation } from "./chat-fixture";
import type { ChatSnapshot } from "../lib/chat/types";

let db: PGlite;
before(async () => { db = await createDatabase(); });
after(() => db.close());
beforeEach(() => seed(db));
async function begin(expected: string | null = null, token = generation) {
  const result = await db.query<{ data: { responseId: string } }>("select public.chat_begin_turn($1,$2,$3,$4,$5,$6,$7) as data", [reference, conversation, expected, expected ? null : "activity-user", expected ? null : "Plan Rome", !!expected, token]);
  return result.rows[0].data.responseId;
}
async function save(message: string, entry: ActivityEntry, trip = reference, token = generation) {
  return (await db.query<{ ok: boolean }>("select public.chat_record_activity($1,$2,$3,$4,$5) as ok", [trip, conversation, message, token, entry])).rows[0].ok;
}
async function snapshot() {
  return (await db.query<{ data: ChatSnapshot }>("select public.chat_snapshot($1,$2) as data", [reference, conversation])).rows[0].data;
}
async function finish(message: string, status = "complete", token = generation) {
  await db.query("select public.chat_write_reply($1,$2,$3,$4,$5,$6)", [reference, conversation, message, token, "Your reply", status]);
}
const entry = (id = "search"): ActivityEntry => ({ id: `${generation}:${id}`, attempt: generation, title: "Research your trip", status: "running", detail: "", sources: [], documents: [] });

test("activity survives checkpoints and reloads, with stable order and no duplicates", async () => {
  const message = await begin();
  await save(message, entry());
  await save(message, entry("file"));
  const done = { ...entry(), status: "complete" as const, detail: "Checked opening hours. Winter hours remain unconfirmed." };
  await save(message, done);
  await save(message, done);
  await finish(message, "streaming");
  let history = activityEntries((await snapshot()).messages[1].parts);
  assert.equal(history.length, 2);
  assert.equal(history[0].detail, done.detail);
  assert.equal(history[1].status, "running");
  await finish(message);
  history = activityEntries((await snapshot()).messages[1].parts);
  assert.equal(history[0].status, "complete");
  assert.equal(history[1].status, "interrupted");
});

test("retry retains previous attempts and rejects late, cross-trip and terminal writes", async () => {
  const message = await begin();
  await save(message, entry());
  assert.equal(await save(message, entry("wrong"), otherTrip), false);
  await finish(message, "failed");
  const next = randomUUID();
  await begin(message, next);
  assert.equal(await save(message, entry()), false);
  const fresh = { ...entry(), id: `${next}:search`, attempt: next };
  assert.equal(await save(message, fresh, reference, next), true);
  await finish(message, "complete", next);
  const history = activityEntries((await snapshot()).messages[1].parts);
  assert.equal(history.length, 2);
  assert.equal(history[0].status, "interrupted");
  assert.equal(history[1].attempt, next);
  assert.equal(await save(message, fresh, reference, next), false);
});

test("abandoned replies become interrupted without deleting completed steps", async () => {
  const message = await begin();
  await save(message, entry());
  await save(message, { ...entry("done"), status: "complete" });
  await db.query("update public.messages set updated_at=now()-interval '91 seconds' where id=$1", [message]);
  const history = activityEntries((await snapshot()).messages[1].parts);
  assert.deepEqual(history.map(item => item.status), ["interrupted", "complete"]);
});

test("activity storage is private and rejects malformed entries", async () => {
  const message = await begin();
  await assert.rejects(save(message, { ...entry(), attempt: randomUUID() }), /CHAT_INVALID/);
  await assert.rejects(save(message, { ...entry(), title: "x".repeat(161) }), /CHAT_INVALID/);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from public.message_activity"), /permission denied/);
    await assert.rejects(save(message, entry()), /permission denied/);
    await db.exec("reset role");
  }
});

test("recorder saves before publishing and retains safe results instead of raw inputs", async () => {
  const message = await begin();
  const emitted: ActivityEntry[] = [];
  const recorder = new ActivityRecorder(generation, async item => { assert.equal(await save(message, item), true); }, item => emitted.push(item));
  await recorder.consume({ type: "tool-input-available", toolCallId: "search", toolName: "searchPlaces", input: { private: "secret" } });
  await recorder.consume({ type: "tool-output-available", toolCallId: "search", output: { outcome: "succeeded", effect: "none", operationId: "search", code: "OK", message: "internal diagnostic", recovery: { action: "none", instruction: "" }, data: { total: 2, places: [{ name: "Colosseum" }, { name: "Pantheon" }] } } });
  assert.equal(emitted.at(-1)?.status, "complete");
  assert.match(emitted.at(-1)!.detail, /2 matching places.*Colosseum, Pantheon/);
  assert.doesNotMatch(JSON.stringify(emitted), /secret|internal diagnostic/);
  const reloaded = activityEntries((await snapshot()).messages[1].parts);
  assert.deepEqual(reloaded, [emitted.at(-1)]);
  const failed = new ActivityRecorder(generation, async () => { throw new Error("offline"); }, () => assert.fail("Unsaved activity must not be published"));
  await assert.rejects(failed.consume({ type: "tool-input-start", toolCallId: "file", toolName: "stageDocument" }), /offline/);
});

test("run duration is persisted, reloadable and separate from steps", async t => {
  const message = await begin();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const emitted: ActivityEntry[] = [];
  const recorder = new ActivityRecorder(generation, async item => { assert.equal(await save(message, item), true); }, item => emitted.push(item));
  await recorder.start();
  await recorder.start();
  assert.equal(emitted.length, 1);
  const active = (await snapshot()).messages[1];
  assert.equal(activityRun(active.parts)?.status, "running");
  assert.equal(activityEntries(active.parts).length, 0);
  now += 24000;
  await recorder.finish("complete");
  now += 10000;
  await recorder.finish("complete");
  const stored = activityRun((await snapshot()).messages[1].parts)!;
  assert.equal(stored.elapsedMs, 24000);
  assert.equal(stored.status, "complete");
  assert.equal(emitted.length, 2);
});

test("sources reject unsafe links and prepared files never claim saving", () => {
  assert.deepEqual(source("javascript:alert(1)"), []);
  assert.deepEqual(source("https://user:password@example.com"), []);
  const base = { outcome: "succeeded", effect: "staged", operationId: "file", code: "OK", message: "saved", recovery: { action: "none", instruction: "" }, data: { document: { id: randomUUID(), name: "Brief.md" } } };
  assert.equal(completed("stageDocument", base).status, "prepared");
  assert.deepEqual(completed("stageDocument", base).documents, []);
  assert.equal(completed("commit", { ...base, outcome: "unknown", effect: "unknown" }).status, "unconfirmed");
  assert.equal(completed("web_search", { action: { queries: ["Rome November hours"] }, sources: [{ url: "https://example.com/hours" }] }).sources.length, 1);
});

test("duplicate error events cannot overwrite a terminal result or abort history", async () => {
  const saved: ActivityEntry[] = [];
  const recorder = new ActivityRecorder(generation, async item => { saved.push(item); }, () => {});
  await recorder.consume({ type: "tool-input-error", toolCallId: "bad", toolName: "proposePlan", input: {}, errorText: "sensitive diagnostic" });
  await recorder.consume({ type: "tool-output-error", toolCallId: "bad", errorText: "another diagnostic" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, "failed");
  assert.doesNotMatch(JSON.stringify(saved), /sensitive|diagnostic/);
});

test("repeated calls retain distinct steps and lengthy returned text stays bounded", async () => {
  const entries = new Map<string, ActivityEntry>();
  const recorder = new ActivityRecorder(generation, async item => { entries.set(item.id, item); }, () => {});
  for (let call = 0; call < 2; call++) {
    await recorder.consume({ type: "tool-input-start", toolCallId: "search", toolName: "web_search" });
    await recorder.consume({ type: "tool-input-available", toolCallId: "search", toolName: "web_search", input: {} });
    await recorder.consume({ type: "tool-output-available", toolCallId: "search", output: { action: { queries: Array(20).fill("x".repeat(200)) } } });
  }
  assert.equal(entries.size, 2);
  assert.ok([...entries.values()].every(item => item.detail.length <= 1200 && item.status === "complete"));
});
