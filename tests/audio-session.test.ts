import assert from "node:assert/strict";
import { test } from "node:test";
import { AudioSession } from "../lib/audio-input/session";
import { appendTranscript, AUDIO_MAX_BYTES, type Capture, type CaptureFactory, type Transcriber } from "../lib/audio-input/types";

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const clip = new Blob(["synthetic bytes"], { type: "audio/webm" });
function fixture(transcriber: Transcriber = async () => "A calm trip.") {
  let stops = 0; let cancels = 0;
  const capture: Capture = { finish: async () => { stops++; return clip; }, cancel: () => { cancels++; } };
  const session = new AudioSession(async () => capture, transcriber);
  return { session, stops: () => stops, cancels: () => cancels };
}

test("dictation preserves typed text, supports multilingual dictation and refuses overflow", () => {
  assert.equal(appendTranscript("Travel:", " 意大利旅行 "), "Travel: 意大利旅行");
  assert.equal(appendTranscript("Travel:\n", "Italy"), "Travel:\nItaly");
  assert.equal(appendTranscript("x".repeat(3990), "too much additional text"), null);
});

test("cancelled permission grants release their late capture and never start transcription", async () => {
  const permission = deferred<Capture>(); let cancelled = 0; let calls = 0;
  const session = new AudioSession(() => permission.promise, async () => { calls++; return "ignored"; });
  const start = session.start(); assert.equal(session.getSnapshot().phase, "permission");
  session.cancel(); permission.resolve({ finish: async () => clip, cancel: () => { cancelled++; } });
  await start;
  assert.equal(session.getSnapshot().phase, "idle"); assert.equal(cancelled, 1); assert.equal(calls, 0);
});

test("confirm inserts once into the latest draft without a second acceptance step", async context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  let acquisitions = 0; let finishes = 0; let providerCalls = 0; let insertions = 0;
  let draft = "Keep my draft.";
  const response = deferred<string>();
  const session = new AudioSession(async () => { acquisitions++; return { finish: async () => { finishes++; return clip; }, cancel: () => {} }; }, async () => { providerCalls++; return response.promise; });
  const unsubscribe = session.subscribe(() => {
    if (session.getSnapshot().phase === "ready") session.accept(text => { insertions++; draft = appendTranscript(draft, text)!; return null; });
  });
  await Promise.all([session.start(), session.start()]); context.mock.timers.tick(1200);
  const pending = Promise.all([session.stop(), session.stop()]); await Promise.resolve();
  draft = "Latest draft."; response.resolve(" 我想慢慢旅行。 "); await pending;
  assert.equal(acquisitions, 1); assert.equal(finishes, 1); assert.equal(providerCalls, 1); assert.equal(insertions, 1);
  assert.equal(draft, "Latest draft. 我想慢慢旅行。"); assert.equal(session.getSnapshot().phase, "idle");
  unsubscribe();
});

test("failed insertion preserves the full transcript for recovery", async context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  const f = fixture(); await f.session.start(); context.mock.timers.tick(1000); await f.session.stop();
  f.session.accept(() => "Prompt is too long.");
  assert.equal(f.session.getSnapshot().phase, "error"); assert.equal(f.session.getSnapshot().text, "A calm trip.");
  assert.equal(f.session.getSnapshot().retryable, false); f.session.cancel();
});

test("transcription failure retains the same clip for an explicit retry", async context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  let calls = 0; const clips: Blob[] = [];
  const f = fixture(async value => { clips.push(value); if (++calls === 1) throw new Error("offline"); return "Retry succeeded"; });
  await f.session.start(); context.mock.timers.tick(1000); await f.session.stop();
  assert.equal(f.session.getSnapshot().phase, "error"); assert.equal(f.session.getSnapshot().retryable, true);
  await f.session.retry(); assert.equal(f.session.getSnapshot().phase, "ready");
  assert.equal(clips[0], clips[1]); assert.equal(f.stops(), 1); f.session.cancel();
});

