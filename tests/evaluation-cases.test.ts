import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCases } from "../services/evaluation";
import { executeCase } from "../services/evaluation/runner";
import { providerStream } from "./chat-fixture";

test("every case has an executable isolated setup, including all original IDs", { timeout: 180000 }, async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture";
  try {
    const cases = (await loadCases("data/evaluation/cases.json")).cases;
    const expected = [["I", 23], ["F", 24], ["R", 15]] as const;
    const ids = expected.flatMap(([prefix, count]) => Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`));
    ids.forEach(id => {
      const found = cases.find(c => c.id === id);
      assert.ok(found, `Missing original case ${id}`);
    });
    for (const c of cases) {
      const observation = await executeCase(c, async () => providerStream());
      assert.equal(observation.responseStatus, 200, `${c.id} did not reach the chat runner`);
    }
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
