import "server-only";
import type { Trip } from "@/lib/trips/types";
import type { ChatTurn, MessageStatus } from "@/lib/chat/types";
import type { ReplyFailure, ReplyFailureCode } from "@/lib/chat/failure";
import { actionBlocker } from "@/lib/actions";
import { beginTurn, saveReply, progressStore, ConversationError, reportPersistenceFailure } from "./conversation-store";
import { DocumentError } from "@/services/documents";
import { openSession, WorkspaceError } from "@/services/workspace";
import { runAgent, type AgentSnapshot, type AgentRunResult } from "./agent";
import { resolveDocuments } from "./agent/context";
import { boundedFailure, failureCode, reportAgentError, reportProviderFailure, chatErrorMessage } from "./agent/diagnostics";
import { ProgressRecorder } from "./progress";
import type { ReplyLifecycle } from "./stream";

export async function prepareTurn(trip: Trip, input: ChatTurn, generation: string, signal: AbortSignal, startedAt: number) {
  // Reserve and restore work.
  const turn = await beginTurn(trip.reference, input, generation);
  try {
    const environment = await openSession(trip.reference, input.conversationId, turn.responseId, generation, signal);
    const modelMessages = await resolveDocuments(trip.reference, turn.messages, turn.documents);
    environment.artifacts?.provideSelectedDocuments(turn.documents.map(document => document.id));
    // Renew before provider access.
    await saveReply(trip.reference, input.conversationId, turn.responseId, generation, "", "streaming");
    return { trip, conversation: input.conversationId, generation, turn, modelMessages, environment, signal };
  } catch (error) {
    const providerDetails = reportProviderFailure(error);
    await saveReply(trip.reference, input.conversationId, turn.responseId, generation, "", signal.aborted ? "interrupted" : "failed", {
      code: signal.aborted ? failureCode(signal.reason) : error instanceof DocumentError || error instanceof WorkspaceError || error instanceof ConversationError ? "storage_error" : failureCode(error),
      steps: 0, elapsedMs: Date.now() - startedAt, finishReason: null, ...providerDetails,
      ...(error instanceof WorkspaceError ? { termination: { kind: "validation" as const, errorType: "WorkspaceError", diagnosticCode: error.code } } : {}),
    });
    throw error;
  }
}

