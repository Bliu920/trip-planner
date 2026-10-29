import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, seed, reference, otherTrip, conversation, generation } from "./chat-fixture";
import type { ChatSnapshot } from "../lib/chat/types";

let db: PGlite;
before(async () => { db = await createDatabase(); });
after(async () => { await db.close(); });
beforeEach(async () => { await seed(db); });
async function snapshot(trip = reference, id: string | null = conversation, newId: string | null = null) {
  return (await db.query<{ data: ChatSnapshot }>("select public.chat_snapshot($1,$2,$3) as data", [trip, id, newId])).rows[0].data;
}
async function begin(expected: string | null = null, user = "user_1", retry = false, token = generation) {
  return (await db.query<{ data: { responseId: string } }>("select public.chat_begin_turn($1,$2,$3,$4,$5,$6,$7) as data", [reference, conversation, expected, user, "Hello", retry, token])).rows[0].data;
}
async function save(message: string, status: string, token = generation, trip = reference) {
  return (await db.query<{ saved: boolean }>("select public.chat_write_reply($1,$2,$3,$4,$5,$6) as saved", [trip, conversation, message, token, "Partial reply", status])).rows[0].saved;
}

test("new conversations preserve earlier messages and are isolated by trip", async () => {
  const turn = await begin(); await save(turn.responseId, "complete");
  const nextId = randomUUID();
  const fresh = await snapshot(reference, null, nextId);
  assert.equal(fresh.messages.length, 0); assert.equal(fresh.conversations.length, 2);
  assert.equal((await snapshot()).messages.length, 2);
  assert.equal((await snapshot(reference, null, nextId)).conversations.length, 2);
  assert.equal((await snapshot(reference, null)).conversationId, nextId);
  await assert.rejects(snapshot(otherTrip), /CHAT_NOT_FOUND/);
  await assert.rejects(snapshot(otherTrip, null, conversation), /CHAT_NOT_FOUND/);
  assert.equal((await snapshot(otherTrip, null)).conversations.length, 1);
});

test("active generation rejects another turn and stale writers cannot overwrite retries", async () => {
  const first = await begin();
  await assert.rejects(begin(first.responseId, "user_2"), /CHAT_BUSY/);
  await save(first.responseId, "failed");
  const nextToken = randomUUID(); await begin(first.responseId, "ignored", true, nextToken);
  assert.equal(await save(first.responseId, "complete", generation), false);
  assert.equal(await save(first.responseId, "complete", nextToken, otherTrip), false);
  assert.equal(await save(first.responseId, "complete", nextToken), true);
  assert.equal((await snapshot()).messages.length, 2);
});

test("expired generation retains checkpointed text and becomes interrupted", async () => {
  const turn = await begin(); await save(turn.responseId, "streaming");
  await db.query("update public.messages set updated_at = now() - interval '91 seconds' where id = $1", [turn.responseId]);
  const loaded = await snapshot();
  assert.equal(loaded.messages[1].metadata?.status, "interrupted");
  assert.deepEqual(loaded.messages[1].parts, [{ type: "text", text: "Partial reply" }]);
  assert.equal(await save(turn.responseId, "complete"), false);
});

test("anonymous roles cannot read tables or execute chat operations", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const table of ["conversations", "messages"]) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
    await assert.rejects(snapshot(), /permission denied/);
    await assert.rejects(begin(), /permission denied/);
    await assert.rejects(save("any", "complete"), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal((await snapshot()).conversationId, conversation);
  const turn = await begin(); assert.equal(await save(turn.responseId, "complete"), true);
  await db.exec("reset role");
});
