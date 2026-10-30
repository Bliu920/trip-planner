import { DefaultChatTransport } from "ai";
import type { ChatMessage } from "./types";

/** Convert the latest SDK message into the existing chat API contract. */
export function chatTurn(messages: ChatMessage[], trigger: string, body?: Record<string, unknown>) {
  const last = messages.at(-1);
  const retry = trigger === "regenerate-message";
  return {
    ...body,
    retry,
    message: retry
      ? null
      : {
          id: last?.id,
          text: last?.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(""),
          attachmentIds: last?.parts
            .filter((part) => part.type === "data-attachment")
            .map((part) => part.data.id),
          placeIds: last?.parts
            .filter((part) => part.type === "data-place")
            .map((part) => part.data.id),
        },
  };
}

export function createChatTransport(reference: string) {
  // Adapt the existing endpoint.
  return new DefaultChatTransport<ChatMessage>({
    api: `/api/trips/${encodeURIComponent(reference)}/chat`,
    prepareSendMessagesRequest: ({ messages, trigger, body }) => ({
      body: chatTurn(messages, trigger, body),
    }),
  });
}
