"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2, Paperclip, Plus, Square, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InputGroupButton } from "@/components/ui/input-group";
import { useAudioInput, appendTranscript } from "@/lib/audio-input";
import { PromptInput } from "@/lib/prompt-input";
import { AttachmentDrafts, AttachmentPicker, uploadFiles, useAttachmentDraft, type Attachment } from "@/lib/attachments";
import "./composer.css";

type Props = { busy: boolean; onStop: () => void; initialFile?: string; disabled?: boolean } & (
  | { mode?: "preview"; onSend: (text: string, files: string[]) => void }
  | { mode: "chat"; reference: string; onSend: (text: string, files: Attachment[]) => boolean; onUploading: (busy: boolean) => void }
);

export function Composer(props: Props) {
  const { busy, onStop, initialFile, disabled = false } = props;
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>(initialFile ? [initialFile] : []);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const draft = useAttachmentDraft();
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const hasFiles = props.mode === "chat" ? draft.files.length > 0 : files.length > 0;

  const audio = useAudioInput(transcript => {
    const next = appendTranscript(text, transcript);
    if (next === null) return "The combined message exceeds 4,000 characters. Shorten the transcript or your message.";
    setText(next);
    requestAnimationFrame(() => textarea.current?.focus({ preventScroll: true }));
    return null;
  }, props.mode !== "chat" || disabled || busy || uploading);

  async function submit() {
    if (disabled || busy || audio.blocksSubmit() || sending.current || (!text.trim() && !hasFiles)) return;
    if (props.mode !== "chat") {
      props.onSend(text.trim() || "Use these trip notes.", files);
      setText(""); setFiles([]); textarea.current?.focus({ preventScroll: true });
      return;
    }
    sending.current = true;
    setError("");
    if (draft.files.length) { setUploading(true); props.onUploading(true); }
    try {
      // Upload before sending.
      const attached = await uploadFiles(props.reference, draft.files, "chat", setProgress);
      if (!props.onSend(text.trim() || "Use these trip notes.", attached)) throw new Error("The conversation is updating. Try sending again.");
      setText(current => current === text ? "" : current);
      draft.clear();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not upload your files. Try again.");
    } finally {
      sending.current = false; setUploading(false); setProgress(""); props.onUploading(false);
      textarea.current?.focus({ preventScroll: true });
    }
  }

  return <form className="agent-composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
    {props.mode !== "chat" && <Input unstyled ref={input} type="file" multiple hidden tabIndex={-1} aria-label="Attach trip notes" onChange={event => { setFiles(current => [...current, ...Array.from(event.target.files ?? [], file => file.name)]); event.target.value = ""; }} />}
    {/* Keep drafting while saving. */}
    <PromptInput size="compact" value={text} onChange={setText} onSubmit={() => { void submit(); }} inputRef={textarea}
      label="Message the trip assistant" placeholder="Ask about your trip"
      attachments={!hasFiles ? undefined : props.mode === "chat" ? <AttachmentDrafts files={draft.files} disabled={uploading} onRemove={draft.remove} /> : files.map((name, index) => <span className="agent-file" key={`${name}-${index}`}><Paperclip size={13} /><span>{name}</span><InputGroupButton className="cursor-pointer" aria-label={`Remove ${name}`} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}><X /></InputGroupButton></span>)}
      panel={props.mode === "chat" ? audio.panel : undefined}
      leadingAction={props.mode === "chat" ? <><AttachmentPicker disabled={uploading} onSelect={draft.add} />{audio.control}</> : <InputGroupButton className="cursor-pointer agent-composer-add" size="icon-sm" aria-label="Attach trip notes" title="Attach trip notes" onClick={() => input.current?.click()} disabled={busy}><Plus /></InputGroupButton>}
      action={busy ? <InputGroupButton className="cursor-pointer prompt-input-submit" aria-label="Stop response" title="Stop response" onClick={onStop} size="icon-sm"><Square /></InputGroupButton> : <InputGroupButton className="cursor-pointer prompt-input-submit" type="submit" aria-label={uploading ? "Uploading files" : "Send message"} title="Send message" disabled={disabled || uploading || audio.active || (!text.trim() && !hasFiles)} size="icon-sm">{uploading ? <Loader2 className="motion-safe:animate-spin" /> : <ArrowUp />}</InputGroupButton>} />
    {progress && <p className="attachment-progress" role="status">Uploading {progress}...</p>}
    {(error || draft.error) && <p className="attachment-error" role="alert">{error || draft.error}</p>}
    {props.mode !== "chat" && files.length > 0 && <span className="sr-only">Preview attachments contain filenames only.</span>}
  </form>;
}
