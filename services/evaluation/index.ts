import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { caseSchema, type EvalCase } from "./contracts";
export { caseSchema } from "./contracts";
export type { EvalCase, Observation, Check, Verdict } from "./contracts";
export { gradeChecks, executionIssue } from "./checks";

export async function loadCases(path: string): Promise<{ cases: EvalCase[]; hash: string }> {
  // Validate case database.
  const bytes = await readFile(path);
  const data: unknown = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(data)) throw new Error("Case database must be an array");
  const cases = data.map(item => caseSchema.parse(item));
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error("Duplicate case ID");
  for (const c of cases) if (new Set(c.rubric.map(r => r.id)).size !== c.rubric.length) throw new Error(`Duplicate rubric ID in ${c.id}`);
  return { cases, hash: createHash("sha256").update(bytes).digest("hex") };
}
