import { actionResultSchema } from "@/lib/actions";
import type { ChatMessage, ChatSnapshot } from "./types";

/** Keep a locally sent message until storage confirms its ID. */
export function reconcileHistory(snapshot: ChatSnapshot, pending: ChatMessage | null) {
  const unsaved =
    pending && !snapshot.messages.some((message) => message.id === pending.id) ? pending : null;
  return {
    pending: unsaved,
    messages: unsaved ? [...snapshot.messages, unsaved] : snapshot.messages,
  };
}

/** Retain earlier attempt activity while the SDK regenerates a reply. */
export function mergeActivity(messages: ChatMessage[], saved: ChatMessage[]) {
  const history = new Map(saved.map((message) => [message.id, message]));
  return messages.map((message) => {
    const liveIds = new Set(
      message.parts.flatMap((part) => (part.type === "data-activity" ? [part.data.id] : [])),
    );
    const prior =
      history
        .get(message.id)
        ?.parts.filter((part) => part.type === "data-activity" && !liveIds.has(part.data.id)) ?? [];
    return prior.length ? { ...message, parts: [...prior, ...message.parts] } : message;
  });
}

/** Find confirmed saves without coupling the hook to part formats. */
export function committedActions(messages: ChatMessage[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      const result =
        (part.type === "tool-commit" || part.type === "tool-saveBrief") &&
        "state" in part &&
        part.state === "output-available" &&
        "output" in part
          ? actionResultSchema.safeParse(part.output)
          : null;
      const saved =
        part.type === "data-commit" ||
        (result?.success &&
          result.data.outcome === "succeeded" &&
          result.data.effect === "persisted");
      return saved ? [`${message.id}:${"toolCallId" in part ? part.toolCallId : "receipt"}`] : [];
    }),
  );
}
