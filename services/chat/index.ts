import "server-only";
import { randomUUID } from "node:crypto";
import { getTrip, TripError } from "@/services/trips";
import {
  beginTurn,
  saveReply,
  checkOrigin,
  ConversationError,
} from "@/services/conversations";
import { DocumentError } from "@/services/documents";
import { openSession, WorkspaceError } from "@/services/workspace";
import { agentModel, AgentConfigurationError } from "@/services/agent";
import { resolveDocuments } from "./documents";
import { readTurn } from "./validation";
import { chatErrorMessage, failureCode, reportProviderFailure } from "./provider";
import { persistedReply } from "./stream";

function failure(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleChat(
  request: Request,
  reference: string,
  keepAlive: (work: Promise<void>) => void = () => {},
) {
  const startedAt = Date.now();
  try {
    // Validate chat input.
    checkOrigin(request);
    const input = await readTurn(request);

    // Reserve a saved turn.
    const trip = await getTrip(reference);
    if (!process.env.OPENAI_API_KEY?.trim())
      return failure(
        "The assistant is temporarily unavailable. Please try again later.",
        503,
      );
    agentModel();
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(540000),
    ]);
    const generation = randomUUID();
    const turn = await beginTurn(trip.reference, input, generation);

    // Read saved attachments.
    try {
      const environment = await openSession(
        trip.reference,
        input.conversationId,
        turn.responseId,
        generation,
        signal,
      );
      const modelMessages = await resolveDocuments(
        trip.reference,
        turn.messages,
        turn.documents,
      );
      environment.artifacts?.provideSelectedDocuments(turn.documents.map(document => document.id));
      // Renew before provider access.
      await saveReply(
        trip.reference,
        input.conversationId,
        turn.responseId,
        generation,
        "",
        "streaming",
      );
      // Stream and persist reply.
      return persistedReply(
        trip,
        input.conversationId,
        generation,
        { ...turn, modelMessages },
        signal,
        keepAlive,
        environment,
      );
    } catch (error) {
      const providerDetails = reportProviderFailure(error);
      await saveReply(
        trip.reference,
        input.conversationId,
        turn.responseId,
        generation,
        "",
        signal.aborted ? "interrupted" : "failed",
        { code: signal.aborted ? failureCode(signal.reason) : error instanceof DocumentError || error instanceof WorkspaceError || error instanceof ConversationError ? "storage_error" : failureCode(error), steps: 0, elapsedMs: Date.now() - startedAt, finishReason: null, ...providerDetails },
      );
      if (error instanceof DocumentError)
        return failure(
          "Your message is saved, but a required project document could not be read. Check it in Library, then retry.",
          503,
        );
      throw error;
    }
  } catch (error) {
    if (
      error instanceof ConversationError ||
      error instanceof TripError ||
      error instanceof WorkspaceError
    )
      return failure(error.message, error.status);
    if (error instanceof AgentConfigurationError)
      return failure(error.message, 503);
    return failure(chatErrorMessage(error), 502);
  }
}
