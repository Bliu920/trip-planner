"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentMessage, Composer, Conversation, Suggestions } from "@/lib/agent";
import { starterAttachments, AttachmentScope, type DocumentSelection } from "@/lib/attachments";
import { DocumentLink } from "@/lib/documents";
import { loadPlaceReferences, parsePlaceIds } from "@/lib/place-references";
import { usePersistentChat } from "@/lib/chat";
import { buildTranscript, ChatResponse, MessageText } from "@/lib/chat-response";

export function TripChat({ reference, initialPrompt, starterFileIds = "", starterPlaceIds = "", selection, onSelectionHandled, messageTarget }: {
  reference: string; initialPrompt?: string; starterFileIds?: string; starterPlaceIds?: string;
  selection?: DocumentSelection | null; onSelectionHandled?: () => void;
  messageTarget?: { conversationId: string; messageId: string; requestId: string } | null;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [startError, setStartError] = useState("");
  const [startAttempt, setStartAttempt] = useState(0);
  const started = useRef(false);
  const navigated = useRef<string | null>(null);
  const chat = usePersistentChat(reference);
  const { messages, snapshot, busy, loading, syncing, remoteBusy, historyError, error } = chat;
  const locked = uploading || busy || loading || syncing || remoteBusy;
  const starting = !!initialPrompt && !messages.length;
  const transcript = buildTranscript(messages, { loading, starting, busy, syncing, remoteBusy, historyError, startError });

  // Hand off starter context.
  useEffect(() => {
    if (!initialPrompt || started.current || !snapshot || locked || historyError || !chat.canSend || startError) return;
    let cancelled = false;
    const controller = new AbortController();
    async function start() {
      if (snapshot!.messages.length || snapshot!.conversations.length > 1) {
        started.current = true;
        router.replace(`/trips/${reference}`, { scroll: false });
        return;
      }
      try {
        const files = starterFileIds ? await starterAttachments(reference, starterFileIds) : [];
        const places = starterPlaceIds ? await loadPlaceReferences(parsePlaceIds(starterPlaceIds.split(",")), controller.signal) : [];
        if (cancelled || started.current) return;
        started.current = chat.send(initialPrompt!, files, places);
      } catch (error) {
        if (!cancelled) setStartError(error instanceof Error ? error.message : "Could not open your first message and attachments.");
      }
    }
    void start();
    return () => { cancelled = true; controller.abort(); };
  }, [initialPrompt, starterFileIds, starterPlaceIds, snapshot, locked, historyError, chat, router, reference, startError, startAttempt]);

  useEffect(() => {
    if (initialPrompt && snapshot?.messages.some(message => message.role === "user")) router.replace(`/trips/${reference}`, { scroll: false });
  }, [initialPrompt, snapshot, reference, router]);

  // Navigate document references.
  useEffect(() => {
    if (!messageTarget || locked || historyError || navigated.current === `${messageTarget.requestId}:scrolled`) return;
    if (snapshot?.conversationId !== messageTarget.conversationId) {
      if (navigated.current === messageTarget.requestId) return;
      navigated.current = messageTarget.requestId;
      void chat.open(messageTarget.conversationId);
      return;
    }
    navigated.current = `${messageTarget.requestId}:scrolled`;
    document.getElementById(`chat-message-${messageTarget.messageId}`)?.scrollIntoView({ block: "center" });
  }, [messageTarget, locked, historyError, snapshot, chat]);

  return <section className="workspace-chat" aria-label="Trip assistant">
    <header className="workspace-chat-header">
      <div className="workspace-chat-controls">
        {snapshot && snapshot.conversations.length > 1 && <><label className="sr-only" htmlFor="chat-history">Conversation history</label><select id="chat-history" className="cursor-pointer" aria-label="Conversation history" value={snapshot.conversationId} disabled={locked} onChange={event => { void chat.open(event.target.value); }}>{snapshot.conversations.map((conversation, index) => <option key={conversation.id} value={conversation.id}>Chat {snapshot.conversations.length - index}</option>)}</select></>}
        <Button variant="ghost" size="icon-sm" className="cursor-pointer" aria-label="New chat" title="New chat" disabled={locked || !snapshot || !messages.length || !!historyError} onClick={() => { void chat.newChat(); }}><Plus /></Button>
      </div>
    </header>
    <Conversation key={`conversation-${snapshot?.conversationId ?? reference}`}>
      {starting && <AgentMessage role="user" feedbackEnabled={false}><MessageText text={initialPrompt!} collapsible /></AgentMessage>}
      {!loading && snapshot && !messages.length && !starting && <div className="workspace-welcome"><span className="workspace-assistant-mark"><MessageSquare size={22} /></span><h2>What does your Italy trip look like?</h2><p>Tell me what you enjoy, when you’re going, and how you like to travel. We can work through the details together.</p>{chat.canSend && !locked && <Suggestions items={["Plan three relaxed days in Rome", "Plan an art and food trip in Florence"]} onSelect={chat.send} />}</div>}
      {transcript.map(item => <ChatResponse key={item.key} item={item} reference={reference} onRetry={item.latest && !locked && !historyError ? chat.retry : undefined} />)}
      {historyError && <div className="workspace-chat-error" role="alert"><p>{historyError}</p><Button variant="outline" className="cursor-pointer" disabled={busy || loading || syncing} onClick={() => { if (snapshot) void chat.refresh(); else void chat.open(); }}>Reload conversation</Button></div>}
      {error && !historyError && <div className="workspace-chat-error" role="alert"><p>{error.message || "Could not reach the assistant. Please try again."}</p><Button variant="outline" className="cursor-pointer" disabled={locked} onClick={chat.retry}>Retry reply</Button><Button variant="ghost" className="cursor-pointer" disabled={locked} onClick={() => { void chat.refresh(); }}>Reload conversation</Button></div>}
      {chat.notice && <p className="workspace-chat-status" role="status">{chat.notice}{!error && <Button variant="ghost" className="cursor-pointer" disabled={locked} onClick={chat.retry}>Retry message</Button>}</p>}
    </Conversation>
    {startError && <div className="workspace-chat-error" role="alert"><p>{startError}</p><Button className="cursor-pointer" variant="ghost" onClick={() => { setStartError(""); setStartAttempt(value => value + 1); }}>Try again</Button></div>}
    {chat.documentError && <p className="workspace-chat-error" role="alert">{chat.documentError} Try the document action again.</p>}
    {!!snapshot?.documents?.length && <div className="workspace-chat-documents">
      <span>Files available to this chat</span>
      {snapshot.documents.map(document => <div key={document.id}><DocumentLink reference={reference} document={document} />
        <Button className="cursor-pointer" variant="ghost" size="sm" disabled={locked} onClick={() => { void chat.removeDocument(document.id); }} aria-label={`Stop using ${document.name} in this chat`}>Stop using</Button>
      </div>)}
      <small>Stopping use keeps the file and earlier messages.</small>
    </div>}
    <div className="workspace-input" inert={!snapshot} aria-busy={!snapshot}>
    <AttachmentScope key={`documents-${snapshot?.conversationId ?? reference}`} reference={reference} selection={snapshot ? selection : null} onSelectionHandled={onSelectionHandled}>
    <Composer key={`composer-${snapshot?.conversationId ?? reference}`} mode="chat" reference={reference} onUploading={setUploading} busy={busy} disabled={!chat.canSend || !!initialPrompt && !messages.length && !startError} onSend={chat.send} onStop={() => { void chat.stop(); }} />
    </AttachmentScope>
    </div>
  </section>;
}
