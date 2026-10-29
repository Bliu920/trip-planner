import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import italy from "../data/italy.json";
import photos from "../data/place-photos.json";
import { photoUrl } from "../lib/catalog";
import { photoSchema, photoManifestSchema, placeSchema } from "../services/catalog/validation";
import { readCatalog } from "../services/catalog/database";

const images = photoManifestSchema.parse(photos);

test("every original place has one attributed photo with an explicit match classification", () => {
  assert.equal(images.length, italy.length);
  assert.deepEqual(images.map(photo => photo.place_id), italy.map(place => place.id));
  assert.equal(new Set(images.map(photo => photo.place_id)).size, italy.length);
  assert.ok(images.some(photo => photo.match === "place"));
  assert.ok(images.some(photo => photo.match === "illustrative"));
  assert.equal(new Set(images.map(photo => `${photo.provider}:${photo.provider_id}`)).size, italy.length);
  assert.ok(new URL(photoUrl(images[0], 400)).searchParams.get("w") === "400");
  assert.equal(photoSchema.safeParse({ ...images[0], url: "https://images.pexels.com.attacker.example/photo.jpg" }).success, false);
  assert.equal(photoSchema.safeParse({ ...images[0], source_url: "javascript:alert(1)" }).success, false);
  assert.equal(photoSchema.safeParse({ ...images[0], url: "not-a-url" }).success, false);
});

test("photo imports reject reused assets and alternate crop URLs", () => {
  assert.equal(photoManifestSchema.safeParse([images[0], images[1]]).success, true);
  assert.equal(photoManifestSchema.safeParse([images[0], { ...images[0], place_id: images[1].place_id, url: images[1].url }]).success, false);
  assert.equal(photoManifestSchema.safeParse([images[0], { ...images[1], url: `${images[0].url}?w=800&crop=faces` }]).success, false);
});

test("migration preserves source facts and keeps enrichment separate, with client access denied", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await readFile(new URL("../supabase/migrations/20261026160311_catalog.sql", import.meta.url), "utf8"));
    await db.query("insert into places select * from json_populate_recordset(null::places, $1::json)", [JSON.stringify(italy.map((place, source_order) => ({ ...place, source_order })))]);
    await db.query("insert into place_photos select * from json_populate_recordset(null::place_photos, $1::json)", [JSON.stringify(images)]);
    const stored = await db.query<{ place: unknown }>("select to_jsonb(p) - 'source_order' as place from places p order by source_order");
    assert.deepEqual(stored.rows.map(row => row.place), italy);
    await db.query("update place_photos set alt = $1 where place_id = 'place_001'", ["Updated image caption"]);
    assert.equal((await db.query<{ total: number }>("select count(*)::int as total from places")).rows[0].total, 103);
    assert.equal((await db.query<{ description: string }>("select description from places where id = 'place_001'")).rows[0].description, italy[0].description);
    await assert.rejects(db.query("update place_photos set place_id = 'place_999' where place_id = 'place_001'"), /foreign key/);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from places"), /permission denied/);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(db.query("update place_photos set alt = 'changed'"), /permission denied/);
    await db.exec("reset role; set role service_role");
    assert.equal((await db.query<{ total: number }>("select count(*)::int as total from place_photos")).rows[0].total, 103);
  } finally { await db.close(); }
});

test("SQL adapter validates joined records and strips storage-only fields", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/rest/v1/places");
      assert.equal(url.searchParams.get("order"), "source_order.asc");
      assert.equal(new Headers(init?.headers).get("apikey"), "sb_secret_test");
      assert.equal(new Headers(init?.headers).get("authorization"), null);
      return Response.json([{ ...italy[0], source_order: 0, photo: images[0] }]);
    };
    const rows = await readCatalog("https://database.example", "sb_secret_test");
    assert.deepEqual(rows, [{ ...italy[0], photo: images[0] }]);
    assert.ok(placeSchema.safeParse(rows![0]).success);
    globalThis.fetch = async () => Response.json([{ ...italy[0], photo: images[1] }]);
    await assert.rejects(readCatalog("https://database.example", "sb_secret_test"), /does not match/);
  } finally { globalThis.fetch = originalFetch; }
});

test("only a missing table permits pre-migration preview; other database failures remain visible", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ code: "PGRST205" }, { status: 404 });
    assert.equal(await readCatalog("https://database.example", "test"), null);
    globalThis.fetch = async () => Response.json({ error: "private detail" }, { status: 401 });
    await assert.rejects(readCatalog("https://database.example", "test"), { message: "Catalog unavailable (401)." });
    globalThis.fetch = async () => Response.json([{ ...italy[0], rating: "invalid" }]);
    await assert.rejects(readCatalog("https://database.example", "test"));
  } finally { globalThis.fetch = originalFetch; }
});