test("discard aborts transcription and ignores a late result", async context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  const response = deferred<string>(); let signal!: AbortSignal;
  const f = fixture(async (_clip, value) => { signal = value; return response.promise; });
  await f.session.start(); context.mock.timers.tick(1000); const pending = f.session.stop();
  await Promise.resolve(); assert.equal(f.session.getSnapshot().phase, "transcribing");
  f.session.cancel(); assert.equal(signal.aborted, true); response.resolve("Do not insert"); await pending;
  assert.equal(f.session.getSnapshot().phase, "idle"); assert.equal(f.session.getSnapshot().text, "");
});

test("duration cap stops recording and hidden-page interruption clears capture", async context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  const f = fixture(); await f.session.start(); context.mock.timers.tick(60000);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.stops(), 1); assert.equal(f.session.getSnapshot().phase, "ready");
  f.session.cancel(); await f.session.start(); f.session.interrupt();
  assert.equal(f.session.getSnapshot().phase, "error"); assert.equal(f.session.getSnapshot().retryable, false);
  assert.ok(f.cancels() >= 1); f.session.cancel();
});

test("short, empty and oversized recordings do not call transcription", async context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  let calls = 0;
  for (const [blob, delay] of [[clip, 10], [new Blob(), 1000], [new Blob([new Uint8Array(AUDIO_MAX_BYTES + 1)]), 1000]] as const) {
    const session = new AudioSession(async () => ({ finish: async () => blob, cancel: () => {} }), async () => { calls++; return "not called"; });
    await session.start(); context.mock.timers.tick(delay); await session.stop();
    assert.equal(session.getSnapshot().phase, "error"); assert.equal(session.getSnapshot().retryable, false); session.cancel();
  }
  assert.equal(calls, 0);
});

test("permission errors are actionable, and empty transcripts remain recoverable", async context => {
  const denied = new AudioSession(async () => { throw new DOMException("private detail", "NotAllowedError"); });
  await denied.start(); assert.match(denied.getSnapshot().error, /browser settings/); assert.doesNotMatch(denied.getSnapshot().error, /private detail/);
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  const f = fixture(async () => "  "); await f.session.start(); context.mock.timers.tick(1000); await f.session.stop();
  assert.equal(f.session.getSnapshot().phase, "error"); assert.match(f.session.getSnapshot().error, /No speech/); f.session.cancel();
});

test("an interrupted recorder invalidates its callbacks and never uploads partial speech", async () => {
  let interrupted!: (error: Error) => void; let cancels = 0; let calls = 0;
  const capture: CaptureFactory = async (_signal, notify) => { interrupted = notify; return { finish: async () => clip, cancel: () => { cancels++; } }; };
  const session = new AudioSession(capture, async () => { calls++; return ""; });
  await session.start(); interrupted(new Error("Microphone disconnected"));
  assert.equal(cancels, 1); assert.equal(calls, 0); assert.equal(session.getSnapshot().phase, "error");
  session.cancel(); interrupted(new Error("stale")); assert.equal(session.getSnapshot().phase, "idle");
});

test("waveform reflects bounded capture levels and resets on cancellation", async context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  let level = .4;
  const session = new AudioSession(async () => ({ finish: async () => clip, cancel: () => {}, sample: () => level }));
  await session.start(); context.mock.timers.tick(80);
  assert.equal(session.getSnapshot().levels.at(-1), .4);
  level = 10; context.mock.timers.tick(80); assert.equal(session.getSnapshot().levels.at(-1), 1);
  level = Number.NaN; context.mock.timers.tick(80); assert.equal(session.getSnapshot().levels.at(-1), 0);
  session.cancel(); context.mock.timers.tick(1000);
  assert.equal(session.getSnapshot().phase, "idle"); assert.ok(session.getSnapshot().levels.every(value => value === 0));
});
