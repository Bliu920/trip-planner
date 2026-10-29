import "server-only";
import type { UIMessageChunk } from "ai";
import { activitySchema, type ActivityEntry } from "@/lib/activity/model";
import { clean, completed, source, started } from "./summary";
export { activityStore } from "./storage";

/** One recorder per generation. The same saved entries feed streaming and reload. */
export class ActivityRecorder {
  private entries = new Map<string, ActivityEntry>();
  private tools = new Map<string, string>();
  private calls = new Map<string, string>();
  constructor(private readonly attempt: string, private readonly save: (entry: ActivityEntry) => Promise<void>, private readonly emit: (entry: ActivityEntry) => void) {}

  private async put(key: string, update: Partial<ActivityEntry>) {
    const previous = this.entries.get(key);
    if (previous && previous.status !== "running") return;
    const entry = activitySchema.parse({ id: `${this.attempt}:${key}`, attempt: this.attempt, title: "Work on your trip", status: "running", detail: "", sources: [], documents: [], ...previous, ...update,
      ...(update.detail !== undefined ? { detail: clean(update.detail, 1200) } : {}) });
    if (JSON.stringify(previous) === JSON.stringify(entry)) return;
    // Publish after persistence.
    await this.save(entry);
    this.entries.set(key, entry);
    this.emit(entry);
  }

  async consume(chunk: UIMessageChunk) {
    if (chunk.type === "tool-input-start" || chunk.type === "tool-input-available" && !this.calls.has(chunk.toolCallId)) {
      const current = this.calls.get(chunk.toolCallId);
      if (!current || this.entries.get(current)?.status !== "running") this.calls.set(chunk.toolCallId, `${this.entries.size}:${chunk.toolCallId}`);
    }
    const key = "toolCallId" in chunk ? this.calls.get(chunk.toolCallId) ?? chunk.toolCallId : "";
    // Capture observable actions.
    if (chunk.type === "tool-input-start" || chunk.type === "tool-input-available" || chunk.type === "tool-input-error") {
      this.tools.set(chunk.toolCallId, chunk.toolName);
      await this.put(key, { ...started(chunk.toolName, "input" in chunk ? chunk.input : undefined),
        ...(chunk.type === "tool-input-error" ? { status: "failed" as const, detail: "This step could not start. The assistant may try another approach." } : {}) });
    }
    if (chunk.type === "tool-output-available" && !chunk.preliminary) {
      await this.put(key, completed(this.tools.get(chunk.toolCallId) ?? "", chunk.output));
    }
    if (chunk.type === "tool-output-error" || chunk.type === "tool-output-denied") {
      await this.put(key, { status: "failed", detail: "This step could not finish. The assistant may try another approach." });
    }
    // Retain cited evidence.
    if (chunk.type === "source-url") {
      const sources = source(chunk.url, chunk.title);
      if (sources.length) await this.put(`source:${chunk.sourceId}`, { title: "Research source", status: "complete", detail: "Referenced during this reply. A citation alone does not confirm every detail.", sources });
    }
  }

  async finish() {
    for (const [key, entry] of this.entries) {
      if (entry.status === "running") await this.put(key, { status: "interrupted", detail: "This step ended without a confirmed result." });
    }
  }
}
