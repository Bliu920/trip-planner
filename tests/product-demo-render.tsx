import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { demoBudget, demoDays } from "../lib/product-demo/data";
import catalog from "../data/italy.json";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};

// Fail on accidental backend access.
const actualFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async () => {
  requests++;
  throw new Error("The product sample must stay offline.");
};
try {
  const { ProductDemo } = require("../lib/product-demo") as typeof import("../lib/product-demo");
  const html = renderToStaticMarkup(<ProductDemo />);
  assert.equal(requests, 0);
  assert.equal((html.match(/<article /g) ?? []).length, 3);
  assert.match(html, /Example trip workspace/);
  assert.match(html, /Trip conversation/);
  assert.match(html, /Dates flexible/);
  assert.doesNotMatch(html, /\/api\/|supabase|tile\.openstreetmap|\/product-story\/workspace/);

  // Embedded views stay presentational.
  const { DiscoveryVisual, DayVisual, BudgetVisual, LibraryVisual } =
    require("../lib/product-preview/visuals") as typeof import("../lib/product-preview/visuals");
  for (const View of [DiscoveryVisual, DayVisual, BudgetVisual, LibraryVisual]) {
    const view = renderToStaticMarkup(<View />);
    assert.match(view, /inert=""/);
    assert.doesNotMatch(view, /\/api\/|supabase|tile\.openstreetmap|data:image\/svg/);
  }
  const { previewDay, dayMapPlaces } =
    require("../lib/product-preview/data") as typeof import("../lib/product-preview/data");
  assert.equal(dayMapPlaces.length, 3);
  for (const marker of dayMapPlaces) {
    const stop = previewDay.stops.find((stop) => stop.id === marker.id)!;
    const place = catalog.find((place) => place.id === stop.placeId)!;
    assert.deepEqual(marker.coordinates, [place.latitude, place.longitude]);
  }
  assert.equal(requests, 0);

  // Covers use the existing photo catalog.
  const ids = demoDays.flatMap((day) => day.stops.map((stop) => stop.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const day of demoDays) {
    assert.ok(day.photo?.src.startsWith("https://images.pexels.com/"));
    for (const stop of day.stops) {
      if (stop.placeId)
        assert.ok(
          catalog.some((place) => place.id === stop.placeId),
          stop.placeId,
        );
      if (stop.point) assert.ok(stop.point.every((value) => value >= 0 && value <= 100));
    }
  }
  assert.match(demoBudget.note, /Placeholder/);
  assert.match(html, /inert=""/);
  console.log("Static sample renders production cards and existing catalog photos.");
} finally {
  globalThis.fetch = actualFetch;
}
