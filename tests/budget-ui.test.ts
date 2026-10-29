import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("unified budget table preserves amounts, uncertainty and source disclosure",()=>{
  const output=execFileSync(process.execPath,["--import","tsx","tests/budget-ui-render.tsx"],{encoding:"utf8",timeout:30000});
  assert.match(output,/Budget table, calculation, source and missing-price checks passed/);
});
