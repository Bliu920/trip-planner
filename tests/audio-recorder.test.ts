import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { beginCapture } from "../lib/audio-input/recorder";
import { AUDIO_MAX_BYTES } from "../lib/audio-input/types";

class Track extends EventTarget { stopped = false; stop() { this.stopped = true; } }
class Recorder {
  static supported = "audio/webm;codecs=opus";
  static current: Recorder;
  static isTypeSupported(type: string) { return type === this.supported; }
  state = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, options: { mimeType: string }) { this.mimeType = options.mimeType; Recorder.current = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; }
  data(text: string) { this.ondataavailable?.({ data: new Blob([text]) }); }
}
const descriptors = new Map(["window", "navigator", "MediaRecorder"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let track: Track;
let acquire: () => Promise<unknown>;
beforeEach(() => {
  track = new Track(); acquire = async () => ({ getTracks: () => [track] }); Recorder.supported = "audio/webm;codecs=opus";
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: () => acquire() } } });
  Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: Recorder });
});
afterEach(() => { for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

test("stop releases the microphone immediately and includes the final encoded chunk", async () => {
  const capture = await beginCapture(new AbortController().signal, () => assert.fail("unexpected interruption"));
  Recorder.current.data("first"); const finished = capture.finish();
  assert.equal(track.stopped, true); Recorder.current.data("last"); Recorder.current.onstop?.();
  const blob = await finished; assert.equal(await blob.text(), "firstlast"); assert.equal(blob.type, "audio/webm");
});

test("late permission after cancellation releases tracks without creating a recorder", async () => {
  let grant!: (stream: unknown) => void; acquire = () => new Promise(resolve => { grant = resolve; });
  const controller = new AbortController(); const pending = beginCapture(controller.signal, () => {});
  controller.abort(); grant({ getTracks: () => [track] });
  await assert.rejects(pending, { name: "AbortError" }); assert.equal(track.stopped, true);
});

test("cancel ignores queued recorder callbacks and discards all chunks", async () => {
  const capture = await beginCapture(new AbortController().signal, () => assert.fail("cancel is not an interruption"));
  const late = Recorder.current.ondataavailable; capture.cancel(); late?.({ data: new Blob(["late"]) });
  await assert.rejects(capture.finish(), { name: "AbortError" }); assert.equal(track.stopped, true);
});

test("disconnect, encoding failure and oversize clips all release the microphone", async () => {
  for (const cause of ["disconnect", "encoding", "size"]) {
    track = new Track(); let interruptions = 0;
    const capture = await beginCapture(new AbortController().signal, () => { interruptions++; });
    if (cause === "disconnect") track.dispatchEvent(new Event("ended"));
    if (cause === "encoding") Recorder.current.onerror?.();
    if (cause === "size") Recorder.current.ondataavailable?.({ data: new Blob([new Uint8Array(AUDIO_MAX_BYTES + 1)]) });
    await assert.rejects(capture.finish()); assert.equal(interruptions, 1); assert.equal(track.stopped, true);
  }
});

test("missing final recorder event has a bounded deadline", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const capture = await beginCapture(new AbortController().signal, () => {});
  const pending = capture.finish(); context.mock.timers.tick(3000);
  await assert.rejects(pending, /Could not finish/); assert.equal(track.stopped, true);
});

test("MP4 fallback is supported and unsupported formats never request permission", async () => {
  Recorder.supported = "audio/mp4";
  const capture = await beginCapture(new AbortController().signal, () => {});
  const pending = capture.finish(); Recorder.current.data("mp4"); Recorder.current.onstop?.();
  assert.equal((await pending).type, "audio/mp4");
  Recorder.supported = "audio/ogg"; let requested = false; acquire = async () => { requested = true; return {}; };
  await assert.rejects(beginCapture(new AbortController().signal, () => {}), /supported audio format/); assert.equal(requested, false);
});

test("finishing a recording closes its meter before the final chunk arrives", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "AudioContext"); let closes = 0;
  class Context {
    state = "running";
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 0, disconnect() {}, getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(.1) }; }
    resume() { return Promise.resolve(); }
    close() { closes++; return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
  try {
    const capture = await beginCapture(new AbortController().signal, () => {});
    assert.ok((capture.sample?.() ?? 0) > 0);
    const pending = capture.finish(); assert.equal(closes, 1); assert.equal(capture.sample?.(), 0);
    Recorder.current.data("final"); Recorder.current.onstop?.(); await pending;
    capture.cancel(); assert.equal(closes, 1); assert.equal(track.stopped, true);
  } finally { if (saved) Object.defineProperty(globalThis, "AudioContext", saved); else Reflect.deleteProperty(globalThis, "AudioContext"); }
});
