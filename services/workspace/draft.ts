import { randomUUID } from "node:crypto";
import { WorkspaceError } from "./database";
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
/** Run-local concurrency and rejection tracking, independent of persistence receipts. */
export class DraftState {
  private generation = 0;
  private identity = randomUUID().slice(0, 8);
  private busy = false;
  readonly failures = new Map<string, string>();
  private inputs = new Map<string, { family: string; id: string; fields: string[]; entityId?: string }>();
  snapshot() { return { generation: this.generation, identity: this.identity, failures: [...this.failures], inputs: [...this.inputs] }; }
  restore(value: ReturnType<DraftState["snapshot"]>) {
    this.generation = value.generation; this.identity = value.identity; this.busy = false;
    this.failures.clear(); value.failures.forEach(([key, message]) => this.failures.set(key, message));
    this.inputs = new Map(value.inputs);
  }
  get token() { return `d${this.generation}_${this.identity}`; }
  reject(key: string, message: string) { this.failures.set(key, message); }
  input(tool: string, value: unknown, resolved = false) {
    const family = tool === "editPlan" ? "plan" : tool === "editBudget" ? "budget" : null;
    if (!family || !value || typeof value !== "object") return false;
    const operations = (value as { operations?: unknown[] }).operations;
    if (!Array.isArray(operations)) return false;
    let recognized = false;
    for (const operation of operations) {
      if (!operation || typeof operation !== "object") continue;
      const op = operation as { type?: string; id?: string; dayId?: string; kind?: string; category?: string; afterDayIds?: string[]; changes?: Record<string, unknown> };
      if (!op.type || !["addActivity", "updateActivity", "replaceActivity", "addTravel", "updateTravel", "addStay", "updateStay", "moveItem", "removeItem", "setCommitment", "addCost", "updateCost", "removeCost", "updateSettings"].includes(op.type)) continue;
      const entityId = validId(op.id) ? op.id : undefined;
      if (!entityId && op.type !== "updateSettings") continue;
      recognized = true;
      const creation = op.type.startsWith("add");
      const day = validId(op.dayId) ? op.dayId : "unassigned";
      const nights = Array.isArray(op.afterDayIds) && op.afterDayIds.every(validId) ? op.afterDayIds : [];
      const category = ["stay", "transport", "food", "activities", "other"].includes(op.category ?? "") ? op.category : "unassigned";
      const id = op.type === "addActivity" ? `new-activity:${day}` : op.type === "addTravel" ? `new-travel:${day}` : op.type === "addStay" ? `new-stay:${[...nights].sort().join(",")}` : op.type === "addCost" ? `new-cost:${category}` : entityId ?? "settings";
      const groups = new Set(["kind", "timing", "location", "amount", "title", "reason", "optional", "afterDayIds", "reservation", "keep", "fixedStart", "fixedEnd", "messageId", "label", "category", "planItemIds", "assumptions", "sources", "scope", "travelers", "limit", "exclusions", "timingMode", "mode"]);
      const fields = [...new Set(Object.keys(op.changes ?? operation).filter(key => !["type", "id", "dayId", "afterItemId"].includes(key)).map(key => /time|date|duration/i.test(key) ? "timing" : ["placeId", "venue", "hotel", "locationItemId", "includedInStayId", "userLocation", "area", "from", "to"].includes(key) ? "location" : ["min", "max", "unitMin", "unitMax", "priceScope", "coveredTravelers", "pricing", "unit", "quantity"].includes(key) ? "amount" : key).filter(key => groups.has(key)))].sort();
      if (op.type === "moveItem") fields.push("placement");
      if (creation) fields.splice(0, fields.length, "complete");
      else if (op.type === "replaceActivity") fields.push("complete");
      if (resolved) {
        for (const [key, prior] of this.inputs) {
          // Recover unknown creation scopes.
          const unknownActivity = /^new-activity:unassigned(?::|$)/.test(prior.id) && ["addActivity", "replaceActivity"].includes(op.type);
          const unknownTravel = prior.id === "new-travel:unassigned" && ["addTravel", "updateTravel"].includes(op.type);
          const equivalent = prior.entityId === entityId && /^new-/.test(prior.id) && ["updateActivity", "replaceActivity", "updateTravel", "updateStay", "updateCost"].includes(op.type);
          const recoveredCreation = unknownActivity || unknownTravel || equivalent;
          const sameTarget = prior.family === family && (recoveredCreation || prior.entityId !== undefined && prior.entityId === op.id || prior.id === id || op.type === "addActivity" && prior.id.startsWith(`${id}:`) || creation && (prior.id === op.id || prior.id === "new-stay:" && op.type === "addStay" || prior.id === "new-cost:unassigned" && op.type === "addCost"));
          if (!sameTarget) continue;
          const remaining = prior.fields.filter(field => field !== "complete" && !fields.includes(field));
          const complete = recoveredCreation || creation || op.type === "replaceActivity" || op.type.startsWith("remove") || remaining.length === 0 && !prior.fields.includes("complete");
          if (complete) { this.inputs.delete(key); this.failures.delete(key); }
          else this.inputs.set(key, { ...prior, fields: [...remaining, ...(prior.fields.includes("complete") ? ["complete"] : [])] });
        }
      } else {
        const key = `${family}:${id}:${fields.join(",")}`;
        this.inputs.set(key, { family, id, fields, ...(entityId ? { entityId } : {}) });
        this.reject(key, "Correct this proposal on its target. A complete replacement resolves that target; unrelated edits do not.");
      }
    }
    return recognized;
  }
  assert(token: string) {
    if (token !== this.token || this.busy) throw new WorkspaceError("The draft changed. Read the current state and retry this edit with its current token.", 409, "EDIT_CONFLICT", { editToken: this.token });
  }
  async mutate<T>(token: string, key: string, work: () => Promise<T>, persistent = false): Promise<T & { editToken: string }> {
    try { this.assert(token); }
    catch (error) { if (key !== "commit") this.reject(key, "The edit used an outdated token. Read and reconcile this artifact before saving."); throw error; }
    const priorFailure = this.failures.get(key);
    const priorFamilyFailure = this.failures.get(key.split(":")[0]);
    this.busy = true;
    try {
      const result = await work();
      if ((result as { valid?: boolean; staged?: boolean })?.valid === false && !(result as { staged?: boolean })?.staged) {
        this.reject(key, "Correct the reported validation findings.");
      } else {
        if (this.failures.get(key) === priorFailure) this.failures.delete(key);
        if (this.failures.get(key.split(":")[0]) === priorFamilyFailure) this.failures.delete(key.split(":")[0]);
        this.generation++;
      }
      return { ...result, editToken: this.token };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Correct this edit before saving.";
      if (key !== "commit") this.reject(key, message);
      if (persistent || error instanceof WorkspaceError || (error as { status?: number })?.status) throw error;
      throw new WorkspaceError(message, 400, "EDIT_INVALID");
    } finally { this.busy = false; }
  }
  pendingCorrections() {
    return [...this.failures.keys()].slice(0, 12).map(key => {
      const input = this.inputs.get(key), targetId = input?.id ?? key.split(":")[1] ?? "artifact";
      const day = /^new-activity:([^:]+)/.exec(targetId)?.[1];
      const creation = /^new-(activity|travel|stay|cost):/.exec(input?.id ?? "")?.[1];
      const repair = creation === "activity" ? "addActivity with an existing real day ID, or replaceActivity if that activity already exists"
        : creation === "travel" ? "addTravel with an existing real day ID, or updateTravel if that journey already exists"
          : creation === "stay" ? "addStay with real covered day IDs, or updateStay if that stay already exists"
            : "addCost with a valid category, or updateCost if that cost already exists";
      return { artifact: key.split(":")[0], targetId, fields: input?.fields ?? [],
        nextAction: creation && input?.entityId ? `Correct proposal ${input.entityId} using ${repair}. Reuse this proposal ID; the rejected batch did not create it. Never copy a missing or invalid scope as a real day or category.`
          : day === "unassigned" ? "Read effective Plan day IDs. If an accepted activity already fulfills this proposal, use replaceActivity with that activity's complete effective fields; otherwise addActivity on an existing real day. A successful complete activity proposal resolves this unknown-day creation. Never use unassigned as a day ID."
          : targetId === "new-travel:unassigned" ? "Read effective Plan day IDs and journeys. Correct with addTravel on a real day, or updateTravel on its accepted equivalent. Never use unassigned as a day ID."
          : day ? `Use editPlan addActivity with a new unused id in day ${day} for the corrected proposal. The old generated role is not a user requirement.`
          : input?.family === "plan" ? `For an activity, use editPlan replaceActivity with the complete corrected activity ${targetId}. For a stay or journey, use its matching update command. Or correct the remaining listed fields.`
          : "Correct the remaining fields on this target before saving." };
    });
  }
  assertReady() {
    if (!this.failures.size) return;
    throw new WorkspaceError("Correct rejected changes before saving. Follow each unresolved target's nextAction; accepted content remains available.", 400, "INCOMPLETE_CHANGES", { unresolved: this.pendingCorrections() });
  }
}
