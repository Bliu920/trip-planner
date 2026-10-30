import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("real chat registers user turns, stable reply rows and non-anchoring status rows", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "tests/chat-scroll-render.tsx"],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.match(output, /Chat rows preserve stable identities, user anchors and status boundaries/);
});
