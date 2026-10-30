import assert from "node:assert/strict";
import { test } from "node:test";
import { selectCoverPhotos } from "../services/projects/project-covers/selection";
import { handleProjectCover } from "../services/projects/project-covers";
import { examplePlan } from "./plan-fixture";
import italy from "../data/italy.json";
import photos from "../data/place-photos.json";
import type { Place, PlacePhoto } from "../lib/catalog";

const catalog: Place[] = italy.map(place => ({ ...place, photo: photos.find(photo => photo.place_id === place.id) as PlacePhoto }));
function planWithDays(days: number[][]) {
  const plan = examplePlan();
  const template = plan.items["visit-1"];
  plan.items = {};
  days.forEach((places, day) => {
    plan.days[day].itemIds = places.map((place, index) => {
      const id = `visit-${day}-${index}`;
      plan.items[id] = { ...template, id, kind: "visit", location: { type: "catalog", placeId: catalog[place].id } } as typeof template;
      return id;
    });
  });
  return plan;
}
const ids = (plan: ReturnType<typeof examplePlan>, places = catalog) => selectCoverPhotos(plan, places).map(photo => photo.placeId);

test("covers represent three days with distinct places in itinerary order", () => {
  assert.deepEqual(ids(planWithDays([[0, 1], [2], [3]])), [0, 2, 3].map(index => catalog[index].id));
  assert.deepEqual(ids(planWithDays([[0, 1, 2], [], []])), [0, 1, 2].map(index => catalog[index].id));
  assert.deepEqual(ids(planWithDays([[0, 1], [0], [2]])), [0, 1, 2].map(index => catalog[index].id));
});

test("missing photos and sparse plans never invent or duplicate padding", () => {
  assert.deepEqual(selectCoverPhotos(null, catalog), []);
  assert.deepEqual(ids(planWithDays([[], [], []])), []);
  assert.equal(ids(planWithDays([[0], [0], [0]])).length, 1);
  const missing = catalog.map((place, index) => index === 0 ? { ...place, photo: null } : place);
  assert.deepEqual(ids(planWithDays([[0, 1], [2], []]), missing), [1, 2].map(index => catalog[index].id));
  const reused = catalog.map((place, index) => index === 1 ? { ...place, photo: catalog[0].photo } : place);
  assert.deepEqual(ids(planWithDays([[0], [1], [2]]), reused), [0, 2].map(index => catalog[index].id));
});

test("covers follow saved membership and resolve references without cancelled or orphaned items", () => {
  const plan = planWithDays([[0, 1], [2], []]);
  plan.items["visit-0-0"].reservation = { state: "cancelled", basis: { kind: "user", sources: [], explanation: null } };
  const linked = plan.items["visit-1-0"];
  if (linked.kind !== "travel") linked.location = { type: "item", itemId: "visit-0-1" };
  plan.items.orphan = { ...plan.items["visit-0-0"], id: "orphan", reservation: null };
  assert.deepEqual(ids(plan), [catalog[1].id]);
  if (linked.kind !== "travel") linked.location = { type: "item", itemId: linked.id };
  assert.deepEqual(ids(plan), [catalog[1].id]);
  plan.days[0].itemIds = [];
  assert.deepEqual(ids(plan), []);
});

test("preview endpoint validates references and origin before reading storage", async () => {
  const invalid = await handleProjectCover(new Request("http://localhost/api/trips/bad/preview"), "bad");
  assert.equal(invalid.status, 400);
  const reference = "e6ed7596-1637-4b52-8224-418aec99e175";
  const foreign = await handleProjectCover(new Request(`http://localhost/api/trips/${reference}/preview`, { headers: { origin: "https://unrelated.example" } }), reference);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get("Cache-Control"), "no-store");
});

test("preview reads the saved plan and photos, returns no private plan content, and skips catalog for empty plans", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://cover-test.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const reference = "e6ed7596-1637-4b52-8224-418aec99e175";
  let plan: ReturnType<typeof examplePlan> | null = planWithDays([[0], [1], [2]]);
  let catalogReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/rpc/plan_get") {
      assert.deepEqual(JSON.parse(String(init?.body)), { p_trip: reference });
      return Response.json({ revision: 4, plan });
    }
    assert.equal(url.pathname, "/rest/v1/places");
    assert.equal(init?.method ?? "GET", "GET");
    catalogReads++;
    return Response.json(catalog.map((place, source_order) => ({ ...place, source_order })));
  };
  try {
    const request = new Request(`http://localhost/api/trips/${reference}/preview`);
    const result = await handleProjectCover(request, reference);
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.deepEqual(Object.keys(body), ["photos"]);
    assert.equal(body.photos.length, 3);
    assert.equal(result.headers.get("Referrer-Policy"), "no-referrer");
    plan = null;
    const empty = await handleProjectCover(request, reference);
    assert.deepEqual(await empty.json(), { photos: [] });
    assert.equal(catalogReads, 1);
    globalThis.fetch = async () => { throw new Error("offline"); };
    const failure = await handleProjectCover(request, reference);
    assert.equal(failure.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});
