import assert from "node:assert/strict";
import { test } from "node:test";
import { notifyTripChanged, subscribeTripChanges } from "../lib/trips/events";

test("project invalidation is scoped, cross-tab, focus-aware and disposable", () => {
  const keys = ["window", "document", "BroadcastChannel"] as const;
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const channels = new Set<Channel>();
  class Channel {
    onmessage: ((event: { data: string }) => void) | null = null;
    constructor() { channels.add(this); }
    postMessage(data: string) { channels.forEach(channel => { if (channel !== this) channel.onmessage?.({ data }); }); }
    close() { channels.delete(this); }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: Channel });
  try {
    let first = 0, other = 0;
    const stop = subscribeTripChanges("first", () => first++);
    const stopOther = subscribeTripChanges("other", () => other++);
    notifyTripChanged("first");
    assert.equal(first, 2); // Same-tab event and simulated remote channel.
    assert.equal(other, 0);
    win.dispatchEvent(new Event("focus"));
    assert.equal(first, 3);
    assert.equal(other, 1);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(first, 3);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(first, 4);
    stop(); stopOther();
    assert.equal(channels.size, 0);
    notifyTripChanged("first");
    win.dispatchEvent(new Event("focus"));
    assert.equal(first, 4);
  } finally {
    keys.forEach((key, index) => {
      if (originals[index]) Object.defineProperty(globalThis, key, originals[index]!);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
