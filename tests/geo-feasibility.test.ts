import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, beforeEach, afterEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, seed, databaseFetch, reference, otherTrip, conversation, generation } from "./chat-fixture";
import { examplePlan, assumption, fixturePricedBudget } from "./plan-fixture";
import { restaurantLocation } from "./restaurant-fixture";
import { checkJourneys, inspectGeoSources, journeyFingerprint, handleJourneys } from "../services/feasibility";
import { resolvePlace } from "../services/geo";
import { matchPosition } from "../services/geo/matching";
import { openSession } from "../services/workspace";
import { beginTurn } from "../services/conversations";
import { getPlan, savePlan } from "../services/plans";
import { places } from "../services/plans/catalog";
import type { ActivityItem, Plan } from "../lib/plan";
let db: PGlite;
const oldFetch = globalThis.fetch;
const keys = ["HEIGIT_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "AGENT_WEB_SEARCH"];
const oldEnv = keys.map(key => process.env[key]);
let routeCalls: number, positionCalls: number, seconds: number, failRoute: boolean;
before(async () => { db = await createDatabase(); });
after(() => db.close());
beforeEach(async () => {
  await seed(db); routeCalls = positionCalls = 0; seconds = 600; failRoute = false;
  Object.assign(process.env, { HEIGIT_API_KEY: "fixture-heigit", SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_fixture", AGENT_WEB_SEARCH: "false" });
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname === "db.example") return databaseFetch(db, target, init);
    assert.equal(target.hostname, "api.heigit.org", "No unrelated or live provider calls");
    assert.equal(new Headers(init?.headers).get("Authorization"), "fixture-heigit");
    if (target.pathname === "/pelias/v1/search") { positionCalls++; assert.equal(target.searchParams.get("boundary.country"), "ITA"); return Response.json(positionResponse()); }
    routeCalls++;
    assert.match(target.pathname, /\/openrouteservice\/v2\/directions\/(foot-walking|driving-car)\/geojson/);
    const body = JSON.parse(String(init?.body)); assert.deepEqual(body.options.avoid_features, ["ferries"]);
    if (failRoute) return Response.json({ error: "No route" }, { status: 404 });
    return Response.json({ features: [{ properties: { summary: { distance: 1000, duration: seconds } }, geometry: { type: "LineString", coordinates: body.coordinates } }] });
  };
});
afterEach(() => { globalThis.fetch = oldFetch; keys.forEach((key, i) => { if (oldEnv[i] === undefined) delete process.env[key]; else process.env[key] = oldEnv[i]; }); });
function positionResponse(city = "Roma", house = "10", layer = "address", coords = [12.5, 41.9]) {
  return { features: [{ geometry: { type: "Point", coordinates: coords }, properties: { name: "Fixture Hotel", label: "Via Example 10, Roma", locality: city, country_a: "ITA", layer, street: "Via Example", housenumber: house, confidence: 0.99 } }] };
}
function plan(): Plan {
  const result = examplePlan(), a = result.items["visit-1"] as ActivityItem;
  a.timing = { period: null, start: { date: null, time: "09:00", binding: "suggested", basis: assumption }, end: null, duration: { minMinutes: 50, maxMinutes: 60, basis: assumption } };
  result.items.b = { ...structuredClone(a), id: "b", location: { type: "catalog", placeId: places[1].id }, timing: { ...a.timing, start: { ...a.timing.start!, time: "10:30" } } };
  result.days[0].itemIds.push("b"); return result;
}
const signal = () => new AbortController().signal;
test("matching checks country, city, street, house and precision instead of trusting top score", () => {
  const query = { name: "Fixture Hotel", address: "Via Example 10", city: "Rome" };
  assert.equal(matchPosition(query, positionResponse()).status, "matched");
  for (const response of [positionResponse("Milano"), positionResponse("Roma", "11"), positionResponse("Roma", "10", "street")])
    assert.equal(matchPosition(query, response).status, "ambiguous");
  const two = positionResponse(); two.features.push(positionResponse("Roma", "10", "address", [12.6, 41.95]).features[0]);
  assert.equal(matchPosition(query, two).status, "ambiguous");
});
test("map position evidence is persisted, scoped, reused and validated against the saved venue", async () => {
  const query = { name: "Fixture Hotel", address: "Via Example 10", city: "Rome" };
  const position = (await resolvePlace(reference, query, signal()))!;
  assert.equal(position.payload.status, "matched"); assert.deepEqual(position.payload.coordinates, [12.5, 41.9]);
  assert.equal((await resolvePlace(reference, query, signal()))!.id, position.id); assert.equal(positionCalls, 1);
  const p = examplePlan();
  p.items.hotel = { id: "hotel", kind: "stay", title: query.name, reason: null, optional: false, keep: null, reservation: null,
    location: { ...restaurantLocation(), type: "hotel", label: query.name, address: query.address, city: query.city, longitude: 12.5, latitude: 41.9, geoEvidenceId: position.id,
      basis: { kind: "research", explanation: null, sources: [...restaurantLocation().basis.sources, { type: "geo", evidenceId: position.id }] } },
    coverage: { type: "nights", afterDayIds: ["day-1", "day-2"], basis: assumption } };
  assert.deepEqual(await inspectGeoSources(reference, p, signal()), []);
  assert.ok((await inspectGeoSources(otherTrip, p, signal())).length);
  const hotel = p.items.hotel; if (hotel.kind !== "stay") throw new Error();
  const changed = { ...hotel.location, label: "Wrong branch" } as typeof hotel.location;
  p.days[0].startLocation = changed;
  assert.ok((await inspectGeoSources(reference, p, signal())).some(f => f.code === "geo_source"));
});
test("implicit route evidence is cached, time edits recompute conflicts and changed endpoints select new routes", async () => {
  const p = plan();
  const first = await checkJourneys(reference, p, places, signal());
  assert.equal(first.legs[0].status, "checked"); assert.equal(first.legs[0].reservedMinutes, 20); assert.equal(routeCalls, 1);
  assert.deepEqual(first.legs[0].geometry![0], [places[0].longitude, places[0].latitude]);
  const titled = structuredClone(p); titled.days[0].title = "Renamed";
  assert.equal(journeyFingerprint(titled), first.fingerprint);
  (p.items.b as ActivityItem).timing.start!.time = "10:05";
  const short = await checkJourneys(reference, p, places, signal());
  assert.equal(short.legs[0].status, "conflict"); assert.notEqual(short.fingerprint, first.fingerprint); assert.equal(routeCalls, 1);
  assert.ok(short.findings.some(f => f.code === "journey_time" && f.severity === "error"));
  (p.items.b as ActivityItem).location = { type: "catalog", placeId: places[2].id };
  await checkJourneys(reference, p, places, signal()); assert.equal(routeCalls, 2);
});
test("explicit travel is checked once and its allocation cannot borrow spare time before the next activity", async () => {
  const p = plan();
  p.items.walk = { id: "walk", kind: "travel", title: "Walk", reason: null, optional: false, keep: null, reservation: null,
    from: { type: "item", itemId: "visit-1" }, to: { type: "item", itemId: "b" }, mode: "walk", timing: { type: "interval", schedule: {
      period: null, start: { date: null, time: "10:00", binding: "suggested", basis: assumption }, end: null, duration: { minMinutes: 5, maxMinutes: 5, basis: assumption } } } };
  p.days[0].itemIds = ["visit-1", "walk", "b"];
  const result = await checkJourneys(reference, p, places, signal());
  assert.equal(result.legs.length, 1); assert.equal(result.legs[0].status, "conflict"); assert.equal(routeCalls, 1);
});
test("API failures, unsupported transport and missing positions remain unverified with null amounts", async () => {
  failRoute = true;
  const result = await checkJourneys(reference, plan(), places, signal());
  assert.equal(result.legs[0].status, "unverified"); assert.equal(result.legs[0].durationSeconds, null); assert.equal(result.legs[0].distanceMeters, null);
  assert.equal(result.status, "unverified");
  const p = plan(); (p.items.b as ActivityItem).location = { type: "area", label: "City center", basis: assumption };
  assert.equal((await checkJourneys(reference, p, places, signal())).legs[0].status, "unverified");
});
test("direct saves reject route conflicts and explicit acknowledgment never becomes a checked route", async () => {
  const p = plan(); (p.items.b as ActivityItem).timing.start!.time = "10:05";
  await assert.rejects(savePlan(reference, 0, p, randomUUID()), /Allow 20 minutes/);
  assert.equal((await getPlan(reference)).plan, null);
  p.notes.push({ id: "conflict", kind: "conflict", text: "Unresolved journey timing", relatedItemIds: ["visit-1", "b"], sources: [] });
  const saved = await savePlan(reference, 0, p, randomUUID());
  assert.equal(saved.journeys?.status, "conflict");
  const response = await handleJourneys(new Request(`https://app.example/journeys?day=day-1&revision=${saved.savedRevision}`), reference);
  assert.equal(response.status, 200); assert.equal((await response.json()).report.status, "conflict"); assert.equal(routeCalls, 1);
});
test("agent proposals and final commit use route checks, including evidence expiry before commit", async () => {
  const turn = await beginTurn(reference, { conversationId: conversation, expectedLastId: null, retry: false, message: { id: "geo-user", text: "Plan three days" } }, generation);
  const env = await openSession(reference, conversation, turn.responseId, generation, signal());
  const p = plan(); const first = await env.propose(p, []); assert.equal(first.valid, true);
  env.recordWebSources!(["https://example.com/test-rate"]); await env.proposeBudget!(fixturePricedBudget(), true);
  await db.exec("update geo_evidence set expires_at=now()-interval '1 second' where kind='route'"); seconds = 3600;
  await assert.rejects(env.commit("Cannot save stale route check", ["geo-user"]), /journey or map-source conflicts/);
  assert.equal((await getPlan(reference)).plan, null);
});
test("evidence tables and RPCs are inaccessible to anonymous SQL", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query("select * from geo_evidence"), /permission denied/);
    await assert.rejects(db.query("select geo_read($1,null,null)", [reference]), /permission denied/);
  } finally { await db.exec("reset role"); }
});

