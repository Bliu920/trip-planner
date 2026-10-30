"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import "./recovery.css";

export function RecoveryInput({
  value,
  onChange,
  onSubmit,
  busy,
  error,
  errorId,
  onDismiss,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  busy: boolean;
  error: string;
  errorId: string;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const focusInput = useCallback((node: HTMLInputElement | null) => {
    input.current = node;
    node?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (error) input.current?.focus({ preventScroll: true });
  }, [error]);
  function close() {
    if (!busy) {
      setExpanded(false);
      onDismiss();
      trigger.current?.focus({ preventScroll: true });
    }
  }

  // Reveal the recovery field.
  return (
    <form
      className="project-recovery"
      data-expanded={expanded || undefined}
      aria-label="Open project with recovery key"
      aria-busy={busy}
      onSubmit={onSubmit}
      onBlur={(event) => {
        if (!value && !busy && !event.currentTarget.contains(event.relatedTarget)) {
          setExpanded(false);
          onDismiss();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {expanded && (
        <>
          <Input
            unstyled
            ref={focusInput}
            id={id}
            aria-label="Recovery key"
            placeholder="Paste recovery key"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={`${id}-access${error ? ` ${errorId}` : ""}`}
          />
          <span id={`${id}-access`} className="sr-only">
            Anyone with this key can view and edit the project.
          </span>
          <button
            type="submit"
            className="cursor-pointer project-recovery-action"
            disabled={busy || !value.trim()}
            aria-label={busy ? "Opening project" : "Open project"}
            title="Open project"
          >
            {busy ? (
              <LoaderCircle size={17} className="project-recovery-spinner" aria-hidden="true" />
            ) : (
              <ArrowRight size={17} aria-hidden="true" />
            )}
          </button>
          {busy && (
            <span className="sr-only" role="status">
              Opening project...
            </span>
          )}
        </>
      )}
      <button
        ref={trigger}
        type="button"
        className="cursor-pointer start-trip-action project-recovery-key"
        onClick={() => (expanded ? close() : setExpanded(true))}
        disabled={busy}
        aria-label={expanded ? "Close recovery key" : "Recovery key"}
        title={expanded ? "Close recovery key" : "Recovery key"}
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
      >
        <KeyRound size={19} aria-hidden="true" />
      </button>
    </form>
  );
}
