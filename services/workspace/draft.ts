import { randomUUID } from "node:crypto";
import { WorkspaceError } from "./database";
/** Run-local concurrency and rejection tracking, independent of persistence receipts. */
export class DraftState {
  private generation = 0;
  private identity = randomUUID();
  private busy = false;
  readonly failures = new Map<string, string>();
  get token() { return `${this.identity}:${this.generation}`; }
  reject(key: string, message: string) { this.failures.set(key, message); }
  assert(token: string) {
    if (token !== this.token || this.busy) throw new WorkspaceError("The draft changed. Read the current state and retry this edit with its current token.", 409, "EDIT_CONFLICT", { editToken: this.token });
  }
  async mutate<T>(token: string, key: string, work: () => Promise<T>): Promise<T & { editToken: string }> {
    try { this.assert(token); }
    catch (error) { if (key !== "commit") this.reject(key, "The edit used an outdated token. Read and reconcile this artifact before saving."); throw error; }
    const priorFailure = this.failures.get(key);
    const priorFamilyFailure = this.failures.get(key.split(":")[0]);
    this.busy = true;
    try {
      const result = await work();
      if ((result as { valid?: boolean })?.valid === false) {
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
      if (error instanceof WorkspaceError || (error as { status?: number })?.status) throw error;
      throw new WorkspaceError(message, 400, "EDIT_INVALID");
    } finally { this.busy = false; }
  }
  assertReady() {
    if (this.failures.size) throw new WorkspaceError(`Correct rejected changes before saving: ${[...this.failures].map(([key, message]) => `${key}: ${message}`).join("; ")}`, 400, "INCOMPLETE_CHANGES");
  }
}
