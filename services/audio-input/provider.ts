import "server-only";
import { openai } from "@ai-sdk/openai";
import { APICallError, transcribe } from "ai";
import { AUDIO_MAX_TEXT } from "@/lib/audio-input/types";
import { AudioError } from "./validation";

export function transcriptionModel() {
  // Verified 2026-10-26: OpenAI's file-transcription guide recommends this model.
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe";
  if (model !== "gpt-transcribe") throw new AudioError("Voice input is temporarily unavailable. You can still type your message.", 503, "configuration");
  if (!process.env.OPENAI_API_KEY?.trim()) throw new AudioError("Voice input is temporarily unavailable. You can still type your message.", 503, "configuration");
  return model;
}

export async function transcribeAudio(bytes: Uint8Array, model: string, signal: AbortSignal) {
  const result = await transcribe({ model: openai.transcription(model), audio: bytes, maxRetries: 0, abortSignal: AbortSignal.any([signal, AbortSignal.timeout(40000)]) });
  const text = result.text.trim();
  if (!text) throw new AudioError("No speech was detected. Record again or retry.", 422, "no_speech");
  if (text.length > AUDIO_MAX_TEXT) throw new AudioError("The transcript is too long. Try a shorter recording.", 422, "transcript_size");
  return text;
}

export function audioFailure(error: unknown): AudioError {
  if (error instanceof AudioError) return error;
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return new AudioError("Transcription timed out or was cancelled. Retry when you are ready.", 504, "timeout");
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return new AudioError("Transcription is busy or has reached its usage limit. Try again shortly.", 429, "provider_limit");
    if ([401, 403].includes(error.statusCode ?? 0)) return new AudioError("Voice input is temporarily unavailable. You can still type your message.", 503, "configuration");
    if (error.statusCode === 400) return new AudioError("The transcription service could not read this recording. Please record again.", 422, "invalid_audio");
  }
  return new AudioError("Could not transcribe the recording. Retry or record again.", 502, "provider");
}
