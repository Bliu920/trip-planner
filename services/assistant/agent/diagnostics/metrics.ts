import type { ModelMessage } from "ai";
import type { ReplyFailure } from "@/lib/chat/failure";
import type { AgentEnvironment } from "../contracts";
import type { Plan } from "@/lib/plan";
import type { Budget } from "@/lib/budget";

/** Counts only. Never log draft text, IDs, prices or private reasoning. */
export function runProgress(environment: AgentEnvironment): ReplyFailure["progress"] {
  if (!environment.artifacts) return undefined;
  try {
    const { plan } = environment.artifacts.readPlan({ view: "effective", selector: "full", ids: [] }) as { plan?: Plan };
    const { budget } = environment.artifacts.readBudget({ view: "effective", selector: "full", ids: [] }) as { budget?: Budget };
    return { hasPlan: !!plan, hasBudget: !!budget, planItems: Object.keys(plan?.items ?? {}).length,
      scheduledItems: plan?.days.reduce((n, day) => n + day.itemIds.length, 0) ?? 0,
      populatedDays: plan?.days.filter(day => day.itemIds.length).length ?? 0,
      budgetEntries: budget?.entries.length ?? 0, pricedEntries: budget?.entries.filter(entry => entry.pricing !== "unknown").length ?? 0 };
  } catch { return undefined; }
}

/** Size categories only, including opaque provider reasoning state. */
export function contextSizes(messages: ModelMessage[]) {
  const partBytes = { text: 0, reasoning: 0, toolCall: 0, toolResult: 0, other: 0 };
  for (const message of messages) {
    if (typeof message.content === "string") { partBytes.text += Buffer.byteLength(message.content); continue; }
    for (const part of message.content) {
      const kind = part.type === "reasoning" ? "reasoning" : part.type === "tool-call" ? "toolCall" : part.type === "tool-result" ? "toolResult" : part.type === "text" ? "text" : "other";
      partBytes[kind] += Buffer.byteLength(JSON.stringify(part));
    }
  }
  return { historyBytes: Buffer.byteLength(JSON.stringify(messages)), historyMessages: messages.length, partBytes };
}
