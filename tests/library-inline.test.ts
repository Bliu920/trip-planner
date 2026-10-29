import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("opening a Library file renders inline navigation instead of a file dialog", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "tests/library-inline-render.tsx"], { encoding: "utf8", timeout: 30000 });
  assert.match(output, /Inline file renders in the content area/);
});
