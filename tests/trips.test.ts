import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handleTrip } from "../services/projects/trips/index";
import { forgetTrip, readRecent, rememberTrip, STORAGE_KEY } from "../lib/trips/storage";
import type { Trip } from "../lib/trips/types";

const reference = "12fd9d92-d38d-4a5e-93c1-09747c76a964";
const trip: Trip = { reference, name: "Florence", notes: "Museums", created_at: "2026-10-23T00:00:00Z", updated_at: "2026-10-23T00:00:00Z" };
const originalFetch = globalThis.fetch;
const originalEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries({ SUPABASE_URL: originalEnv.url, SUPABASE_SECRET_KEY: originalEnv.key })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function configure() { process.env.SUPABASE_URL = "https://database.example"; process.env.SUPABASE_SECRET_KEY = "sb_secret_test"; }
function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/trips", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("invalid and query-injected references never reach the database", async () => {
  globalThis.fetch = async () => { throw new Error("Unexpected database call"); };
  for (const id of ["123", `${reference}&select=*`, "", "../../trips"]) {
    const response = await handleTrip(request("GET"), id);
    assert.equal(response.status, 400);
  }
});

test("create generates its own UUID and only persists validated fields", async () => {
  configure();
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).pathname, "/rest/v1/trips");
    const body = JSON.parse(String(init?.body));
    assert.match(body.reference, /^[0-9a-f-]{14}4[0-9a-f-]{21}$/);
    assert.notEqual(body.reference, reference);
    assert.equal(body.name, "Rome");
    assert.equal(body.notes, "");
    assert.equal(body.admin, undefined);
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    assert.equal(new Headers(init?.headers).get("apikey"), "sb_secret_test");
    return Response.json([{ ...trip, ...body }]);
  };
  const response = await handleTrip(request("POST", { name: " Rome ", reference, admin: true }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("resume scopes the query to the exact normalized reference", async () => {
  configure();
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).searchParams.get("reference"), `eq.${reference}`);
    assert.equal(init?.cache, "no-store");
    return Response.json([trip]);
  };
  const response = await handleTrip(request("GET"), reference.toUpperCase());
  assert.deepEqual(await response.json(), trip);
});

test("save scopes the update and persists name and notes", async () => {
  configure();
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.method, "PATCH");
    assert.equal(new URL(String(url)).searchParams.get("reference"), `eq.${reference}`);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, { name: "Venice", notes: "Walk" });
    return Response.json([{ ...trip, ...body }]);
  };
  assert.equal((await handleTrip(request("PATCH", { name: "Venice", notes: "Walk" }), reference)).status, 200);
});

test("renaming only updates the name and preserves current trip notes", async () => {
  configure();
  globalThis.fetch = async (_url, init) => {
    const change = JSON.parse(String(init?.body));
    assert.deepEqual(change, { name: "A relaxed Florence trip" });
    return Response.json([{ ...trip, ...change }]);
  };
  const response = await handleTrip(request("PATCH", { name: " A relaxed Florence trip " }), reference);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).notes, "Museums");
});

test("missing trip returns 404 for reads and updates", async () => {
  configure(); globalThis.fetch = async () => Response.json([]);
  assert.equal((await handleTrip(request("GET"), reference)).status, 404);
  assert.equal((await handleTrip(request("PATCH", { name: "Rome" }), reference)).status, 404);
});

test("missing configuration is actionable and does not leak secrets", async () => {
  delete process.env.SUPABASE_URL;
  const response = await handleTrip(request("GET"), reference);
  assert.equal(response.status, 503);
  const message = (await response.json()).error;
  assert.match(message, /temporarily unavailable/);
  assert.doesNotMatch(message, /Supabase|migration|database|configur/i);
});

test("database errors are sanitized", async () => {
  configure(); globalThis.fetch = async () => new Response("sensitive database details", { status: 500 });
  const response = await handleTrip(request("GET"), reference);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /sensitive/);
});

test("malformed and excessive input is rejected", async () => {
  for (const body of [{ name: " " }, { name: "x".repeat(101) }, { name: "Rome", notes: 10 }, { name: "Rome", notes: "x".repeat(5001) }, null]) {
    assert.equal((await handleTrip(request("POST", body))).status, 400);
  }
  assert.equal((await handleTrip(request("POST", { name: "x".repeat(25000) }))).status, 413);
  const malformed = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal((await handleTrip(malformed)).status, 400);
});

function storage() {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  } } });
  return entries;
}

test("remembered trips survive reads, deduplicate, and forget locally", () => {
  storage();
  assert.deepEqual(readRecent(), []);
  assert.equal(rememberTrip(trip), true);
  rememberTrip({ ...trip, name: "New name" });
  assert.equal(readRecent().length, 1);
  assert.equal(readRecent()[0].name, "New name");
  forgetTrip(reference);
  assert.deepEqual(readRecent(), []);
});

test("corrupt local data can recover when a trip is resumed", () => {
  const entries = storage(); entries.set(STORAGE_KEY, "bad json");
  assert.throws(readRecent);
  assert.equal(rememberTrip(trip), true);
  assert.equal(readRecent()[0].reference, reference);
});

test("unavailable local storage does not prevent online saving", () => {
  Object.defineProperty(globalThis, "window", { configurable: true, get() { throw new Error("Storage denied"); } });
  assert.equal(rememberTrip(trip), false);
  delete (globalThis as { window?: unknown }).window;
});