export function replyLifecycle(prepared: Awaited<ReturnType<typeof prepareTurn>>): ReplyLifecycle {
  const { trip, conversation, generation, turn, modelMessages, environment, signal } = prepared;
  const startedAt = Date.now();
  let observed: Readonly<AgentSnapshot> = { text: "", steps: 0, finishReason: null, stage: "open_stream", action: null };
  let result: AgentRunResult | undefined;
  let failure: ReplyFailureCode | undefined;
  let termination: ReplyFailure["termination"];
  let storageFailed = false;
  const storageAbort = new AbortController();
  const replySignal = AbortSignal.any([signal, storageAbort.signal]);
  const diagnostics = (): ReplyFailure | undefined => failure ? boundedFailure({ code: failure, steps: observed.steps, elapsedMs: Date.now() - startedAt, finishReason: observed.finishReason,
    ...(failure === "provider_limit" ? result?.providerDetails : {}), ...(result?.progressSaved ? { progressSaved: true } : {}), ...(termination ? { termination } : {}),
    ...(result?.inputFailure ? { inputFailure: result.inputFailure } : {}), ...(actionBlocker(observed.action) ? { blocker: actionBlocker(observed.action) } : {}), progress: result?.progress }) : undefined;
  const storageFailure = (error: unknown, stage: NonNullable<ReplyFailure["termination"]>["stage"]) => {
    termination = reportPersistenceFailure(error, turn.responseId, stage);
    storageFailed = true;
    failure = "storage_error";
    storageAbort.abort();
  };

  // Serialize heartbeat writes.
  let checkpoint = Promise.resolve();
  const heartbeat = setInterval(() => {
    checkpoint = checkpoint.then(() => saveReply(trip.reference, conversation, turn.responseId, generation, observed.text, "streaming"))
      .catch(error => storageFailure(error, "heartbeat"));
  }, 20000);
  const clearHeartbeat = () => clearInterval(heartbeat);
  replySignal.addEventListener("abort", clearHeartbeat, { once: true });
  const cleanup = () => { clearHeartbeat(); replySignal.removeEventListener("abort", clearHeartbeat); };
  let terminalSave: Promise<void> | undefined;
  const persistTerminal = (text: string) => terminalSave ??= (async () => {
    const status: MessageStatus = failure ? ["timeout", "cancelled", "output_limit", "step_limit"].includes(failure) ? "interrupted" : "failed" : "complete";
    const report = diagnostics();
    if (report) console.warn(JSON.stringify({ event: "chat_reply_incomplete", messageId: turn.responseId, ...report, saveState: observed.action?.state ?? null, actionCode: observed.action?.code ?? null }));
    try { await saveReply(trip.reference, conversation, turn.responseId, generation, text, status, report); }
    catch (error) { storageFailure(error, "final_reply"); throw error; }
  })();

  return {
    onSetupError: async error => {
      cleanup();
      await checkpoint;
      if (!storageFailed) {
        termination = reportAgentError(error, turn.responseId, "stream", undefined, "open_stream");
        failure ??= failureCode(error);
      }
      await persistTerminal(observed.text);
    },
    onError: error => {
      if (!storageFailed) {
        termination ??= reportAgentError(error, turn.responseId, "stream");
        failure ??= failureCode(error);
      }
      return chatErrorMessage(error);
    },
    execute: async ({ writer }) => {
      const saveProgress = progressStore(trip.reference, conversation, turn.responseId, generation);
      let finishing = false;
      const progress = new ProgressRecorder(generation, async entry => {
        try { await saveProgress(entry); }
        catch (error) { if (!finishing) storageFailure(error, "activity"); throw error; }
      }, entry => writer.write({ type: "data-activity", id: entry.id, data: entry }));
      // Execute the harness.
      try {
        writer.write({ type: "start", messageId: turn.responseId });
        await progress.start();
        result = await runAgent(modelMessages, environment, replySignal, {
          onChunk: async chunk => { await progress.consume(chunk); writer.write(chunk); },
          onSnapshot: snapshot => { observed = snapshot; },
        });
        observed = result;
        if (!storageFailed) { failure = result.failure; termination = result.termination; }
      } catch (error) {
        if (!storageFailed) {
          termination = reportAgentError(error, turn.responseId, "execute", undefined, observed.stage);
          failure ??= failureCode(error);
        }
      } finally {
        // Finish observable progress.
        finishing = true;
        await progress.finish(failure ? ["timeout", "cancelled", "output_limit", "step_limit"].includes(failure) ? "interrupted" : "failed" : "complete")
          .catch(error => { reportPersistenceFailure(error, turn.responseId, "activity_finish"); });
        if (observed.text) {
          const id = `${turn.responseId}-reply`;
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: observed.text });
          writer.write({ type: "text-end", id });
        }
        if (observed.action) writer.write({ type: "data-action", id: turn.responseId, data: observed.action });
        const report = diagnostics();
        if (report) writer.write({ type: "data-failure", id: turn.responseId, data: report });
        writer.write({ type: "finish" });
        writer.setOutcome({ status: "completed" });
      }
    },
    onEnd: async ({ responseMessage, isAborted, isCancelled, outcome, finishReason }) => {
      // Reconcile before final persistence.
      cleanup();
      await checkpoint;
      const text = (responseMessage.parts.filter(part => part.type === "text").map(part => part.text).join("") || observed.text).slice(0, 16000);
      if (!failure && (isAborted || isCancelled || replySignal.aborted)) failure = "cancelled";
      if (!failure && finishReason === "length") failure = "output_limit";
      if (!failure && outcome.status !== "completed") failure = "provider_error";
      await persistTerminal(text);
    },
    onDrainError: error => { reportAgentError(error, turn.responseId, "stream", undefined, "stream_consumer"); },
    onDrain: () => {
      cleanup();
      if (storageFailed) console.error("Chat reply persistence or stream processing failed; reload history to recover.");
    },
  };
}
