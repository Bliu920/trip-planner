import assert from "node:assert/strict";
import { test } from "node:test";
import { PlanSession, PlanRequestError } from "../lib/plan/session";
import { examplePlan } from "./plan-fixture";
import catalog from "../data/italy.json";
import type { PlanView } from "../lib/plan/session";
import type { PlanSnapshot } from "../lib/plan/types";

const view = (revision = 1): PlanView => ({ plan: examplePlan(), revision, places: catalog });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("only newest read wins and disposed reads cannot publish", async () => {
  const first = deferred<PlanView>();
  const second = deferred<PlanView>();
  let count = 0;
  const session = new PlanSession("trip", { load: () => ++count === 1 ? first.promise : second.promise, save: async () => { throw new Error("Unexpected save"); } });
  const old = session.refresh();
  const latest = session.refresh();
  second.resolve(view(3)); await latest;
  first.resolve(view(2)); await old;
  assert.equal(session.getSnapshot().data?.revision, 3);
  const late = deferred<PlanView>();
  const stopped = new PlanSession("trip", { load: () => late.promise, save: async () => { throw new Error("Unexpected save"); } });
  const request = stopped.refresh(); stopped.stop(); late.resolve(view(4)); await request;
  assert.equal(stopped.getSnapshot().data, null);
});

test("double edits are locked and AI refresh during a save is replayed", async () => {
  const saving = deferred<{ savedRevision: number; snapshot: PlanSnapshot }>();
  let reads = 0, writes = 0;
  const session = new PlanSession("trip", {
    load: async () => view(++reads === 1 ? 1 : 3),
    save: async () => { writes++; return saving.promise; },
  });
  await session.refresh();
  const first = session.edit(plan => { plan.days[0].title = "My day"; });
  assert.equal(await session.edit(() => {}), false);
  await session.refresh();
  assert.equal(reads, 1);
  saving.resolve({ savedRevision: 2, snapshot: { plan: examplePlan(), revision: 2 } });
  assert.equal(await first, true);
  await Promise.resolve();
  assert.equal(writes, 1);
  assert.equal(session.getSnapshot().data?.revision, 3);
});

test("failed saves retain exact request identity and do not mutate saved data", async () => {
  const writes: unknown[] = [];
  const session = new PlanSession("trip", {
    load: async () => view(),
    save: async (_ref, revision, plan, id) => {
      writes.push({ revision, plan, id });
      if (writes.length === 1) throw new Error("Response lost");
      return { savedRevision: 2, snapshot: { plan, revision: 4 } };
    },
  });
  await session.refresh();
  const before = structuredClone(session.getSnapshot().data);
  assert.equal(await session.edit(plan => { plan.days[0].title = "Updated"; }), false);
  assert.deepEqual(session.getSnapshot().data, before);
  assert.ok(session.getSnapshot().pending);
  assert.equal(await session.edit(() => {}), false);
  assert.equal(await session.retry(), true);
  assert.deepEqual(writes[0], writes[1]);
  assert.equal(session.getSnapshot().pending, null);
  assert.equal(session.getSnapshot().data?.revision, 4);
});

test("background refresh cannot discard a pending edit; explicit reload can", async () => {
  let reads = 0;
  const session = new PlanSession("trip", { load: async () => view(++reads), save: async () => { throw new Error("Conflict"); } });
  await session.refresh();
  await session.edit(plan => { plan.days[0].title = "Attempt"; });
  await session.refresh();
  assert.equal(reads, 1);
  assert.ok(session.getSnapshot().pending);
  await session.refresh(true);
  assert.equal(session.getSnapshot().pending, null);
  assert.equal(session.getSnapshot().data?.revision, 2);
});

