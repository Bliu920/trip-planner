import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createMeter } from "../lib/audio-input/meter";

const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
afterEach(() => { if (original) Object.defineProperty(globalThis, "AudioContext", original); else Reflect.deleteProperty(globalThis, "AudioContext"); });
const stream = {} as MediaStream;

test("meter measures actual samples without connecting to speakers and closes once", () => {
  let closes = 0; let disconnects = 0; let amplitude = .1; let connected = false;
  const analyser = { fftSize: 0, getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(amplitude), disconnect: () => { disconnects++; } };
  class Context {
    state = "running";
    createMediaStreamSource() { return { connect: (target: unknown) => { assert.equal(target, analyser); connected = true; }, disconnect: () => { disconnects++; } }; }
    createAnalyser() { return analyser; }
    resume() { return Promise.resolve(); }
    close() { closes++; return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
  const meter = createMeter(stream); assert.ok(connected); assert.ok(Math.abs(meter.sample() - .5) < .001);
  amplitude = 0; assert.equal(meter.sample(), 0);
  amplitude = 1; assert.equal(meter.sample(), 1);
  meter.close(); meter.close(); assert.equal(closes, 1); assert.equal(disconnects, 2); assert.equal(meter.sample(), 0);
});

test("unsupported or failed metering degrades to a quiet waveform", () => {
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: undefined });
  const unavailable = createMeter(stream); assert.equal(unavailable.sample(), 0); unavailable.close();
  let closed = false;
  class FailingContext {
    createMediaStreamSource() { throw new Error("no analyser"); }
    close() { closed = true; return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FailingContext });
  const failed = createMeter(stream); assert.equal(failed.sample(), 0); assert.ok(closed); failed.close();
});
