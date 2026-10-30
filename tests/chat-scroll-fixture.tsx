"use client";

import { useEffect, useRef, useState } from "react";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { TripChat } from "@/lib/workspace/chat";
import type { ChatMessage, ChatSnapshot } from "@/lib/chat";
import "@/lib/workspace/workspace.css";

const reference = "chat-scroll-fixture";
const paragraph =
  "Enjoy a relaxed morning in Rome, with time to walk, take breaks and explore at your own pace. ";
const initialMessages: ChatMessage[] = Array.from({ length: 24 }, (_, index) => ({
  id: `history-${index}`,
  role: index % 2 ? "assistant" : "user",
  parts: [
    {
      type: "text",
      text:
        index % 2
          ? `## Day ${index}\n\n${paragraph.repeat(10)}`
          : `Question ${index}: Plan a relaxed day.`,
    },
  ],
  metadata: { status: "complete", createdAt: "2026-10-30T12:00:00Z" },
}));

// Exercise real chat without services.
export default function ChatScrollFixture() {
  const [ready, setReady] = useState(false);
  const grow = useRef<(() => void) | null>(null);
  const finish = useRef<(() => void) | null>(null);
  useEffect(() => {
    const original = window.fetch;
    let messages = [...initialMessages];
    const base = `/api/trips/${reference}`;
    window.fetch = async (input, init) => {
      const url = String(input);
      if (!url.startsWith(base)) {
        if (init?.method && init.method !== "GET") throw new Error("Unexpected fixture write");
        return original(input, init);
      }
      if (url.includes("/conversations"))
        return Response.json({
          conversationId: "fixture-conversation",
          conversations: [{ id: "fixture-conversation", createdAt: "2026-10-30T12:00:00Z" }],
          documents: [],
          messages,
        } satisfies ChatSnapshot);
      if (url.endsWith("/documents")) return Response.json([]);
      if (url.endsWith("/chat")) {
        const turn = JSON.parse(String(init?.body));
        if (turn.message)
          messages.push({
            id: turn.message.id,
            role: "user",
            parts: [{ type: "text", text: turn.message.text }],
          });
        else messages = messages.slice(0, -1);
        const id = crypto.randomUUID();
        let text = "## Your next day\n\n";
        return createUIMessageStreamResponse({
          stream: new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({ type: "start", messageId: id });
              controller.enqueue({ type: "text-start", id: "text" });
              controller.enqueue({ type: "text-delta", id: "text", delta: text });
              grow.current = () => {
                const delta = `\n\n${paragraph.repeat(12)}`;
                text += delta;
                controller.enqueue({ type: "text-delta", id: "text", delta });
              };
              finish.current = () => {
                const metadata = { status: "complete" as const, createdAt: "2026-10-30T12:00:00Z" };
                messages.push({ id, role: "assistant", metadata, parts: [{ type: "text", text }] });
                controller.enqueue({ type: "text-end", id: "text" });
                controller.enqueue({ type: "finish", messageMetadata: metadata });
                controller.close();
                grow.current = null;
                finish.current = null;
              };
            },
          }),
        });
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return (
    <main>
      <aside aria-label="Scroll fixture controls" style={{ display: "flex", gap: 20, padding: 12 }}>
        {!ready && (
          <button className="cursor-pointer" onClick={() => setReady(true)}>
            Load conversation
          </button>
        )}
        <button className="cursor-pointer" onClick={() => grow.current?.()}>
          Stream more
        </button>
        <button className="cursor-pointer" onClick={() => finish.current?.()}>
          Finish response
        </button>
      </aside>
      <div className="agent-ui workspace" style={{ height: "calc(100svh - 64px)", padding: 0 }}>
        {ready && <TripChat reference={reference} />}
      </div>
    </main>
  );
}
