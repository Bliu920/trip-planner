"use client";

import { useEffect, useRef, useState } from "react";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { DocumentLibrary } from "@/lib/documents";
import { usePersistentChat, type ChatMessage, type ChatSnapshot } from "@/lib/chat";
import { buildTranscript, ChatResponse } from "@/lib/chat-response";
import type { DocumentSummary } from "@/lib/documents/types";
import "@/lib/workspace/workspace.css";

const reference = "frontend-cleanup-fixture";
const initialDocument: DocumentSummary = {
  id: "brief",
  name: "Travel brief.md",
  originalName: "Travel brief.md",
  mediaType: "text/markdown",
  size: 20,
  status: "ready",
  createdAt: "2026-10-30T12:00:00Z",
  updatedAt: "2026-10-30T12:00:00Z",
  revision: 1,
  usages: [],
};

// Mount real surfaces after interception.
export default function FrontendCleanupFixture() {
  const [ready, setReady] = useState(false);
  const [requests, setRequests] = useState<string[]>([]);
  const fail = useRef(false);
  const finish = useRef<(() => void) | null>(null);
  useEffect(() => {
    const original = window.fetch;
    let documents = [initialDocument];
    const text = new Map([["brief", "A relaxed trip through Italy."]]);
    const conversations = new Map<string, ChatMessage[]>([["first", []]]);
    const base = `/api/trips/${reference}`;
    window.fetch = async (input, init) => {
      const url = String(input),
        method = init?.method ?? "GET";
      if (!url.startsWith(base)) {
        if (method !== "GET") throw new Error("Unexpected fixture write");
        return original(input, init);
      }
      setRequests((current) => [...current, `${method} ${url}`]);
      if (fail.current && method !== "GET") {
        fail.current = false;
        return Response.json({ error: "Fixture request failed. Try again." }, { status: 503 });
      }
      const path = url.slice(base.length).split("?")[0];
      if (path.startsWith("/fixture-upload/") && init?.body instanceof File) {
        text.set(path.split("/").at(-1)!, await init.body.text());
        return new Response(null);
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (path === "/documents" && method === "POST") {
        const record = documents.find((doc) => doc.id === body.id) ?? {
          ...initialDocument,
          ...body,
          originalName: body.name,
          status: "pending",
        };
        documents = [...documents.filter((doc) => doc.id !== record.id), record];
        return Response.json({
          document: record,
          ready: record.status === "ready",
          uploadUrl: `${base}/fixture-upload/${record.id}`,
        });
      }
      if (path === "/documents" && method === "GET") return Response.json(documents);
      if (path.startsWith("/documents")) {
        const id = path.split("/")[2] === "text" ? body.id : path.split("/")[2];
        let record = documents.find((doc) => doc.id === id);
        if (path.endsWith("/finalize")) {
          record = { ...record!, status: "ready" };
          documents = documents.map((doc) => (doc.id === id ? record! : doc));
          return Response.json(record);
        }
        if (path.endsWith("/text")) {
          if (method !== "GET") {
            record = {
              ...(record ?? initialDocument),
              id,
              name: body.name,
              mediaType: body.mediaType,
              revision: (record?.revision ?? 0) + 1,
            };
            documents = [...documents.filter((doc) => doc.id !== id), record];
            text.set(id, body.markdown);
          }
          return Response.json({
            ...record,
            kind: "working",
            contentRevision: record?.revision ?? 1,
            markdown: text.get(id) ?? "",
          });
        }
        if (method === "PATCH") {
          record = { ...record!, name: body.name, revision: record!.revision + 1 };
          documents = documents.map((doc) => (doc.id === id ? record! : doc));
        }
        if (method === "DELETE") {
          documents = documents.filter((doc) => doc.id !== id);
          return Response.json({ ...record, status: "deleted" });
        }
        return Response.json(record);
      }
      if (path === "/conversations") {
        const id = new URL(url, location.origin).searchParams.get("conversation") ?? "first";
        if (!conversations.has(id)) conversations.set(id, []);
        return Response.json({
          conversationId: id,
          conversations: [...conversations.keys()].map((id) => ({
            id,
            createdAt: "2026-10-30T12:00:00Z",
          })),
          documents: [],
          messages: conversations.get(id)!,
        } satisfies ChatSnapshot);
      }
      if (path === "/chat") {
        const id = body.conversationId;
        const history = conversations.get(id)!;
        if (body.message)
          history.push({
            id: body.message.id,
            role: "user",
            parts: [{ type: "text", text: body.message.text }],
          });
        const reply: ChatMessage = {
          id: body.retry ? history.pop()!.id : crypto.randomUUID(),
          role: "assistant",
          parts: [{ type: "text", text: "A relaxed **Italian trip**." }],
          metadata: { status: "complete", createdAt: "2026-10-30T12:00:00Z" },
        };
        return createUIMessageStreamResponse({
          stream: new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({ type: "start", messageId: reply.id });
              controller.enqueue({ type: "text-start", id: "text" });
              controller.enqueue({
                type: "text-delta",
                id: "text",
                delta: "A relaxed **Italian trip**.",
              });
              finish.current = () => {
                history.push(reply);
                controller.enqueue({ type: "text-end", id: "text" });
                controller.enqueue({ type: "finish", messageMetadata: reply.metadata });
                controller.close();
                finish.current = null;
              };
            },
          }),
        });
      }
      throw new Error(`Unexpected fixture request: ${method} ${path}`);
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return (
    <main style={{ padding: 24 }}>
      <aside aria-label="Fixture controls">
        <button
          className="cursor-pointer"
          onClick={() => {
            const input = document.querySelector<HTMLInputElement>(
              'input[aria-label="Choose files to upload"]',
            );
            if (!input) return;
            const selection = new DataTransfer();
            selection.items.add(
              new File(["Packing notes for Italy."], "cleanup-upload.txt", { type: "text/plain" }),
            );
            input.files = selection.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }}
        >
          Choose sample file
        </button>
        {!ready && (
          <button className="cursor-pointer" onClick={() => setReady(true)}>
            Mount workspace
          </button>
        )}
        <button
          className="cursor-pointer"
          onClick={() => {
            fail.current = true;
          }}
        >
          Fail next request
        </button>
        <button className="cursor-pointer" onClick={() => finish.current?.()}>
          Finish reply
        </button>
      </aside>
      {ready && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
          <section className="workspace-view">
            <DocumentLibrary reference={reference} />
          </section>
          <ChatFixture />
        </div>
      )}
      <details>
        <summary className="cursor-pointer">Fixture requests</summary>
        <pre>{requests.join("\n")}</pre>
      </details>
    </main>
  );
}

function ChatFixture() {
  const chat = usePersistentChat(reference);
  const [draft, setDraft] = useState("Plan a relaxed trip");
  const items = buildTranscript(chat.messages, {
    loading: chat.loading,
    starting: false,
    busy: chat.busy,
    syncing: chat.syncing,
    remoteBusy: chat.remoteBusy,
    historyError: chat.historyError,
    startError: "",
  });
  return (
    <section aria-label="Chat fixture">
      <button
        className="cursor-pointer"
        disabled={chat.busy || chat.syncing}
        onClick={() => void chat.newChat()}
      >
        New chat
      </button>
      {items.map((item) => (
        <ChatResponse key={item.key} item={item} reference={reference} onRetry={chat.retry} />
      ))}
      {(chat.error || chat.notice || chat.historyError) && (
        <p role="alert">{chat.notice || chat.historyError || chat.error?.message}</p>
      )}
      <button className="cursor-pointer" onClick={chat.retry}>
        Retry message
      </button>
      <input
        aria-label="Chat draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        className="cursor-pointer"
        disabled={!chat.canSend || chat.busy}
        onClick={() => chat.send(draft)}
      >
        Send message
      </button>
    </section>
  );
}
