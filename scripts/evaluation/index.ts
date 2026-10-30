import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCases, gradeChecks, executionIssue } from "@/services/evaluation";
import { executeCase } from "@/services/evaluation/runner";
import { judgeCase, judgeModel } from "@/services/evaluation/judge";
import { agentModel } from "@/services/assistant/agent";
import { providerDiagnostics } from "@/services/assistant/agent/diagnostics";
import type { Check, Verdict } from "@/services/evaluation";

const dbPath = "data/evaluation/cases.json";
const args = process.argv.slice(2), command = args[0];
const value = (name: string) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? null; };
const known = new Set(["run", "validate", "--all", "--ids", "--judge", "--no-judge", "--pace-ms"]);
const validArgs = () => args.every((arg, i) => known.has(arg) || (i > 0 && ["--ids", "--pace-ms"].includes(args[i - 1])));
async function fingerprint() {
  const directories = ["services/assistant", "services/workspace", "services/budgets", "services/plans", "services/documents", "services/places/geo", "services/places/feasibility", "services/evaluation", "scripts/evaluation", "tests/fixtures/plan", "lib/plan", "lib/budget", "lib/catalog", "lib/journeys", "supabase/migrations"];
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const names = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
    return names.flat();
  };
  const names = [...(await Promise.all(directories.map(walk))).flat(), "data/italy.json", "package-lock.json", "tests/chat-fixture.ts", "tests/plan-fixture.ts"].sort();
  const hash = createHash("sha256");
  for (const name of names) { hash.update(name); hash.update(await readFile(name)); }
  return hash.digest("hex");
}
function overall(checks: Check[], judge: Verdict | null) {
  if (checks.some(c => c.outcome === "fail") || judge?.outcome === "fail") return "fail";
  if (checks.some(c => c.outcome === "not_evaluable") || !judge || judge.outcome === "not_evaluable") return "not_evaluable";
  return "pass";
}
async function main() {
  if (!validArgs() || !["validate", "run"].includes(command ?? "")) throw new Error("Use validate, or run --all|--ids I01,F01 [--no-judge] [--pace-ms 15000]");
  const data = await loadCases(dbPath);
  if (command === "validate") { console.log(`Validated ${data.cases.length} cases. Dataset SHA-256: ${data.hash}`); return; }
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is not configured");
  if (args.includes("--judge") && args.includes("--no-judge")) throw new Error("Choose one judge mode");
  const useJudge = !args.includes("--no-judge");
  const ids = value("--ids")?.split(",").filter(Boolean) ?? [];
  if (args.includes("--all") === Boolean(ids.length)) throw new Error("Select exactly one of --all or --ids");
  const cases = args.includes("--all") ? data.cases : data.cases.filter(c => ids.includes(c.id));
  if (!cases.length || ids.some(id => !cases.some(c => c.id === id))) throw new Error("Unknown or empty case selection");
  const paceMs = Number(value("--pace-ms") ?? 0);
  if (!Number.isInteger(paceMs) || paceMs < 0 || paceMs > 60000) throw new Error("Use a provider interval from 0 to 60000 milliseconds");
  // Pace without retrying failures.
  const transport = globalThis.fetch;
  let nextRequestAt = 0;
  if (paceMs) globalThis.fetch = async (input, init) => {
    const host = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url).hostname;
    if (host === "api.openai.com") {
      const now = Date.now(), waitMs = Math.max(0, nextRequestAt - now);
      nextRequestAt = Math.max(now, nextRequestAt) + paceMs;
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    return transport(input, init);
  };
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + `-${process.pid}`;
  const dir = join(".local", "evaluations", runId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const report = { version: 1, startedAt: new Date().toISOString(), caseHash: data.hash, appHash: await fingerprint(), geoConfigured: !!process.env.HEIGIT_API_KEY, paceMs,
    agentModel: agentModel(), judgeModel: useJudge ? judgeModel() : null,
    selectedCaseIds: cases.map(c => c.id),
    results: [] as { id: string; outcome: string; checks: Check[]; judge: Verdict | null; error: string | null; elapsedMs: number | null; providerRequests: number | null; simulatedRequests: number | null; sourceChanged?: boolean }[] };
  await writeFile(join(dir, "cases.json"), JSON.stringify(cases, null, 2), { mode: 0o600 });
  await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  // Run isolated cases sequentially.
  for (const c of cases) {
    console.log(`${c.id}: started (${1 + (c.followUps?.length ?? 0)} turns)`);
    try {
      const observation = await executeCase(c, globalThis.fetch, async (index, turn) => {
        await writeFile(join(dir, `${c.id}.turn${index + 1}.json`), JSON.stringify(turn, null, 2), { mode: 0o600 });
        console.log(`${c.id}: turn ${index + 1} ${turn.replyStatus}, ${turn.providerRequests} provider requests, ${turn.commitCount} final publications`);
      });
      await writeFile(join(dir, `${c.id}.observation.json`), JSON.stringify(observation, null, 2), { mode: 0o600 });
      const checks = gradeChecks(c, observation);
      let judge: Verdict | null = null, error: string | null = executionIssue(c, observation);
      if (useJudge && !error) {
        try { judge = await judgeCase(c, observation); } catch (failure) {
          error = `Judge request or output validation failed: ${JSON.stringify(providerDiagnostics(failure) ?? { name: failure instanceof Error ? failure.name : "UnknownError" })}`;
        }
      }
      const sourceChanged = await fingerprint() !== report.appHash;
      const outcome = sourceChanged ? "not_evaluable" : overall(checks, judge);
      report.results.push({ id: c.id, outcome, checks, judge, error: sourceChanged ? "Application source changed during this run" : error, elapsedMs: observation.elapsedMs, providerRequests: observation.providerRequests, simulatedRequests: observation.simulatedRequests, sourceChanged });
      console.log(`${c.id}: ${outcome}`);
    } catch {
      report.results.push({ id: c.id, outcome: "not_evaluable", checks: [], judge: null, error: "Case execution failed", elapsedMs: null, providerRequests: null, simulatedRequests: null });
      console.log(`${c.id}: not_evaluable`);
    }
    await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
    if (report.results.at(-1)?.sourceChanged) {
      console.log("Application source changed. Stopped before starting another paid case.");
      break;
    }
  }
  const counts = ["pass", "fail", "not_evaluable"].map(s => `${s}: ${report.results.filter(r => r.outcome === s).length}`).join(", ");
  await writeFile(join(dir, "report.md"), `# Evaluation report\n\n${counts}\n\n${report.results.map(r => `- ${r.id}: ${r.outcome}`).join("\n")}\n`, { mode: 0o600 });
  console.log(`Report: ${dir}/report.json (${counts})`);
  if (report.results.some(r => r.outcome !== "pass")) process.exitCode = 1;
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; });
