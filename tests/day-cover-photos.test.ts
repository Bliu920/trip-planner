import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadDayCoverPhotos } from "../services/catalog";
import { presentPlan } from "../lib/plan/presentation/model";
import { examplePlan } from "./plan-fixture";
import places from "../data/italy.json";
import placePhotos from "../data/place-photos.json";

let db: PGlite;
let rows: { slot: number; url: string; source_url: string; photographer: string; alt: string }[];
before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile(new URL("../supabase/migrations/20261028102639_day_cover_photos.sql", import.meta.url), "utf8"));
  rows = (await db.query<typeof rows[number]>("select * from day_cover_photos order by slot")).rows;
});
after(() => db.close());

test("migration seeds three distinct attributed covers without reusing catalog photos", async () => {
  assert.deepEqual(rows.map(row => row.slot), [1, 2, 3]);
  assert.equal(new Set(rows.map(row => row.url)).size, 3);
  for (const row of rows) {
    assert.ok(row.photographer && row.source_url && row.alt);
    assert.ok(!placePhotos.some(photo => photo.url === row.url));
  }
  await assert.rejects(db.query("insert into day_cover_photos select 4,url,source_url,photographer,alt,verified_at from day_cover_photos where slot=1"));
  await assert.rejects(db.query("update day_cover_photos set url=$1 where slot=2", [rows[0].url]), /unique/);
  await assert.rejects(db.query("update day_cover_photos set url='https://attacker.example/a.jpg' where slot=1"), /check/);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try { await assert.rejects(db.query("select * from day_cover_photos"), /permission denied/); }
    finally { await db.exec("reset role"); }
  }
  await db.exec("set role service_role");
  try { assert.equal((await db.query("select * from day_cover_photos")).rows.length, 3); }
  finally { await db.exec("reset role"); }
});

async function withPool(value: unknown, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = "https://fixture.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/rest/v1/day_cover_photos");
    assert.equal(url.searchParams.get("order"), "slot.asc");
    assert.equal(new Headers(init?.headers).get("apikey"), "sb_secret_fixture");
    return value instanceof Response ? value : Response.json(value);
  };
  try { await run(); }
  finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("database covers stay assigned by day while selected place photos retain priority", async () => {
  await withPool(rows, async () => {
    const pool = await loadDayCoverPhotos();
    assert.equal(pool.length, 3);
    assert.equal(pool[0].credit, rows[0].photographer);
    assert.equal(pool[0].creditUrl, rows[0].source_url);
    const plan = examplePlan();
    const before = structuredClone(plan);
    const primary = { src: "https://example.com/place.jpg", alt: "Place", credit: "Author", creditUrl: "https://example.com" };
    const result = presentPlan(plan, places, { place_001: primary }, pool);
    assert.equal(result.days[0].photo, primary);
    assert.deepEqual(result.days.map(day => day.fallbackPhoto), pool);
    assert.equal(result.days[1].photo, null);
    plan.days[0].itemIds = [];
    const empty = presentPlan(plan, places, {}, pool);
    assert.equal(new Set(empty.days.map(day => day.fallbackPhoto?.src)).size, 3);
    assert.deepEqual(result.days.map(day => day.id), before.days.map(day => day.id));
  });
});

test("invalid, duplicate or unavailable pools degrade without blocking the plan", async () => {
  for (const value of [rows.slice(0, 2), [...rows].reverse(), [rows[0], { ...rows[1], url: rows[0].url }, rows[2]], [{ ...rows[0], source_url: "https://attacker.example/photo/a" }, ...rows.slice(1)], new Response(null, { status: 503 })]) {
    await withPool(value, async () => assert.deepEqual(await loadDayCoverPhotos(), []));
  }
  const result = presentPlan(examplePlan(), places);
  assert.ok(result.days.every(day => day.fallbackPhoto === null));
  assert.equal(result.days.length, 3);
});
