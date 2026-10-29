"use client";

import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useEffect, useId, useState, useRef } from "react";
import { EDITABLE_FORMATS, fileFormat, filenameFormat, fileRenameError, fileBytesError } from "@/lib/file-types";
import { nameError } from "./types";
import { Button } from "@/components/ui/button";
import { notifyDocumentsChanged } from "./client";
import {
  type EditableKind,
  type TextDocument,
} from "./text";
export function DocumentEditor({
  reference,
  id,
  kind = "working",
  onSaved,
  onClose,
  onDirtyChange,
}: {
  reference: string;
  id?: string;
  kind?: EditableKind;
  onSaved?: () => void;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { confirm, confirmation } = useConfirmDialog();
  const label = useId();
  const [record, setRecord] = useState<TextDocument | null>(null);
  const [name, setName] = useState(
    kind === "planning_context" ? "Travel brief.md" : "Untitled.md",
  );
  const [markdown, setMarkdown] = useState("");
  const [mediaType, setMediaType] = useState("text/markdown");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(!!id);
  const [newId] = useState(() => crypto.randomUUID());
  const [attempt, setAttempt] = useState(0);
  const dirtyRef = useRef(false);
  const targetId = id ?? record?.id;
  const dirty = record
    ? markdown !== record.markdown || name !== record.name
    : !!markdown || name !== (kind === "planning_context" ? "Travel brief.md" : "Untitled.md") || mediaType !== "text/markdown";
  useEffect(() => {
    dirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!targetId) return;
    if (dirtyRef.current) {
      setError(
        "A document became available while you were editing. Your draft is preserved. Reload to review its current content before merging your changes.",
      );
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/trips/${reference}/documents/${targetId}/text`, {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body as TextDocument;
      })
      .then((doc) => {
        if (controller.signal.aborted) return;
        setRecord(doc);
        setMediaType(doc.mediaType ?? "text/markdown");
        setName(doc.name);
        setMarkdown(doc.markdown);
        setError("");
        setBusy(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [reference, targetId, attempt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save() {
    const savedName = !record && !id && !/\.[^.\s/\\]+$/.test(name.trim())
      ? `${name.trim()}${fileFormat(mediaType)!.extensions[0]}` : name;
    const validation = nameError(name) ?? fileRenameError(savedName, mediaType) ?? fileBytesError(mediaType, new TextEncoder().encode(markdown));
    if (validation) { setError(validation); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const target = record?.id ?? id;
      const response = await fetch(
        `/api/trips/${reference}/documents/${target ? `${target}/text` : "text"}`,
        {
          method: target ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: target ?? newId,
            name: savedName,
            kind: record?.kind ?? kind,
            expectedRevision: record?.revision ?? 0,
            markdown,
            mediaType,
          }),
          signal: AbortSignal.timeout(60000),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save text.");
      setRecord({
        id: body.id,
        name: body.name,
        kind: body.kind,
        revision: body.revision,
        contentRevision: body.contentRevision,
        markdown,
        mediaType: body.mediaType,
      });
      setName(body.name);
      setNotice("Saved.");
      notifyDocumentsChanged(reference);
      onSaved?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your text is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="document-text-editor">
      {!targetId && <div className="document-editor-toolbar">
      <input
        id={`${label}-name`}
        aria-label="File name"
        value={name}
        maxLength={180}
        disabled={busy}
        onChange={(e) => {
          setName(e.target.value);
          if (!id && !record) {
            const format = filenameFormat(e.target.value);
            if (format?.create && (kind !== "planning_context" || format.id === "markdown")) setMediaType(format.mime);
          }
        }}
      />
      {kind !== "planning_context" && (
        <select aria-label="File format" id={`${label}-format`} className="cursor-pointer" value={mediaType} disabled={busy} onChange={event => {
          const next = fileFormat(event.target.value)!;
          setMediaType(next.mime);
          setName(current => `${current.replace(/\.[^.\s/\\]+$/, "") || "Untitled"}${next.extensions[0]}`);
        }}>
          {EDITABLE_FORMATS.map(format => <option key={format.id} value={format.mime}>{format.label}</option>)}
        </select>
      )}
      </div>}
      <textarea
        id={`${label}-body`}
        aria-label="File contents"
        rows={14}
        value={markdown}
        disabled={busy || (!!id && !record)}
        onChange={e => { setMarkdown(e.target.value); setNotice(""); }}
        spellCheck={false}
        autoCapitalize="off"
      />
      <div className="document-actions">
        <Button
          className="cursor-pointer"
          disabled={busy || (!!record && !dirty) || !name.trim() || (!!id && !record)}
          onClick={() => void save()}
        >
          {busy ? "Working..." : "Save"}
        </Button>
        {targetId && (
          <Button
            className="cursor-pointer"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (
                dirty &&
                !await confirm("Reload the document?", "Your unsaved text will be discarded.", "Discard and reload")
              )
                return;
              dirtyRef.current = false;
              setBusy(true);
              setNotice("");
              setAttempt((a) => a + 1);
            }}
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
              if (!dirty || await confirm("Close without saving?", "Your unsaved text will be discarded.", "Discard and close"))
                onClose();
            }}
          >
            Close editor
          </Button>
        )}
      </div>
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
