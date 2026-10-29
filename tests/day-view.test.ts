import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("Plan expansion retains its shell and separates browsing from edits", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "tests/day-view-render.tsx"], { encoding: "utf8", timeout: 30000 });
  assert.match(output, /Plan expansion checks passed/);
});
