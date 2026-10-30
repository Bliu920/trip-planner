"use client";

import type { PlaceReference } from "@/lib/place-references/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { listDocuments, subscribeDocuments } from "@/lib/documents/client";
import { notifyTripChanged } from "@/lib/trips";
import { requestHistory, removeChatDocument } from "./history";
import { createChatTransport } from "./transport";
import { committedActions, mergeActivity, reconcileHistory } from "./reconcile";
import type { Attachment } from "@/lib/attachments/types";
import type { ChatMessage, ChatSnapshot } from "./types";

export function usePersistentChat(reference: string) {
  const [snapshot, setSnapshot] = useState<ChatSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [pending, setPending] = useState<ChatMessage | null>(null);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const observedCommits = useRef(new Set<string>());

  const transport = useMemo(() => createChatTransport(reference), [reference]);

  const chat = useChat<ChatMessage>({
    id: snapshot?.conversationId ?? reference,
    messages: snapshot?.messages ?? [],
    transport,
    onFinish: () => {
      notifyTripChanged(reference);
      void refresh();
    },
  });
  const { setMessages, clearError } = chat;
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const remoteBusy =
    snapshot?.messages.some((message) => message.metadata?.status === "streaming") ?? false;

  // Show committed changes immediately.
  useEffect(() => {
    for (const key of committedActions(chat.messages)) {
      if (observedCommits.current.has(key)) continue;
      observedCommits.current.add(key);
      notifyTripChanged(reference);
    }
  }, [chat.messages, reference]);

  // Load saved conversations.
  const open = useCallback(
    async (conversation?: string, create = false) => {
      const version = ++requestVersion.current;
      setLoading(true);
      setHistoryError("");
      setNotice("");
      setDocumentError("");
      try {
        const loaded = await requestHistory(reference, conversation, create);
        if (!mounted.current || version !== requestVersion.current) return;
        setPending(null);
        setSnapshot(loaded);
        setMessages(loaded.messages);
        clearError();
      } catch (error) {
        if (mounted.current && version === requestVersion.current)
          setHistoryError(error instanceof Error ? error.message : "Could not load chat history.");
      } finally {
        if (mounted.current && version === requestVersion.current) setLoading(false);
      }
    },
    [reference, setMessages, clearError],
  );

  useEffect(() => {
    mounted.current = true;
    // Initial loading uses a cancellable request.
    const controller = new AbortController();
    void requestHistory(reference, undefined, false, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setSnapshot(loaded);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setHistoryError(error.message);
          setLoading(false);
        }
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [reference]);

  // Reconcile the saved transcript.
  async function refresh() {
    const current = snapshot;
    if (!current) return;
    const version = ++requestVersion.current;
    setSyncing(true);
    try {
      const loaded = await requestHistory(reference, current.conversationId);
      if (!mounted.current || version !== requestVersion.current) return;
      setSnapshot(loaded);
      setHistoryError("");
      const reconciled = reconcileHistory(loaded, pending);
      setPending(reconciled.pending);
      setMessages(reconciled.messages);
      if (reconciled.pending) setNotice("Your message was not saved. Retry sending it below.");
      else {
        clearError();
        setNotice("");
      }
    } catch (error) {
      if (mounted.current && version === requestVersion.current)
        setHistoryError(
          error instanceof Error ? error.message : "Could not confirm the saved reply.",
        );
    } finally {
      if (mounted.current && version === requestVersion.current) setSyncing(false);
    }
  }

  // Observe unfinished replies.
  useEffect(() => {
    if (!remoteBusy || busy || loading || syncing || historyError) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 1500);
    return () => window.clearTimeout(timer);
  });

  // Refresh document selections.
  useEffect(() => {
    let active = true;
    let version = 0;
    const unsubscribe = subscribeDocuments(reference, () => {
      const request = ++version;
      void listDocuments(reference)
        .then((documents) => {
          if (!active || request !== version) return;
          const ready = new Map(
            documents
              .filter((document) => document.status === "ready")
              .map((document) => [document.id, document]),
          );
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  documents: (current.documents ?? []).flatMap((document) => {
                    const saved = ready.get(document.id);
                    return saved
                      ? [
                          {
                            id: saved.id,
                            name: saved.name,
                            mediaType: saved.mediaType,
                            size: saved.size,
                          },
                        ]
                      : [];
                  }),
                }
              : current,
          );
        })
        .catch(() => {
          /* The next chat request revalidates selection server-side. */
        });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [reference]);

  async function removeDocument(id: string) {
    if (!snapshot || busy || remoteBusy || loading || syncing) return;
    setSyncing(true);
    setDocumentError("");
    try {
      await removeChatDocument(reference, snapshot.conversationId, id);
      await refresh();
    } catch (error) {
      setDocumentError(
        error instanceof Error ? error.message : "Could not update the selected documents.",
      );
    } finally {
      setSyncing(false);
    }
  }

  function send(text: string, files: Attachment[] = [], places: PlaceReference[] = []) {
    if (!snapshot || busy || remoteBusy || loading || syncing || historyError || pending)
      return false;
    setNotice("");
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        { type: "text", text },
        ...files.map((data) => ({ type: "data-attachment" as const, data })),
        ...places.map((data) => ({ type: "data-place" as const, data })),
      ],
    };
    setPending(message);
    void chat.sendMessage(message, {
      body: {
        conversationId: snapshot.conversationId,
        expectedLastId: snapshot.messages.at(-1)?.id ?? null,
      },
    });
    return true;
  }

  function retry() {
    if (busy || remoteBusy || syncing || historyError) return;
    setNotice("");
    if (!snapshot) return;
    const options = {
      body: {
        conversationId: snapshot.conversationId,
        expectedLastId: snapshot.messages.at(-1)?.id ?? null,
      },
    };
    if (pending) {
      const message = pending;
      void chat.sendMessage({ ...message, messageId: message.id }, options);
    } else void chat.regenerate(options);
  }

  return {
    error: chat.error,
    stop: chat.stop,
    // Retain earlier activity.
    messages: mergeActivity(chat.messages, snapshot?.messages ?? []),
    snapshot,
    loading,
    syncing,
    historyError,
    notice,
    documentError,
    busy,
    remoteBusy,
    send,
    retry,
    refresh,
    open,
    removeDocument,
    canSend: !!snapshot && !loading && !syncing && !historyError && !remoteBusy && !pending,
    newChat: () => open(crypto.randomUUID(), true),
  };
}
