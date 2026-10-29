import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
test("journey status distinguishes saved estimates, partial checks, failures and pending edits", () => {
  const result = execFileSync(process.execPath, ["--import", "tsx", "tests/journey-ui-render.tsx"], { encoding: "utf8", timeout: 30000 });
  assert.match(result, /Journey status checks passed/);
});
