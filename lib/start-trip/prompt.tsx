"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AttachmentPicker,
  AttachmentDrafts,
  useAttachmentDraft,
  type DraftFile,
} from "@/lib/attachments";
import { useAudioInput, appendTranscript } from "@/lib/audio-input";
import { PlaceChips, usePlaceSelection } from "@/lib/place-references";
import { PromptInput } from "@/lib/prompt-input";

export function StarterPrompt({
  busy,
  error,
  onStart,
}: {
  busy: boolean;
  error: string;
  onStart: (prompt: string, files: DraftFile[], placeIds: string[]) => Promise<void>;
}) {
  const draft = useAttachmentDraft();
  const selection = usePlaceSelection();
  const places = selection?.places ?? [];
  const [prompt, setPrompt] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  // Restore failed submissions.
  useEffect(() => {
    if (error && !busy) input.current?.focus({ preventScroll: true });
  }, [error, busy]);

  const audio = useAudioInput((transcript) => {
    const next = appendTranscript(prompt, transcript);
    if (next === null)
      return "The combined prompt exceeds 4,000 characters. Shorten the transcript or your prompt.";
    setPrompt(next);
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return null;
  }, busy);

  function submit() {
    if (
      busy ||
      audio.blocksSubmit() ||
      (!prompt.trim() && !draft.files.length && !places.length) ||
      prompt.length > 4000
    )
      return;
    void onStart(
      prompt.trim() ||
        (places.length
          ? "Help me plan my Italy trip around these places."
          : "Help me plan my Italy trip using these files."),
      draft.files,
      places.map((place) => place.id),
    );
  }

  return (
    <form
      className="start-trip-form"
      aria-label="Start a trip"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <PromptInput
        size="roomy"
        inputRef={input}
        value={prompt}
        onChange={setPrompt}
        onSubmit={submit}
        disabled={busy}
        label="Tell us about your trip"
        placeholder="What do you have in mind?"
        describedBy={error ? "trip-start-error" : undefined}
        attachments={
          draft.files.length || places.length ? (
            <>
              <PlaceChips places={places} onRemove={selection?.remove} disabled={busy} />
              {draft.files.length > 0 && (
                <AttachmentDrafts files={draft.files} disabled={busy} onRemove={draft.remove} />
              )}
            </>
          ) : undefined
        }
        panel={audio.panel}
        leadingAction={<AttachmentPicker disabled={busy} onSelect={draft.add} />}
        action={
          <>
            {audio.control}
            <Button
              variant="plain"
              type="submit"
              className="cursor-pointer prompt-input-submit"
              disabled={
                busy || audio.active || (!prompt.trim() && !draft.files.length && !places.length)
              }
              aria-label={busy ? "Starting your trip" : "Start trip"}
              title="Start trip"
            >
              {busy ? (
                <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </Button>
          </>
        }
      />
      {busy && (
        <span className="sr-only" role="status">
          Creating your project...
        </span>
      )}
      {draft.error && (
        <p className="attachment-error" role="alert">
          {draft.error}
        </p>
      )}
      {error && (
        <p className="start-trip-error" id="trip-start-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