test("researched hotels save through agent tools with geo evidence and survive a later manual edit", async () => {
  const { agentTools } = await import("../services/agent/tools");
  const position = (await resolvePlace(reference, { name: "Fixture Hotel", address: "Via Example 10", city: "Rome" }, signal()))!;
  const p = plan();
  p.items.stay = { id: "stay", kind: "stay", title: "Suggested Fixture Hotel", reason: "A researched lodging proposal, not a booking.", optional: false, keep: null, reservation: null,
    location: { type: "hotel", label: "Fixture Hotel", address: "Via Example 10", city: "Rome", latitude: 41.9, longitude: 12.5, geoEvidenceId: position.id,
      basis: { kind: "research", explanation: "Fixture identity and address evidence.", sources: [{ type: "web", url: "https://example.com/hotel", accessedAt: "2026-10-29T00:00:00.000Z" }, { type: "geo", evidenceId: position.id }] } },
    coverage: { type: "nights", afterDayIds: ["day-1", "day-2"], basis: assumption } };
  const turn = await beginTurn(reference, { conversationId: conversation, expectedLastId: null, retry: false, message: { id: "hotel-user", text: "Plan this trip with a hotel" } }, generation);
  const env = await openSession(reference, conversation, turn.responseId, generation, signal());
  assert.ok("resolvePlace" in agentTools(env)); assert.ok("getJourneys" in agentTools(env));
  env.recordWebSources!(["https://example.com/hotel", "https://example.com/test-rate"]);
  assert.equal((await env.propose(p, [])).valid, true);
  await env.proposeBudget!(fixturePricedBudget(), true);
  assert.equal((await env.commit("Saved proposed hotel", ["hotel-user"]) as { saved: boolean }).saved, true);
  const saved = await getPlan(reference), updated = structuredClone(saved.plan!);
  updated.days[0].title = "An independently renamed day";
  const edited = await savePlan(reference, saved.revision, updated, randomUUID());
  assert.deepEqual(edited.snapshot.plan!.items.stay, p.items.stay);
  const report = await handleJourneys(new Request(`https://app.example/journeys?day=day-1&revision=${edited.savedRevision}`), reference);
  const calls = routeCalls; assert.equal(report.status, 200);
  assert.ok((await report.json()).report.legs.some((leg: { geometry?: unknown }) => leg.geometry));
  assert.equal(routeCalls, calls, "Map reads do not call the route provider");
});

