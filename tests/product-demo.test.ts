import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("About sample renders inert with fixed data and catalog photos", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "tests/product-demo-render.tsx"],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.match(output, /Static sample renders production cards/);
});
