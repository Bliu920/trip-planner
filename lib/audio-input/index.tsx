"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, Loader2, Mic, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioSession } from "./session";
import "./audio.css";

export { appendTranscript } from "./types";

export function useAudioInput(insert: (text: string) => string | null, disabled = false, testSession?: AudioSession) {
  const [session] = useState(() => testSession ?? new AudioSession());
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [copyError, setCopyError] = useState("");
  const mic = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const id = useId();
  const active = state.phase !== "idle";
  const recording = state.phase === "recording";
  const deliver = useEffectEvent((text: string) => insert(text));

  // Insert into the draft.
  useEffect(() => session.subscribe(() => {
    if (session.getSnapshot().phase === "ready") session.accept(text => deliver(text));
  }), [session]);

  // Clean up page lifecycle.
  useEffect(() => {
    const hide = () => { if (document.hidden) session.interrupt(); };
    const leave = () => session.cancel();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave); session.cancel(); };
  }, [session]);
  useEffect(() => {
    if (state.phase === "recording") confirm.current?.focus({ preventScroll: true });
    else if (state.phase !== "idle") dismiss.current?.focus({ preventScroll: true });
  }, [state.phase]);

  function discard() { session.cancel(); setCopyError(""); requestAnimationFrame(() => mic.current?.focus({ preventScroll: true })); }
  async function copyTranscript() {
    const pending = session.getSnapshot();
    try { await navigator.clipboard.writeText(pending.text); if (session.getSnapshot() === pending) discard(); }
    catch { if (session.getSnapshot() === pending) setCopyError("Could not copy the transcript. Try again or record a shorter message."); }
  }
  const elapsed = `${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, "0")}`;
  const escape = (event: React.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); discard(); } };
  const cancelButton = <Button ref={dismiss} type="button" variant="plain" className="cursor-pointer audio-icon-button audio-cancel" aria-label="Cancel voice input" title="Cancel" onClick={discard}><X aria-hidden="true" /></Button>;

  // Replace the recording surface.
  const control = <Button ref={mic} type="button" variant="plain" className="cursor-pointer audio-mic" disabled={disabled || active} aria-label="Record voice input" title="Dictate" aria-expanded={active} aria-controls={active ? id : undefined} onClick={() => { setCopyError(""); void session.start(); }}><Mic aria-hidden="true" /></Button>;
  const panel = !active ? undefined : state.phase === "error" ? <div className="audio-feedback" id={id} onKeyDown={escape}>
    <p role="alert">{copyError || state.error}</p>
    {state.text ? <Button type="button" variant="plain" className="cursor-pointer audio-icon-button" aria-label="Copy transcript" title="Copy transcript" onClick={() => { void copyTranscript(); }}><Copy aria-hidden="true" /></Button>
      : state.retryable && <Button type="button" variant="plain" className="cursor-pointer audio-icon-button" aria-label="Retry transcription" title="Retry" disabled={disabled} onClick={() => { void session.retry(); }}><RotateCcw aria-hidden="true" /></Button>}
    {cancelButton}
  </div> : <section className="audio-capture" id={id} aria-label="Voice input" onKeyDown={escape}>
    {cancelButton}
    <div className="audio-signal">
      {recording ? <>
        <span className="sr-only" role="status">Recording. Maximum one minute. Confirm to transcribe.</span>
        <svg className="audio-waveform" viewBox="0 0 288 32" preserveAspectRatio="none" aria-hidden="true">
          {state.levels.map((level, index) => <line key={index} x1={index * 6 + 3} x2={index * 6 + 3} y1={16 - Math.max(1, level * 14)} y2={16 + Math.max(1, level * 14)} />)}
        </svg>
        <span className="audio-timer" aria-hidden="true">{elapsed}</span>
      </> : <span className="audio-status" role="status">{state.phase === "permission" ? "Allow microphone access" : "Transcribing..."}</span>}
    </div>
    <Button ref={confirm} type="button" variant="plain" className="cursor-pointer audio-icon-button audio-confirm" aria-label="Finish dictation" title="Finish dictation" disabled={!recording} onClick={() => { void session.stop(); }}>
      {recording ? <Check aria-hidden="true" /> : <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
    </Button>
  </section>;

  return { control, panel, active, blocksSubmit: () => session.getSnapshot().phase !== "idle" };
}