test("failed discard reload retains the retry candidate", async () => {
  let reads = 0;
  const session = new PlanSession("trip", { load: async () => { if (++reads > 1) throw new Error("Offline"); return view(); }, save: async () => { throw new Error("Conflict"); } });
  await session.refresh();
  await session.edit(plan => { plan.days[0].title = "Attempt"; });
  const pending = session.getSnapshot().pending;
  await session.refresh(true);
  assert.equal(session.getSnapshot().pending, pending);
});

test("invalid edits never reach persistence; empty plans can be created", async () => {
  let writes = 0;
  const session = new PlanSession("trip", {
    load: async () => ({ ...view(), plan: null }),
    save: async (_ref, revision, plan) => { writes++; return { savedRevision: revision + 1, snapshot: { plan, revision: revision + 1 } }; },
  });
  await session.refresh();
  assert.equal(await session.edit(() => {}), true);
  assert.equal(writes, 1);
  assert.equal(session.getSnapshot().data?.plan?.days.length, 3);
  assert.equal(await session.edit(plan => { plan.days[1].id = plan.days[0].id; }), false);
  assert.equal(writes, 1);
  assert.ok(session.getSnapshot().error);
});


test("open drafts defer external reads and replay after dismissal", async () => {
  let reads = 0;
  const session = new PlanSession("trip", { load: async () => view(++reads), save: async () => { throw new Error("Unexpected save"); } });
  await session.refresh();
  session.setEditing(true);
  await session.refresh(); await session.refresh();
  assert.equal(reads, 1);
  assert.equal(session.getSnapshot().data?.revision, 1);
  session.setEditing(false);
  await Promise.resolve();
  assert.equal(reads, 2);
  assert.equal(session.getSnapshot().data?.revision, 2);
});

test("opening an editor invalidates a read already in flight", async () => {
  const late = deferred<PlanView>();
  let reads = 0;
  let savedRevision = -1;
  const session = new PlanSession("trip", {
    load: async () => ++reads === 1 ? view() : late.promise,
    save: async (_reference, revision) => { savedRevision = revision; throw new PlanRequestError("Changed elsewhere", 409); },
  });
  await session.refresh();
  const reading = session.refresh();
  session.setEditing(true);
  late.resolve(view(2)); await reading;
  assert.equal(session.getSnapshot().data?.revision, 1);
  assert.equal(session.getSnapshot().loading, false);
  assert.equal(await session.edit(plan => { plan.days[0].title = "My draft"; }), false);
  assert.equal(savedRevision, 1);
  assert.equal(session.getSnapshot().failure, "conflict");
  assert.equal(session.getSnapshot().pending?.plan.days[0].title, "My draft");
});

test("conflicts cannot retry or become retryable after a failed reload", async () => {
  let reads = 0, writes = 0;
  const session = new PlanSession("trip", {
    load: async () => { if (++reads > 1) throw new Error("Offline"); return view(); },
    save: async () => { writes++; throw new PlanRequestError("Changed elsewhere", 409); },
  });
  await session.refresh(); await session.edit(plan => { plan.days[0].title = "Retain me"; });
  assert.equal(await session.retry(), false);
  await session.refresh(true);
  assert.equal(session.getSnapshot().failure, "conflict");
  assert.equal(await session.retry(), false);
  assert.equal(writes, 1);
  assert.equal(session.getSnapshot().pending?.plan.days[0].title, "Retain me");
});

test("successful modal saves release queued refresh only after closing", async () => {
  let reads = 0;
  const session = new PlanSession("trip", {
    load: async () => view(++reads === 1 ? 1 : 3),
    save: async (_ref, _revision, plan) => ({ savedRevision: 2, snapshot: { plan, revision: 2 } }),
  });
  await session.refresh(); session.setEditing(true); await session.refresh();
  assert.equal(await session.edit(plan => { plan.days[0].title = "Edited"; }), true);
  assert.equal(reads, 1);
  assert.equal(session.getSnapshot().data?.plan?.days[0].title, "Edited");
  session.setEditing(false); await Promise.resolve();
  assert.equal(session.getSnapshot().data?.revision, 3);
});
