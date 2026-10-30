"use client";

import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import "./input.css";

export function PromptInput({
  value,
  onChange,
  onSubmit,
  action,
  label,
  placeholder,
  size = "compact",
  disabled = false,
  inputRef,
  describedBy,
  attachments,
  leadingAction,
  panel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  action: ReactNode;
  label: string;
  placeholder: string;
  size?: "compact" | "roomy" | "default";
  disabled?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
  describedBy?: string;
  attachments?: ReactNode;
  leadingAction?: ReactNode;
  panel?: ReactNode;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(inputRef, () => textarea.current!);

  // Fit content within bounds.
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    function fit() {
      if (!element) return;
      const styles = getComputedStyle(element);
      element.style.height = "auto";
      const height = Math.min(
        parseFloat(styles.maxHeight),
        Math.max(parseFloat(styles.minHeight), element.scrollHeight),
      );
      element.style.height = `${height}px`;
      element.style.overflowY = element.scrollHeight > height ? "auto" : "hidden";
    }
    fit();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value, size]);

  // Compose the input surface.
  return (
    <InputGroup className="prompt-input" data-size={size}>
      {attachments && <div className="prompt-input-attachments">{attachments}</div>}
      <div className="prompt-input-body">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <InputGroupTextarea
          ref={textarea}
          id={id}
          value={value}
          rows={1}
          maxLength={4000}
          disabled={disabled}
          aria-describedby={describedBy}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault();
              if (!disabled) onSubmit();
            }
          }}
        />
      </div>
      {panel}
      <div className="prompt-input-toolbar">
        {leadingAction}
        <div className="prompt-input-action">{action}</div>
      </div>
    </InputGroup>
  );
}
