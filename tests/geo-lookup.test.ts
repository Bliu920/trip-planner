import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { matchPosition, streetAddress } from "../services/places/geo/matching";
import { searchPosition } from "../services/places/geo/client";
const originalFetch = globalThis.fetch, originalInfo = console.info, originalKey = process.env.HEIGIT_API_KEY;
afterEach(() => { globalThis.fetch = originalFetch; console.info = originalInfo; if (originalKey === undefined) delete process.env.HEIGIT_API_KEY; else process.env.HEIGIT_API_KEY = originalKey; });
const query = { name: "Albergo del Senato", address: "Piazza della Rotonda 73, 00186 Roma RM, Italy", city: "Rome" };
const candidate = (street = "Piazza della Rotonda", house = "73", city = "Roma", country = "ITA", layer = "address", coordinates = [12.477, 41.899]) => ({ geometry: { type: "Point", coordinates }, properties: { name: "Address", street, housenumber: house, locality: city, country_a: country, layer } });
const response = (...features: ReturnType<typeof candidate>[]) => ({ features });
test("full postal addresses retain exact street and house checks", () => {
  for (const address of [query.address, "Piazza della Rotonda, 73, 00186 Roma (RM), Italy", "Piazza della Rotonda 73, Roma, Italia", "Piazza della Rotonda 73"]) {
    assert.match(streetAddress({ ...query, address }), /73$/);
    assert.equal(matchPosition({ ...query, address }, response(candidate())).status, "matched");
  }
  for (const value of [candidate("Via della Rotonda"), candidate("Piazza della Rotonda", "74"), candidate("Piazza della Rotonda", "73", "Napoli"), candidate("Piazza della Rotonda", "73", "Roma", "FRA"), candidate("Piazza della Rotonda", "73", "Roma", "ITA", "street")])
    assert.equal(matchPosition(query, response(value)).status, "ambiguous");
  assert.equal(matchPosition({ ...query, address: "Via 20 Settembre 10/A, 00186 Roma RM, Italy" }, response(candidate("Via 20 Settembre", "10A"))).status, "matched");
  assert.equal(matchPosition({ ...query, address: "Via 20 Settembre 10/A" }, response(candidate("Via 21 Settembre", "10A"))).status, "ambiguous");
  assert.equal(matchPosition({ ...query, address: "Via 20 Settembre 10/A" }, response(candidate("Via 20 Settembre", "10"))).status, "ambiguous");
});
test("address fallback preserves original identity and counts actual requests", async () => {
  process.env.HEIGIT_API_KEY = "private-fixture-key";
  const urls: URL[] = [], logs: string[] = []; console.info = value => logs.push(String(value));
  globalThis.fetch = async input => {
    const url = new URL(String(input)); urls.push(url);
    assert.equal(url.hostname, "api.heigit.org"); assert.equal(url.searchParams.get("boundary.country"), "ITA");
    return Response.json(urls.length === 1 ? response(candidate("", "", "Roma", "ITA", "venue")) : response(candidate()));
  };
  let budget = 2;
  const position = await searchPosition(query, new AbortController().signal, () => budget-- > 0);
  assert.equal(position?.status, "matched"); assert.deepEqual(position?.query, query); assert.equal(urls.length, 2); assert.equal(budget, 0);
  assert.equal(urls[1].searchParams.get("text"), "Piazza della Rotonda 73, Rome");
  assert.equal(logs.filter(line => JSON.parse(line).event === "geo_request").length, 2);
  assert.doesNotMatch(logs.join(""), /private-fixture-key|Rotonda|Albergo|Authorization/);
  assert.ok(logs.some(line => JSON.parse(line).httpStatus === 200));
});
test("ambiguous exact addresses and HTTP failures do not trigger a speculative fallback", async () => {
  process.env.HEIGIT_API_KEY = "fixture";
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(response(candidate(), candidate("Piazza della Rotonda", "73", "Roma", "ITA", "address", [12.49, 41.91]))); };
  assert.equal((await searchPosition(query, new AbortController().signal))?.status, "ambiguous"); assert.equal(calls, 1);
  const logs: string[] = []; console.info = value => logs.push(String(value));
  globalThis.fetch = async () => { calls++; return Response.json({ error: "private response" }, { status: 429 }); };
  await assert.rejects(searchPosition(query, new AbortController().signal), /temporarily busy/); assert.equal(calls, 2);
  assert.ok(logs.some(line => JSON.parse(line).httpStatus === 429)); assert.doesNotMatch(logs.join(""), /private response/);
});
test("budget exhaustion never stores an incomplete fallback as a negative position", async () => {
  process.env.HEIGIT_API_KEY = "fixture";
  let calls = 0, allowed = 1;
  globalThis.fetch = async () => { calls++; return Response.json(response()); };
  assert.equal(await searchPosition(query, new AbortController().signal, () => allowed-- > 0), null); assert.equal(calls, 1);
  assert.equal((await searchPosition(query, new AbortController().signal))?.status, "not_found"); assert.equal(calls, 3);
});
