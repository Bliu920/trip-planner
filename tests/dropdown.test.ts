import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function sources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sources(join(root, entry.name)) : /\.tsx$/.test(entry.name) ? [join(root, entry.name)] : []);
}

test("all application dropdowns use the shared shadcn controls", () => {
  for (const path of [...sources("app"), ...sources("lib")]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /<select\b|<option\b/, path);
    assert.doesNotMatch(source, /from ["']@base-ui\/react\/(select|menu|popover)["']/, path);
  }
});

test("actual rendered fields preserve consumer labels and disabled/empty values", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "tests/dropdown-render.tsx"], { encoding: "utf8", timeout: 30000 });
  assert.match(output, /Shared dropdown labels, empty values, disabled fields and real consumers passed/);
});
