import "server-only";
import { hydratePlaceReferences } from "@/services/places/place-references";
import type { ChatSnapshot, ChatTurn, StoredMessage } from "@/lib/chat/types";
import { normalizeReference, REFERENCE_PATTERN } from "@/lib/trips/types";
import { chatRpc, ConversationError } from "./database";

export { ConversationError } from "./database";
export type ReservedTurn = { responseId: string; messages: StoredMessage[]; documents: import("@/lib/documents/types").DocumentRef[] };

export function checkReference(value: string) {
  const reference = normalizeReference(value);
  if (!REFERENCE_PATTERN.test(reference)) throw new ConversationError("Enter a valid trip or conversation reference.", 400);
  return reference;
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

export { saveReply } from "./replies";

export function removeConversationDocument(reference: string, conversation: string, document: string) {
  return chatRpc("chat_document_remove", {
    p_trip: checkReference(reference), p_conversation: checkReference(conversation), p_document: checkReference(document),
  });
}
export { progressStore } from "./progress";
export { reportPersistenceFailure } from "./replies";
