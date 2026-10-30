import { agentErrorDetail } from "../agent/diagnostics/errors";
import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { ReplyFailure } from "@/lib/chat/failure";
import type { ChatSnapshot, MessageStatus } from "@/lib/chat/types";
import { chatRpc, ConversationError, retryableChatWrite } from "./database";

/** Retry only this generation's identical reply write, with terminal verification. */
export async function saveReply(reference: string, conversation: string, message: string, generation: string, text: string, status: MessageStatus, failure?: ReplyFailure) {
  const operation = failure ? "chat_write_reply_result" : "chat_write_reply";
  const parameters = { p_trip: reference, p_conversation: conversation, p_message: message, p_generation: generation, p_text: text, p_status: status, ...(failure ? { p_failure: failure } : {}) };
  const verify = async () => {
    if (status === "streaming") return false;
    const snapshot = await chatRpc<ChatSnapshot>("chat_snapshot", { p_trip: reference, p_conversation: conversation }).catch(() => null);
    const reply = snapshot?.messages.find(item => item.id === message);
    const savedText = reply?.parts.filter(part => part.type === "text").map(part => part.text).join("") ?? "";
    const report = reply?.parts.find(part => part.type === "data-failure");
    return reply?.metadata?.status === status && savedText === text && (!failure ? !report : report?.type === "data-failure" && isDeepStrictEqual(report.data, JSON.parse(JSON.stringify(failure))));
  };
  // Verify uncertain terminal writes.
  try {
    if (await chatRpc<boolean>(operation, parameters)) return;
    if (await verify()) return;
    throw new ConversationError("This reply was interrupted or replaced. Reload the conversation.", 409, { code: "CHAT_REPLACED", operation });
  } catch (error) {
    if (!retryableChatWrite(error)) throw error;
    if (await verify()) return;
    // Retry the same identity.
    try { if (await chatRpc<boolean>(operation, parameters) || await verify()) return; }
    catch (again) { if (await verify()) return; throw again; }
    throw new ConversationError("This reply was interrupted or replaced. Reload the conversation.", 409, { code: "CHAT_REPLACED", operation });
  }
}

/** Capture exact persistence boundary and safe transport facts, never text or keys. */
export function reportPersistenceFailure(error: unknown, messageId: string, stage: NonNullable<ReplyFailure["termination"]>["stage"]) {
  const diagnostic = error instanceof ConversationError ? error.diagnostic : null;
  const detail = { ...agentErrorDetail(error), kind: "storage" as const, stage, errorType: error instanceof ConversationError ? "ConversationError" : agentErrorDetail(error).errorType,
    diagnosticCode: diagnostic?.code ?? "PERSISTENCE_ERROR", ...(diagnostic?.httpStatus ? { statusCode: diagnostic.httpStatus } : {}) };
  console.warn(JSON.stringify({ event: "chat_persistence_error", messageId, ...detail, ...(diagnostic?.operation ? { operation: diagnostic.operation } : {}), ...(diagnostic?.databaseCode ? { databaseCode: diagnostic.databaseCode } : {}) }));
  return detail;
}
