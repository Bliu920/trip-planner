import assert from "node:assert/strict";
import test from "node:test";
import { queryCatalog, describeCatalog, filterPlaces, type Place } from "../lib/catalog";
import { getPlaces, readPlaces } from "../services/places/catalog";

const places = getPlaces();

test("Explore and agent queries share AND text and city/type semantics", () => {
  for (const [query, city, type] of [["ROME colosseum", "", ""], ["Borghese", "Rome", "museum"], ["caffe florian", "Venice", ""], ["", "Florence", ""]]) {
    assert.deepEqual(queryCatalog(places, { query, cities: city ? [city] : [], types: type ? [type] : [], limit: 200 }).places, filterPlaces(places, query, city, type));
  }
  assert.equal(queryCatalog(places, { query: "colosseum impossibleword" }).total, 0);
});

test("compound filters intersect, tag variants agree, missing facts never pass explicit filters", () => {
  const fixture: Place[] = [
    { ...places[0], id: "match", tags: ["local_favorite", "art"], price_range: "€€", duration_minutes: 60, booking_required: false },
    { ...places[0], id: "unknown", tags: ["local-favorite", "art"], price_range: "€€", duration_minutes: null, booking_required: null },
    { ...places[0], id: "excluded", tags: ["local-favorite", "art", "crowded"], price_range: "€€", duration_minutes: 60, booking_required: false },
  ];
  const filters = { cities: [places[0].city, "unmatched"], regions: [places[0].region], types: [places[0].type], tagsAny: ["LOCAL-FAVORITE"], tagsAll: ["art"], excludeTags: ["crowded"], priceRanges: ["€€" as const], maxDurationMinutes: 90, bookingRequired: false };
  assert.deepEqual(queryCatalog(fixture, filters).places.map(place => place.id), ["match"]);
  assert.equal(queryCatalog(fixture, { ...filters, bookingRequired: null, maxDurationMinutes: null }).total, 2);
  assert.deepEqual(queryCatalog(fixture, { query: "", limit: 3 }).evidence.find(record => record.id === "unknown")?.unknownFields, ["duration_minutes", "booking_required"]);
  assert.equal(describeCatalog(fixture).tags["local-favorite"], 3);
});

test("pagination retains complete city distribution and stable ordering without mutation", () => {
  const before = JSON.stringify(places);
  const first = queryCatalog(places, { sort: "rating", limit: 7 });
  const second = queryCatalog(places, { sort: "rating", limit: 7, offset: first.nextOffset! });
  assert.equal(first.total, 103);
  assert.equal(first.cities.reduce((total, city) => total + city.count, 0), 103);
  assert.deepEqual(first.cities, second.cities);
  assert.equal(new Set([...first.places, ...second.places].map(place => place.id)).size, 14);
  assert.equal(queryCatalog(places, { offset: 103 }).nextOffset, null);
  assert.equal(JSON.stringify(places), before);
  const duration = queryCatalog(places, { sort: "duration", limit: 200 }).places;
  assert.equal(duration.at(-1)?.duration_minutes, null);
});

test("discovery explains evidence limits and validation rejects invalid query shapes", () => {
  const description = describeCatalog(places);
  assert.equal(Object.values(description.cities).reduce((sum, count) => sum + count, 0), 103);
  assert.match(description.semantics.prices, /not EUR/);
  assert.match(description.semantics.limits, /not live ticket availability/);
  assert.throws(() => queryCatalog(places, { limit: 201 }));
  assert.throws(() => queryCatalog(places, { maxDurationMinutes: -1 }));
  assert.throws(() => queryCatalog(places, { budget: 100 } as never));
  assert.throws(() => readPlaces(["invented"]), /Unknown catalog ID/);
  assert.deepEqual(readPlaces([places[0].id]), [places[0]]);
});
