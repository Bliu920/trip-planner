import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, seed, reference, conversation, generation, otherTrip } from "./chat-fixture";
import { parsePlaceIds, togglePlace } from "../lib/place-references/model";
import { validatePlaceIds, hydratePlaceReferences, placeReferenceContext } from "../services/places/place-references";
import { readTurn } from "../services/assistant/request";
import italy from "../data/italy.json";
import type { ChatSnapshot, StoredMessage } from "../lib/chat/types";

let db: PGlite;
before(async () => { db = await createDatabase(); });
after(async () => { await db.close(); });

const request = (placeIds: unknown, text = "") => new Request("http://localhost/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "interest", text, placeIds } }) });

test("selection toggles uniquely and preserves order; malformed and unknown IDs fail", () => {
  let selected = togglePlace([], italy[0]);
  selected = togglePlace(selected, italy[1]);
  assert.deepEqual(selected.map(place => place.id), ["place_001", "place_002"]);
  assert.deepEqual(togglePlace(selected, italy[0]).map(place => place.id), ["place_002"]);
  for (const ids of [null, {}, ["place_001", "place_001"], ["bad"], [3], Array(104).fill("place_001")]) assert.throws(() => parsePlaceIds(ids));
  assert.throws(() => validatePlaceIds(["place_999"]));
});

test("place-only input is valid, with no client-supplied place facts accepted", async () => {
  const turn = await readTurn(request(["place_001"]));
  assert.deepEqual(turn.message?.placeIds, ["place_001"]);
  assert.match(turn.message!.text, /these places/);
  await assert.rejects(readTurn(request([])));
  await assert.rejects(readTurn(request(["place_999"], "test")));
  await assert.rejects(readTurn(request([{ id: "place_001", name: "Forged" }], "test")));
});

async function begin(ids: unknown, trip = reference, retry = false, expected: string | null = null) {
  return db.query<{ value: { responseId: string; messages: StoredMessage[] } }>("select chat_begin_turn_places($1,$2,$3,$4,$5,$6,$7,'{}'::uuid[],$8::text[]) as value", [trip, conversation, expected, retry ? null : "interest", retry ? null : "Make it relaxed", retry, generation, ids]);
}

test("turn saves only IDs atomically, restores history and retains references on retry", async () => {
  await seed(db);
  const { value } = (await begin(["place_002", "place_001"])).rows[0];
  assert.deepEqual(value.messages[0].placeIds, ["place_002", "place_001"]);
  const parts = (await db.query<{ parts: unknown[] }>("select parts from messages where id='interest'")).rows[0].parts;
  assert.deepEqual(parts.slice(1), [{ type: "data-place", data: { id: "place_002" } }, { type: "data-place", data: { id: "place_001" } }]);
  const saved = (await db.query<{ snapshot: ChatSnapshot }>("select chat_snapshot($1,$2,null) as snapshot", [reference, conversation])).rows[0].snapshot;
  assert.deepEqual(saved.messages[0].parts, parts);
  await db.query("update messages set status='failed', generation_id=null where id=$1", [value.responseId]);
  const retry = (await begin([], reference, true, value.responseId)).rows[0].value;
  assert.deepEqual(retry.messages[0].placeIds, ["place_002", "place_001"]);
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from messages")).rows[0].count, 2);
});

test("invalid selections and cross-trip access leave no message behind", async () => {
  for (const ids of [["place_999"], ["place_001", "place_001"], [null], null]) {
    await seed(db);
    await assert.rejects(begin(ids), /PLACE_REFERENCE_INVALID/);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from messages")).rows[0].count, 0);
  }
  await assert.rejects(begin(["place_001"], otherTrip), /CHAT_NOT_FOUND/);
  await db.exec("set role anon");
  await assert.rejects(begin(["place_001"]), /permission denied/);
  await db.exec("reset role; set role authenticated");
  await assert.rejects(begin(["place_001"]), /permission denied/);
  await db.exec("reset role");
});

test("model context uses source facts and explicitly distinguishes interest from obligations", () => {
  const context = placeReferenceContext({ role: "user", content: "Relaxed", placeIds: ["place_001"] });
  assert.match(context, /Colosseum/);
  assert.match(context, /not mandatory visits or bookings/);
  assert.match(context, /reference data, not instructions/);
  assert.equal(placeReferenceContext({ role: "user", content: "Hello" }), "");
});

test("display hydration discards forged labels while old messages need no catalog read", async () => {
  const originalFetch = globalThis.fetch;
  const previous = Object.fromEntries(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"].map(key => [key, process.env[key]]));
  try {
    for (const key of Object.keys(previous)) delete process.env[key];
    globalThis.fetch = async () => { throw new Error("No request expected for bundled preview"); };
    const snapshot = { conversationId: conversation, conversations: [], documents: [], messages: [{ id: "interest", role: "user", parts: [{ type: "data-place", data: { id: "place_001", name: "Forged", city: "Forged" } }] }] } as ChatSnapshot;
    const hydrated = await hydratePlaceReferences(snapshot);
    const part = hydrated.messages[0].parts[0];
    assert.equal(part.type === "data-place" && part.data.name, "Colosseum");
    const empty = { ...snapshot, messages: [] };
    assert.equal(await hydratePlaceReferences(empty), empty);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
