import "server-only";
import { randomUUID } from "node:crypto";
import { getTrip, TripError } from "@/services/projects/trips";
import { DocumentError } from "@/services/documents";
import { WorkspaceError } from "@/services/workspace";
import { ConversationError } from "./conversation-store";
import { agentModel, AgentConfigurationError } from "./agent";
import { chatErrorMessage } from "./agent/diagnostics";
import { checkOrigin, readTurn } from "./request";
import { prepareTurn, replyLifecycle } from "./turn";
import { replyStream } from "./stream";
export { handleConversations, handleConversationDocument } from "./request";

function failure(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function handleChat(request: Request, reference: string, keepAlive: (work: Promise<void>) => void = () => {}) {
  const startedAt = Date.now();
  try {
    // Validate scoped input.
    checkOrigin(request);
    const input = await readTurn(request);
    const trip = await getTrip(reference);
    if (!process.env.OPENAI_API_KEY?.trim()) return failure("The assistant is temporarily unavailable. Please try again later.", 503);
    agentModel();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(540000)]);
    // Prepare and deliver turn.
    const prepared = await prepareTurn(trip, input, randomUUID(), signal, startedAt);
    return await replyStream(prepared.turn.responseId, replyLifecycle(prepared), keepAlive);
  } catch (error) {
    if (error instanceof DocumentError) return failure("Your message is saved, but a required project document could not be read. Check it in Library, then retry.", 503);
    if (error instanceof ConversationError || error instanceof TripError || error instanceof WorkspaceError) return failure(error.message, error.status);
    if (error instanceof AgentConfigurationError) return failure(error.message, 503);
    return failure(chatErrorMessage(error), 502);
  }
}
