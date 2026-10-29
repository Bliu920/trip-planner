import "server-only";
import { AudioError, readAudio, validateAudioRequest } from "./validation";
import { audioFailure, transcriptionModel, transcribeAudio } from "./provider";

let active = 0;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function handleTranscription(request: Request) {
  let reserved = false;
  try {
    // Validate and reserve capacity.
    const type = validateAudioRequest(request);
    const model = transcriptionModel();
    if (active >= 2) throw new AudioError("Audio input is busy. Try again shortly.", 429, "capacity");
    ++active; reserved = true;
    // Read bounded audio.
    const bytes = await readAudio(request, type);
    // Transcribe without persistence.
    const text = await transcribeAudio(bytes, model, request.signal);
    return Response.json({ text }, { headers });
  } catch (error) {
    const failure = audioFailure(error);
    return Response.json({ error: failure.message, code: failure.code }, { status: failure.status, headers: { ...headers, ...(failure.status === 429 ? { "Retry-After": "5" } : {}) } });
  } finally { if (reserved) --active; }
}
