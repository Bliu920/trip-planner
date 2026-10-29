import { inspectPlan, type Plan } from "@/lib/plan";
import { PlanRequestError } from "@/lib/plan/session";
import { places } from "./fixtures";

export type Failure = "none" | "offline" | "conflict";
/** In-memory database and HTTP-shaped adapter, private to the preview. */
export class MockPlanStore {
  private revision = 1;
  private plan: Plan | null;
  private failure: Failure = "none";
  private receipts = new Map<string, number>();
  constructor(initial: Plan | null, private delay = 700) { this.plan = structuredClone(initial); }
  failNext(failure: Failure) { this.failure = failure; }
  load = async (_reference: string, signal?: AbortSignal) => {
    await new Promise(resolve => setTimeout(resolve, this.delay));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return { revision: this.revision, plan: structuredClone(this.plan), places };
  };
  save = async (_reference: string, revision: number, plan: Plan, requestId: string) => {
    await new Promise(resolve => setTimeout(resolve, this.delay));
    const receipt = this.receipts.get(requestId);
    if (receipt !== undefined) return { savedRevision: receipt, snapshot: { revision: this.revision, plan: structuredClone(this.plan) } };
    const failure = this.failure; this.failure = "none";
    if (failure === "offline") throw new Error("Could not save. Your changes are still here. Retry when you are ready.");
    if (failure === "conflict") {
      this.revision++;
      if (this.plan) this.plan.days[2].title = "A slower afternoon by the Arno";
    }
    if (revision !== this.revision) throw new PlanRequestError("This plan changed elsewhere. Your edit has been kept. Load the latest plan to continue.", 409);
    const errors = inspectPlan(plan, places, this.plan).findings.filter(finding => finding.severity === "error");
    if (errors.length) throw new Error(errors.map(error => error.message).join(" "));
    this.plan = structuredClone(plan); this.revision++; this.receipts.set(requestId, this.revision);
    return { savedRevision: this.revision, snapshot: { revision: this.revision, plan: structuredClone(this.plan) } };
  };
}
