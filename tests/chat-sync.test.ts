import assert from "node:assert/strict";
import { test } from "node:test";
import { committedActions, mergeActivity, reconcileHistory } from "../lib/chat/reconcile";
import { chatTurn } from "../lib/chat/transport";
import type { ChatMessage, ChatSnapshot } from "../lib/chat/types";
import { entry, reply, user } from "./chat-response-fixture";

function snapshot(messages: ChatMessage[]): ChatSnapshot {
  return { conversationId: "conversation", conversations: [], documents: [], messages };
}

test("history keeps an unconfirmed local message and removes it only after its ID is saved", () => {
  const history = snapshot([reply([], "Earlier answer", "complete")]);
  const waiting = reconcileHistory(history, user);
  assert.equal(waiting.pending, user);
  assert.deepEqual(waiting.messages, [...history.messages, user]);
  assert.equal(history.messages.length, 1, "reconciliation must not mutate stored history");
  const saved = snapshot([...history.messages, user]);
  const confirmed = reconcileHistory(saved, user);
  assert.equal(confirmed.pending, null);
  assert.equal(confirmed.messages, saved.messages, "the stored message must not be duplicated");
  assert.equal(reconcileHistory(saved, null).messages, saved.messages);
});

test("a regenerated reply retains earlier work, with the live version winning for matching step IDs", () => {
  const prior = reply(
    [
      entry("old-attempt", "interrupted", "Checked places"),
      entry("current", "running", "Checking prices"),
    ],
    "Old prose",
  );
  const live = reply([entry("current", "complete", "Checked prices")], "New prose");
  const merged = mergeActivity([user, live], [user, prior]);
  assert.equal(merged[0], user);
  assert.deepEqual(merged[1].parts, [prior.parts[0], ...live.parts]);
  assert.deepEqual(live.parts, [entryPart(), { type: "text", text: "New prose" }]);
  assert.equal(
    merged[1].parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(""),
    "New prose",
  );
  assert.equal(mergeActivity([live], [])[0], live);
  function entryPart() {
    return { type: "data-activity", data: entry("current", "complete", "Checked prices") };
  }
});

test("chat requests contain the latest text and canonical file/place IDs, preserving turn identity", () => {
  const latest: ChatMessage = {
    id: "new-message",
    role: "user",
    parts: [
      { type: "text", text: "Relaxed " },
      {
        type: "data-attachment",
        data: { id: "file", name: "Travel brief.md", mediaType: "text/markdown", size: 20 },
      },
      { type: "text", text: "please" },
      {
        type: "data-place",
        data: { id: "place_001", name: "Colosseum", city: "Rome", photo: null },
      },
    ],
  };
  assert.deepEqual(
    chatTurn([user, latest], "submit-message", {
      conversationId: "conversation",
      expectedLastId: "previous",
    }),
    {
      conversationId: "conversation",
      expectedLastId: "previous",
      retry: false,
      message: {
        id: "new-message",
        text: "Relaxed please",
        attachmentIds: ["file"],
        placeIds: ["place_001"],
      },
    },
  );
  assert.deepEqual(
    chatTurn([latest], "regenerate-message", {
      conversationId: "conversation",
      expectedLastId: "reply",
    }),
    {
      conversationId: "conversation",
      expectedLastId: "reply",
      retry: true,
      message: null,
    },
  );
});

test("only confirmed saves invalidate workspace views, with stable per-message keys", () => {
  const output = {
    outcome: "succeeded",
    effect: "persisted",
    code: "OK",
    message: "Saved",
    operationId: "operation",
    recovery: { action: "none", instruction: "" },
    data: null,
  };
  const tool = (type: string, state: string, result: unknown, toolCallId = "commit") => ({
    type,
    state,
    output: result,
    toolCallId,
    input: {},
  });
  const message = {
    id: "reply",
    role: "assistant",
    parts: [
      { type: "data-commit", data: { summary: "Saved", revision: 2 } },
      tool("tool-commit", "output-available", output),
      tool("tool-saveBrief", "output-available", output, "brief"),
      tool("tool-editPlan", "output-available", output, "edit"),
      tool("tool-commit", "input-available", output, "running"),
      tool("tool-commit", "output-available", { ...output, effect: "staged" }, "staged"),
      tool(
        "tool-commit",
        "output-available",
        { ...output, outcome: "failed", effect: "none" },
        "failed",
      ),
      tool("tool-commit", "output-available", { saved: true }, "invalid"),
    ],
  } as ChatMessage;
  assert.deepEqual(committedActions([message]), ["reply:receipt", "reply:commit", "reply:brief"]);
  assert.deepEqual(
    committedActions([message]),
    committedActions([message]),
    "re-renders must retain deduplication keys",
  );
});
