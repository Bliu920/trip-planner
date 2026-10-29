import "server-only";
import { hydratePlaceReferences } from "@/services/place-references";
import type { ReplyFailure } from "@/lib/chat/failure";
import type { ChatSnapshot, ChatTurn, MessageStatus, StoredMessage } from "@/lib/chat/types";
import { normalizeReference, REFERENCE_PATTERN } from "@/lib/trips/types";
import { chatRpc, ConversationError } from "./database";

export { ConversationError } from "./database";
export type ReservedTurn = { responseId: string; messages: StoredMessage[]; documents: import("@/lib/documents/types").DocumentRef[] };

export function checkReference(value: string) {
  const reference = normalizeReference(value);
  if (!REFERENCE_PATTERN.test(reference)) throw new ConversationError("Enter a valid trip or conversation reference.", 400);
  return reference;
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ConversationError("Open the chat from your trip workspace.", 403);
  }
}

export async function loadConversation(reference: string, conversation: string | null = null, newId: string | null = null) {
  const snapshot = await chatRpc<ChatSnapshot>("chat_snapshot", { p_trip: checkReference(reference), p_conversation: conversation ? checkReference(conversation) : null, p_new: newId ? checkReference(newId) : null });
  return hydratePlaceReferences(snapshot);
}

export function beginTurn(reference: string, turn: ChatTurn, generation: string) {
  return chatRpc<ReservedTurn>("chat_begin_turn_places", {
    p_trip: reference, p_conversation: turn.conversationId, p_expected: turn.expectedLastId,
    p_user_id: turn.message?.id ?? null, p_text: turn.message?.text ?? null, p_retry: turn.retry, p_generation: generation, p_attachments: turn.message?.attachmentIds ?? [], p_places: turn.message?.placeIds ?? [],
  });
}

export async function saveReply(reference: string, conversation: string, message: string, generation: string, text: string, status: MessageStatus, failure?: ReplyFailure) {
  const saved = await chatRpc<boolean>(failure ? "chat_write_reply_result" : "chat_write_reply", {
    p_trip: reference, p_conversation: conversation, p_message: message, p_generation: generation, p_text: text, p_status: status, ...(failure ? { p_failure: failure } : {}),
  });
  if (!saved) throw new ConversationError("This reply was interrupted or replaced. Reload the conversation.", 409);
}

export async function handleConversations(request: Request, reference: string) {
  try {
    // Validate scoped access.
    checkOrigin(request);
    const url = new URL(request.url);
    const creating = request.method === "POST";
    const conversation = url.searchParams.get("conversation");
    if (creating && !conversation) throw new ConversationError("A new conversation ID is required.", 400);
    // Read or create history.
    const snapshot = await loadConversation(reference, creating ? null : conversation, creating ? conversation : null);
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return Response.json({ error: error instanceof ConversationError ? error.message : "Could not load the conversation." }, {
      status: error instanceof ConversationError ? error.status : 500, headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function handleConversationDocument(request: Request, reference: string, conversation: string, document: string) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    // Scope selection changes.
    checkOrigin(request);
    await chatRpc("chat_document_remove", {
      p_trip: checkReference(reference), p_conversation: checkReference(conversation), p_document: checkReference(document),
    });
    return Response.json({ removed: true }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof ConversationError ? error.message : "Could not update the conversation documents." }, {
      status: error instanceof ConversationError ? error.status : 503, headers,
    });
  }
}
