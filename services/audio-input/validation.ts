import "server-only";
import { AUDIO_MAX_BYTES, AUDIO_TYPES } from "@/lib/audio-input/types";

export class AudioError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
export function validateAudioRequest(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AudioError("Open audio input from this app.", 403, "origin");
  }
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.includes(type as typeof AUDIO_TYPES[number])) throw new AudioError("Record audio in a supported browser.", 415, "format");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > AUDIO_MAX_BYTES)) throw new AudioError("The recording is too large. Try a shorter recording.", 413, "size");
  return type!;
}

export async function readAudio(request: Request, type: string) {
  const reader = request.body?.getReader();
  if (!reader) throw new AudioError("The recording is empty. Record again.", 400, "empty");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => rejectAbort(new AudioError("Audio upload timed out or was cancelled. Try again.", request.signal.aborted ? 499 : 504, "timeout"));
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (signal.aborted) abort();
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > AUDIO_MAX_BYTES) throw new AudioError("The recording is too large. Try a shorter recording.", 413, "size");
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { signal.removeEventListener("abort", abort); }
  const bytes = Buffer.concat(chunks);
  const valid = type === "audio/webm"
    ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    : bytes.subarray(4, 8).toString() === "ftyp";
  if (size < 16 || !valid) throw new AudioError("The audio could not be read. Please record again.", 400, "invalid_audio");
  return bytes;
}
