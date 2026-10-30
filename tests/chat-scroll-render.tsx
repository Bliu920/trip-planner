import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { user, reply } from "./chat-response-fixture";

// Isolate persistence, render real rows.
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const chat = require("../lib/chat") as typeof import("../lib/chat");
const snapshot = {
  conversationId: "conversation",
  conversations: [{ id: "conversation", createdAt: "2026-10-30" }],
  documents: [],
  messages: [user, reply([], "Saved reply", "complete")],
};
let state: ReturnType<typeof chat.usePersistentChat> = {
  snapshot,
  messages: snapshot.messages,
  loading: false,
  syncing: false,
  historyError: "",
  notice: "",
  documentError: "",
  busy: false,
  remoteBusy: false,
  error: undefined,
  canSend: true,
  send: () => true,
  retry: () => {},
  refresh: async () => {},
  open: async () => {},
  stop: async () => {},
  removeDocument: async () => {},
  newChat: async () => {},
};
require.cache[require.resolve("../lib/chat")]!.exports = {
  ...chat,
  usePersistentChat: () => state,
};
const { TripChat } = require("../lib/workspace/chat") as typeof import("../lib/workspace/chat");
const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "fixture",
} satisfies AppRouterInstance;
function render() {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <TripChat reference="fixture" />
    </AppRouterContext.Provider>,
  );
}
const saved = render();
assert.match(saved, /data-message-id="user-one" data-scroll-anchor="true"/);
assert.match(saved, /data-message-id="reply-user-one-0" data-scroll-anchor="false"/);
assert.equal((saved.match(/data-slot="message-scroller-item"/g) ?? []).length, 2);
assert.match(saved, /data-slot="message-scroller-button"/);

// A placeholder and streamed reply share their row identity.
state = { ...state, busy: true, messages: [user] };
const pending = render();
assert.match(pending, /data-message-id="reply-user-one-0" data-scroll-anchor="false"/);
state = { ...state, messages: [user, reply([], "Streaming reply")] };
const streaming = render();
assert.match(streaming, /data-message-id="reply-user-one-0" data-scroll-anchor="false"/);
assert.equal((streaming.match(/data-scroll-anchor="true"/g) ?? []).length, 1);

state = { ...state, busy: false, notice: "Your message was not saved." };
assert.match(render(), /data-message-id="chat-notice" data-scroll-anchor="false"/);
state = { ...state, notice: "", historyError: "Could not load history." };
assert.match(render(), /data-message-id="chat-history-error" data-scroll-anchor="false"/);
console.log("Chat rows preserve stable identities, user anchors and status boundaries.");
