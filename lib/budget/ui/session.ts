import { ZodError } from "zod";
import { inspectBudget, type Budget, type BudgetView } from "@/lib/budget";

type Save = { budget: Budget; revision: number; requestId: string; reviewed: boolean };
type State = { data: BudgetView | null; loading: boolean; busy: boolean; pending: Save | null; error: string; notice: string };
async function request(reference: string, change?: Save, signal?: AbortSignal): Promise<BudgetView> {
  const response = await fetch(`/api/trips/${reference}/budget`, {
    method: change ? "PUT" : "GET", cache: "no-store", signal,
    ...(change ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) } : {}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not load or save the budget.");
  return change ? body.snapshot : body;
}
type Transport = { load: (reference: string, signal: AbortSignal) => Promise<BudgetView>; save: (reference: string, change: Save) => Promise<BudgetView> };
const transport: Transport = { load: (reference, signal) => request(reference, undefined, signal), save: request };
const message = (error: unknown) => error instanceof ZodError ? error.issues.slice(0, 3).map(issue => issue.code === "custom" ? issue.message : "Check the budget amounts, required fields and source links before saving.").join(" ") : error instanceof Error ? error.message : "Could not update the budget.";

/** Shared by the Plan card and Budget panel. */
export class BudgetSession {
  private state: State = { data: null, loading: true, busy: false, pending: null, error: "", notice: "" };
  private listeners = new Set<() => void>();
  private read: AbortController | null = null;
  private version = 0;
  private queued = false;
  private stopped = false;
  constructor(private reference: string, private io: Transport = transport) { }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(update: Partial<State>) { this.state = { ...this.state, ...update }; this.listeners.forEach(listener => listener()); }
  stop() { this.stopped = true; this.read?.abort(); this.version++; }

  // Reconcile external updates.
  async refresh(discardPending = false) {
    this.stopped = false;
    if (this.state.busy || (this.state.pending && !discardPending)) { this.queued = true; return; }
    this.read?.abort();
    const controller = this.read = new AbortController();
    const version = ++this.version;
    this.patch({ loading: true });
    try {
      const data = await this.io.load(this.reference, controller.signal);
      if (controller.signal.aborted || version !== this.version || data.revision < (this.state.data?.revision ?? -1)) return;
      this.queued = false;
      this.patch({ data, error: "", ...(discardPending ? { pending: null, notice: "Latest budget loaded." } : {}) });
    } catch (error) { if (!controller.signal.aborted && version === this.version) this.patch({ error: message(error) }); }
    finally { if (version === this.version) this.patch({ loading: false }); }
  }

  // Validate the captured revision.
  async edit(budget: Budget, revision: number, reviewed: boolean) {
    if (!this.state.data || this.state.busy || this.state.pending || this.state.loading) return false;
    try {
      if (revision !== this.state.data.revision) throw new Error("The project changed while this form was open. Close the editor and review the latest budget before editing again.");
      inspectBudget(budget, this.state.data.plan);
    } catch (error) { this.patch({ error: message(error) }); return false; }
    return this.save({ budget, revision, reviewed, requestId: crypto.randomUUID() });
  }
  retry() { return this.state.pending ? this.save(this.state.pending) : Promise.resolve(false); }

  // Preserve uncertain save identity.
  private async save(change: Save) {
    if (this.state.busy) return false;
    this.read?.abort(); this.version++;
    this.patch({ busy: true, loading: false, pending: change, error: "", notice: "" });
    let saved = false;
    try {
      const data = await this.io.save(this.reference, change);
      this.patch({ data, pending: null, notice: "Budget saved." }); saved = true;
    } catch (error) { this.patch({ error: message(error) }); }
    finally { this.patch({ busy: false }); if (saved && this.queued && !this.stopped) void this.refresh(); }
    return saved;
  }
}
