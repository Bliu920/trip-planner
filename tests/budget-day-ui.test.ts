import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
test("daily spending includes dining and explains daily shares without claiming verified meal prices", () => {
  const result = execFileSync(process.execPath, ["--import", "tsx", "tests/budget-day-render.tsx"], { encoding: "utf8", timeout: 30000 });
  assert.match(result, /Daily dining amount, allocation and state rendering checks passed/);
});
