"use client";

import { SelectField } from "@/components/ui/select";

import { useId, useImperativeHandle, type Ref } from "react";
import { EDITABLE_FORMATS } from "@/lib/file-types";
import { Button } from "@/components/ui/button";
import { useTextEditor } from "./use-editor";
import { type EditableKind } from "./text";
export type DocumentEditorControl = { save: () => void; reload: () => void };
export function DocumentEditor({
  reference,
  id,
  kind = "working",
  onSaved,
  onClose,
  onDirtyChange,
  onSavingChange,
  controlRef,
  toolbar = true,
}: {
  reference: string;
  id?: string;
  kind?: EditableKind;
  onSaved?: (id: string) => void;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  controlRef?: Ref<DocumentEditorControl>;
  toolbar?: boolean;
}) {
  const label = useId();
  const {
    record,
    name,
    markdown,
    mediaType,
    error,
    notice,
    busy,
    saving,
    targetId,
    dirty,
    changeName,
    changeFormat,
    changeText,
    save,
    reload,
    confirm,
    confirmation,
  } = useTextEditor(reference, id, kind, onSaved, onDirtyChange, onSavingChange);
  // Expose the existing toolbar.
  useImperativeHandle(controlRef, () => ({ save: () => void save(), reload: () => void reload() }));
  return (
    <section className="document-text-editor">
      {!targetId && (
        <div className="document-editor-toolbar">
          <input
            id={`${label}-name`}
            aria-label="File name"
            value={name}
            maxLength={180}
            disabled={busy}
            onChange={(event) => changeName(event.target.value)}
          />
          {kind !== "planning_context" && (
            <SelectField
              aria-label="File format"
              id={`${label}-format`}
              value={mediaType}
              disabled={busy}
              onValueChange={changeFormat}
              options={EDITABLE_FORMATS.map((format) => ({
                value: format.mime,
                label: format.label,
              }))}
            />
          )}
        </div>
      )}
      <textarea
        id={`${label}-body`}
        aria-label="File contents"
        rows={14}
        value={markdown}
        disabled={busy || (!!id && !record)}
        onChange={(event) => changeText(event.target.value)}
        spellCheck={false}
        autoCapitalize="off"
      />
      {toolbar && (
        <div className="document-actions">
          <Button
            className="cursor-pointer"
            disabled={busy || (!!record && !dirty) || !name.trim() || (!!id && !record)}
            onClick={() => void save()}
          >
            {busy ? (saving ? "Saving..." : "Loading...") : "Save"}
          </Button>
          {targetId && (
            <Button
              className="cursor-pointer"
              variant="ghost"
              disabled={busy}
              onClick={() => void reload()}
            >
              Reload
            </Button>
          )}
          {onClose && (
            <Button
              className="cursor-pointer"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (
                  !dirty ||
                  (await confirm(
                    "Close without saving?",
                    "Your unsaved text will be discarded.",
                    "Discard and close",
                  ))
                )
                  onClose();
              }}
            >
              Close editor
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="document-error" role="alert">
          {error} Your unsaved text is kept here.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {confirmation}
    </section>
  );
}