test("the database guard rejects geo references borrowed from another trip", async () => {
  const position = (await resolvePlace(reference, { name: "Fixture Hotel", address: "Via Example 10", city: "Rome" }, signal()))!;
  const p = examplePlan(); p.notes.push({ id: "source", kind: "uncertainty", text: "Borrowed evidence", relatedItemIds: [], sources: [{ type: "geo", evidenceId: position.id }] });
  await assert.rejects(db.query("select plan_save($1,0,$2::jsonb,$3)", [otherTrip, JSON.stringify(p), randomUUID()]), /PLAN_SOURCE/);
});

test("unclocked explicit travel still checks its duration against the surrounding gap", async () => {
  const p = plan();
  p.items.walk = { id: "walk", kind: "travel", title: "Walk", reason: null, optional: false, keep: null, reservation: null,
    from: { type: "item", itemId: "visit-1" }, to: { type: "item", itemId: "b" }, mode: "walk", timing: { type: "interval", schedule: {
      period: "morning", start: null, end: null, duration: { minMinutes: 35, maxMinutes: 40, basis: assumption } } } };
  p.days[0].itemIds = ["visit-1", "walk", "b"];
  const result = await checkJourneys(reference, p, places, signal());
  assert.equal(result.legs.length, 1); assert.equal(result.legs[0].status, "conflict");
  assert.match(result.legs[0].reason!, /allocated 40 minutes/);
});

test("a large proposal has a bounded provider-request budget without consuming it on cache hits", async () => {
  const p = plan(); p.items = {};
  p.days[0].itemIds = [];
  for (let i = 0; i < 30; i++) {
    const id = `item-${i}`, minutes = 480 + i * 20;
    p.items[id] = { ...(examplePlan().items["visit-1"] as ActivityItem), id, location: { type: "catalog", placeId: places[i].id },
      timing: { period: null, start: { date: null, time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`, binding: "suggested", basis: assumption }, end: null, duration: { minMinutes: 5, maxMinutes: 5, basis: assumption } } };
    p.days[0].itemIds.push(id);
  }
  const first = await checkJourneys(reference, p, places, signal());
  assert.ok(routeCalls <= 24); assert.ok(first.legs.some(leg => leg.status === "unverified"));
  const before = routeCalls;
  await checkJourneys(reference, p, places, signal());
  assert.ok(routeCalls > before); assert.ok(routeCalls - before <= 24);
});
