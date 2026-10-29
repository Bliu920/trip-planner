import { loadPlan, updatePlan, PlanRequestError, type PlanView } from "./transport";
import { inspectPlan } from "../model";
import type { Plan } from "../types";

type PendingSave = { plan: Plan; revision: number; requestId: string };
type SessionState = {
  data: PlanView | null;
  loading: boolean;
  busy: boolean;
  pending: PendingSave | null;
  error: string;
  notice: string;
  editing: boolean;
  failure: "conflict" | "rejected" | "retryable" | null;
};
type Transport = { load: typeof loadPlan; save: typeof updatePlan };
const transport: Transport = { load: loadPlan, save: updatePlan };
const message = (error: unknown) => error instanceof Error ? error.message : "Could not update the plan.";

export function emptyPlan(): Plan {
  const day = (id: string) => ({ id, title: "Open day", itemIds: [], startLocation: null, endLocation: null });
  return { startDate: null, days: [day("day-1"), day("day-2"), day("day-3")], items: {}, notes: [] };
}

/** One session per project. Both presentation and controls use this snapshot. */
export class PlanSession {
  private state: SessionState = { data: null, loading: true, busy: false, pending: null, error: "", notice: "", editing: false, failure: null };
  private listeners = new Set<() => void>();
  private read: AbortController | null = null;
  private version = 0;
  private refreshQueued = false;
  private stopped = false;

  constructor(private reference: string, private io: Transport = transport) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private patch(update: Partial<SessionState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach(listener => listener());
  }
  private cancelRead() {
    this.read?.abort();
    this.version++;
  }
  stop() {
    this.stopped = true;
    this.cancelRead();
  }

  // Protect open drafts.
  setEditing = (editing: boolean) => {
    if (editing === this.state.editing) return;
    if (editing && this.state.loading) {
      this.cancelRead();
      this.refreshQueued = true;
    }
    this.patch({ editing, ...(editing ? { loading: false } : {}) });
    if (!editing && this.refreshQueued && !this.stopped) void this.refresh();
  };

  // Reconcile external changes.
  async refresh(discardPending = false) {
    this.stopped = false;
    if (this.state.editing || this.state.busy || (this.state.pending && !discardPending)) {
      this.refreshQueued = true;
      return;
    }
    this.read?.abort();
    const controller = new AbortController();
    this.read = controller;
    const version = ++this.version;
    this.patch({ loading: true });
    try {
      const data = await this.io.load(this.reference, controller.signal);
      if (controller.signal.aborted || version !== this.version) return;
      if (data.revision < (this.state.data?.revision ?? -1)) return;
      this.refreshQueued = false;
      this.patch({ data, error: "", ...(discardPending ? { pending: null, failure: null, notice: "Latest plan loaded." } : {}) });
    } catch (error) {
      if (!controller.signal.aborted && version === this.version) this.patch({ error: message(error) });
    } finally {
      if (version === this.version) this.patch({ loading: false });
    }
  }

  // Validate a single edit.
  async edit(change: (plan: Plan) => void): Promise<boolean> {
    const { data, busy, pending, loading } = this.state;
    if (!data || busy || pending || loading) return false;
    const plan = structuredClone(data.plan ?? emptyPlan());
    try {
      change(plan);
      const errors = inspectPlan(plan, data.places, data.plan ?? undefined).findings.filter(finding => finding.severity === "error");
      if (errors.length) throw new Error(errors.map(error => error.code === "shape" ? "Some plan details are incomplete or invalid. Review the plan before saving." : error.message).join(" "));
    } catch (error) {
      this.patch({ error: message(error), notice: "" });
      return false;
    }
    return this.save({ plan, revision: data.revision, requestId: crypto.randomUUID() });
  }
  retry() {
    return this.state.pending && this.state.failure === "retryable" ? this.save(this.state.pending) : Promise.resolve(false);
  }

  // Preserve retry identity.
  private async save(change: PendingSave): Promise<boolean> {
    if (this.state.busy) return false;
    this.cancelRead();
    this.patch({ busy: true, loading: false, pending: change, error: "", failure: null, notice: "" });
    let saved = false;
    try {
      const result = await this.io.save(this.reference, change.revision, change.plan, change.requestId);
      const data = this.state.data!;
      this.patch({ data: { ...data, ...result.snapshot }, pending: null, notice: "Plan saved." });
      saved = true;
    } catch (error) {
      this.patch({ ...(error instanceof PlanRequestError && error.code === "PLAN_FEASIBILITY" ? { pending: null } : {}),
        error: message(error), failure: error instanceof PlanRequestError && error.status === 409 ? "conflict"
        : error instanceof PlanRequestError && error.status >= 400 && error.status < 500 && error.status !== 408 ? "rejected" : "retryable" });
    } finally {
      this.patch({ busy: false });
      if (saved && this.refreshQueued && !this.stopped) void this.refresh();
    }
    return saved;
  }
}
