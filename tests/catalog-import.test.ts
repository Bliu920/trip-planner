import assert from "node:assert/strict";
import test from "node:test";
import photos from "../data/place-photos.json";
import { photoManifestSchema } from "../services/places/catalog/validation";
import { syncPhotos } from "../scripts/catalog/sync";

test("photo-only updates write changed enrichment and verify it without touching places", async () => {
  const originalFetch = globalThis.fetch;
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://catalog.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const expected = photoManifestSchema.parse(photos.slice(0, 2));
  let stored = [{ ...expected[0], alt: "Previous caption" }, expected[1]];
  const writes: unknown[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(new URL(String(input)).pathname, "/rest/v1/place_photos");
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        stored = expected;
        return new Response(null, { status: 204 });
      }
      return Response.json(stored);
    };
    await syncPhotos(expected);
    assert.deepEqual(writes, [[expected[0]]]);
    await syncPhotos(expected);
    assert.equal(writes.length, 1, "Re-running the update must not rewrite unchanged rows.");
    await assert.rejects(syncPhotos([expected[0]]), /complete place coverage/);
    await assert.rejects(syncPhotos([expected[0], { ...expected[0], place_id: expected[1].place_id }]), /distinct photo/);
    assert.equal(writes.length, 1, "Invalid manifests must not write anything.");
  } finally {
    globalThis.fetch = originalFetch;
    if (base === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = base;
    if (key === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = key;
  }
});
