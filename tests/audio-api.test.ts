import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { handleTranscription } from "../services/audio-input";
import { AUDIO_MAX_BYTES } from "../lib/audio-input/types";

const savedFetch = globalThis.fetch;
const env = Object.fromEntries(["OPENAI_API_KEY", "OPENAI_TRANSCRIPTION_MODEL"].map(key => [key, process.env[key]]));
const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(40).fill(0)]);
let calls = 0;
beforeEach(() => {
  process.env.OPENAI_API_KEY = "synthetic-key"; delete process.env.OPENAI_TRANSCRIPTION_MODEL; calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ text: "我想在意大利旅行。" }); };
});
afterEach(() => { globalThis.fetch = savedFetch; for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
function request(body: BodyInit = bytes, type = "audio/webm", origin = "http://localhost", signal?: AbortSignal) {
  return new Request("http://localhost/api/audio/transcribe", { method: "POST", headers: { origin, "Content-Type": type }, body, signal });
}

test("audio route rejects unsupported, malformed, oversized and cross-origin input", async () => {
  assert.equal((await handleTranscription(request(bytes, "audio/webm", "https://outside.example"))).status, 403);
  assert.equal((await handleTranscription(request(bytes, "application/json"))).status, 415);
  assert.equal((await handleTranscription(request(new Uint8Array(32)))).status, 400);
  assert.equal((await handleTranscription(request(new Uint8Array(AUDIO_MAX_BYTES + 1)))).status, 413);
  assert.equal((await handleTranscription(request(new Uint8Array()))).status, 400);
  assert.equal((await handleTranscription(request(bytes, "audio/mp4"))).status, 400);
  assert.equal(calls, 0);
});

test("uses the transcription model and actual audio bytes without trip context", async () => {
  globalThis.fetch = async (url, init) => {
    calls++; assert.match(String(url), /\/audio\/transcriptions$/);
    const form = init?.body as FormData;
    assert.equal(form.get("model"), "gpt-transcribe");
    assert.deepEqual([...form.keys()].sort(), ["file", "model"]);
    assert.deepEqual(new Uint8Array(await (form.get("file") as File).arrayBuffer()), bytes);
    return Response.json({ text: " 我想在意大利旅行。 ", languages: [{ code: "zh" }] });
  };
  const response = await handleTranscription(request());
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { text: "我想在意大利旅行。" }); assert.equal(calls, 1);
});

test("configuration failures never invoke the provider", async () => {
  delete process.env.OPENAI_API_KEY; assert.equal((await handleTranscription(request())).status, 503);
  process.env.OPENAI_API_KEY = "synthetic-key"; process.env.OPENAI_TRANSCRIPTION_MODEL = "gpt-5-mini";
  assert.equal((await handleTranscription(request())).status, 503); assert.equal(calls, 0);
});

test("deprecated, legacy and incompatible model overrides are rejected before provider access", async () => {
  for (const model of ["gpt-4o-mini-transcribe", "gpt-4o-mini-transcribe-2025-12-15", "gpt-4o-transcribe", "gpt-4o-transcribe-diarize", "whisper-1", "gpt-live-transcribe", "unverified-model"]) {
    process.env.OPENAI_TRANSCRIPTION_MODEL = model;
    const response = await handleTranscription(request());
    assert.equal(response.status, 503, model);
    const result = await response.json();
    assert.equal(result.code, "configuration"); assert.match(result.error, /temporarily unavailable/);
    assert.doesNotMatch(result.error, /OPENAI_|gpt-|configuration|provider/i);
  }
  assert.equal(calls, 0);
});

test("MP4 recordings reach OpenAI as audio with the configured transcription model", async () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32, ...new Array(20).fill(0)]);
  process.env.OPENAI_TRANSCRIPTION_MODEL = "gpt-transcribe";
  globalThis.fetch = async (_url, init) => {
    const form = init?.body as FormData;
    assert.equal(form.get("model"), "gpt-transcribe");
    const file = form.get("file") as File;
    assert.match(file.type, /audio\/(mp4|m4a)/);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), mp4);
    return Response.json({ text: "MP4 transcript", languages: [] });
  };
  assert.equal((await handleTranscription(request(mp4, "audio/mp4"))).status, 200);
});

test("provider limits and failures are sanitized and never automatically retried", async () => {
  for (const status of [429, 401, 400, 500]) {
    calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ error: { message: "private account details synthetic-key", type: "api_error" } }, { status }); };
    const response = await handleTranscription(request());
    assert.equal(response.status, status === 429 ? 429 : status === 401 ? 503 : status === 400 ? 422 : 502);
    assert.doesNotMatch(await response.text(), /private account|synthetic-key/); assert.equal(calls, 1);
  }
});

test("empty and excessively long transcripts are not silently accepted or truncated", async () => {
  for (const text of ["  ", "x".repeat(8001)]) {
    globalThis.fetch = async () => Response.json({ text });
    assert.equal((await handleTranscription(request())).status, 422);
  }
});

test("two active calls bound capacity, cancellation frees slots", async () => {
  const started: (() => void)[] = []; let entered = 0;
  const waitStarted = () => new Promise<void>(resolve => started.push(resolve));
  globalThis.fetch = async (_url, init) => {
    entered++; started.shift()?.();
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("cancelled", "AbortError"));
      if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  };
  const a = new AbortController(); const b = new AbortController();
  const firstStarted = waitStarted(); const first = handleTranscription(request(bytes, "audio/webm", "http://localhost", a.signal)); await firstStarted;
  const secondStarted = waitStarted(); const second = handleTranscription(request(bytes, "audio/webm", "http://localhost", b.signal)); await secondStarted;
  const third = await handleTranscription(request()); assert.equal(third.status, 429); assert.equal(entered, 2);
  a.abort(); b.abort(); await Promise.all([first, second]);
  globalThis.fetch = async () => Response.json({ text: "Recovered" });
  assert.equal((await handleTranscription(request())).status, 200);
});

test("aborted streamed body is cancelled before a provider call", async () => {
  let cancelled = false; const controller = new AbortController();
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const req = new Request("http://localhost/api/audio/transcribe", { method: "POST", headers: { origin: "http://localhost", "Content-Type": "audio/webm" }, body, signal: controller.signal, duplex: "half" } as RequestInit);
  const pending = handleTranscription(req); controller.abort();
  assert.equal((await pending).status, 499); assert.equal(cancelled, true); assert.equal(calls, 0);
});
