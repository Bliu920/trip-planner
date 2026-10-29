import assert from "node:assert/strict";
import { test } from "node:test";
import { BudgetSession } from "../lib/budget/ui/session";
import { unknownBudget } from "./plan-fixture";
import type { BudgetView } from "../lib/budget";
const view = (revision = 1): BudgetView => ({ budget: unknownBudget(), revision, plan: null, needsReview: false });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
test("budget reads cannot replace newer snapshots or publish after unmount", async () => {
  const first = deferred<BudgetView>(), second = deferred<BudgetView>(); let reads = 0;
  const session = new BudgetSession("trip", { load: () => ++reads === 1 ? first.promise : second.promise, save: async () => view() });
  const a = session.refresh(), b = session.refresh();
  second.resolve(view(3)); await b; first.resolve(view(2)); await a;
  assert.equal(session.getSnapshot().data?.revision, 3);
  const late = deferred<BudgetView>();
  const stopped = new BudgetSession("trip", { load: () => late.promise, save: async () => view() });
  const pending = stopped.refresh(); stopped.stop(); late.resolve(view()); await pending;
  assert.equal(stopped.getSnapshot().data, null);
});
test("stale budget forms cannot overwrite a newer agent change", async () => {
  let revision = 1, writes = 0;
  const session = new BudgetSession("trip", { load: async () => view(revision), save: async () => { writes++; return view(); } });
  await session.refresh(); revision = 2; await session.refresh();
  assert.equal(await session.edit(unknownBudget(), 1, true), false);
  assert.equal(writes, 0);
  assert.match(session.getSnapshot().error, /form was open/);
});
test("lost save responses retain the exact request and lock subsequent edits", async () => {
  const writes: unknown[] = [];
  const session = new BudgetSession("trip", { load: async () => view(), save: async (_ref, change) => {
    writes.push(structuredClone(change)); if (writes.length === 1) throw new Error("Response lost"); return view(3);
  } });
  await session.refresh();
  assert.equal(await session.edit(unknownBudget(), 1, true), false);
  assert.equal(session.getSnapshot().data?.revision, 1);
  assert.equal(await session.edit(unknownBudget(), 1, true), false);
  assert.equal(await session.retry(), true);
  assert.deepEqual(writes[0], writes[1]);
  assert.equal(session.getSnapshot().data?.revision, 3);
});
test("budget refresh during a save is queued and reapplied", async () => {
  const saving = deferred<BudgetView>(); let reads = 0;
  const session = new BudgetSession("trip", { load: async () => view(++reads === 1 ? 1 : 3), save: () => saving.promise });
  await session.refresh();
  const writing = session.edit(unknownBudget(), 1, true);
  await session.refresh(); assert.equal(reads, 1);
  saving.resolve(view(2)); await writing; await Promise.resolve();
  assert.equal(session.getSnapshot().data?.revision, 3);
});
