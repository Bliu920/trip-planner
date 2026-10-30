import { validatePlaceIds } from "@/services/places/place-references";
import type { ChatTurn } from "@/lib/chat/types";
import { checkReference, ConversationError, loadConversation, removeConversationDocument } from "@/services/assistant/conversation-store";

export class ChatError extends ConversationError {}
const messageId = /^[a-zA-Z0-9_-]{1,100}$/;

export async function readTurn(request: Request): Promise<ChatTurn> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ChatError("Send messages as JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ChatError("Enter a message to start chatting.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24000) { await reader.cancel(); throw new ChatError("The message is too long.", 413); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ChatError("Send valid JSON messages.", 400); }
  if (!body || typeof body !== "object" || typeof body.conversationId !== "string" || typeof body.retry !== "boolean") throw new ChatError("Invalid conversation request.", 400);
  const conversationId = checkReference(body.conversationId);
  if (body.expectedLastId !== null && (typeof body.expectedLastId !== "string" || !messageId.test(body.expectedLastId))) throw new ChatError("Invalid conversation position.", 400);
  if (body.retry) {
    if (body.message != null) throw new ChatError("Retry the saved reply without a new message.", 400);
    return { conversationId, expectedLastId: body.expectedLastId, retry: true, message: null };
  }
  const message = body.message;
  let placeIds: string[];
  try { placeIds = validatePlaceIds(message?.placeIds ?? []); }
  catch (error) { throw new ChatError(error instanceof Error ? error.message : "Invalid place references.", 400); }
  if (!message || typeof message.id !== "string" || !messageId.test(message.id) || typeof message.text !== "string" || (!message.text.trim() && !placeIds.length) || message.text.length > 4000) throw new ChatError("Enter a message up to 4,000 characters.", 400);
  const ids = message.attachmentIds ?? [];
  if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string")) throw new ChatError("Attach up to three different files.", 400);
  const attachmentIds = ids.map(checkReference);
  return { conversationId, expectedLastId: body.expectedLastId, retry: false, message: { id: message.id, text: message.text.trim() || "Help me plan my Italy trip around these places.", attachmentIds, placeIds } };
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ConversationError("Open the chat from your trip workspace.", 403);
  }
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
    await removeConversationDocument(reference, conversation, document);
    return Response.json({ removed: true }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof ConversationError ? error.message : "Could not update the conversation documents." }, {
      status: error instanceof ConversationError ? error.status : 503, headers,
    });
  }
}
