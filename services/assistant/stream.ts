import "server-only";
import { consumeStream, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { ChatMessage } from "@/lib/chat/types";

type StreamOptions = Parameters<typeof createUIMessageStream<ChatMessage>>[0];
export type ReplyLifecycle = {
  execute: StreamOptions["execute"];
  onEnd: NonNullable<StreamOptions["onEnd"]>;
  onError: NonNullable<StreamOptions["onError"]>;
  onDrainError(error: unknown): void;
  onDrain(): void;
  onSetupError(error: unknown): Promise<void>;
};

export async function replyStream(messageId: string, lifecycle: ReplyLifecycle, keepAlive: (work: Promise<void>) => void) {
  // Adapt SDK delivery.
  try {
    const stream = createUIMessageStream<ChatMessage>({ generateId: () => messageId, execute: lifecycle.execute, onEnd: lifecycle.onEnd, onError: lifecycle.onError });
    return createUIMessageStreamResponse({ stream,
      consumeSseStream: ({ stream }) => {
        // Drain independently of UI.
        keepAlive(consumeStream({ stream, onError: lifecycle.onDrainError }).finally(lifecycle.onDrain));
      },
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) {
    try { await lifecycle.onSetupError(error); }
    finally { lifecycle.onDrain(); }
    throw error;
  }
}
