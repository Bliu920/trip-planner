import { REFERENCE_PATTERN, normalizeReference } from "../../../lib/trips/types";

export class TripError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function validateReference(value: string) {
  const reference = normalizeReference(value);
  if (!REFERENCE_PATTERN.test(reference)) throw new TripError("Enter a valid trip reference ID.", 400);
  return reference;
}

export async function readInput(request: Request): Promise<{ prompt: string } | { name: string; notes?: string }> {
  // Bound request bodies.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new TripError("Trip details could not be read. Reload and try again.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new TripError("Trip details are required.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24000) {
      await reader.cancel();
      throw new TripError("Trip details are too long.", 413);
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TripError("Trip details could not be read. Reload and try again.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TripError("Trip details are required.", 400);
  const { name, notes, prompt } = body as Record<string, unknown>;
  if (prompt !== undefined) {
    if (request.method !== "POST" || name !== undefined || notes !== undefined || typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
      throw new TripError("Start with a trip description of 1 to 4,000 characters.", 400);
    }
    return { prompt: prompt.trim() };
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    throw new TripError("Use a trip name between 1 and 100 characters.", 400);
  }
  if (notes !== undefined && (typeof notes !== "string" || notes.length > 5000)) throw new TripError("Keep trip notes under 5,000 characters.", 400);
  return { name: name.trim(), ...(notes !== undefined ? { notes: notes as string } : request.method === "POST" ? { notes: "" } : {}) };
}
