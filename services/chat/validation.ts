import { validatePlaceIds } from "@/services/place-references";
import type { ChatTurn } from "@/lib/chat/types";
import { checkReference, ConversationError } from "@/services/conversations";

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
