"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { fileFormat, filenameFormat, fileRenameError, fileBytesError } from "@/lib/file-types";
import { nameError } from "./types";
import { notifyDocumentsChanged } from "./client";
import type { EditableKind, TextDocument } from "./text";

/** Own the text draft, loading, validation and saving. */
export function useTextEditor(
  reference: string,
  id: string | undefined,
  kind: EditableKind,
  onSaved?: (id: string) => void,
  onDirtyChange?: (dirty: boolean) => void,
  onSavingChange?: (saving: boolean) => void,
) {
  // Track the draft.
  const { confirm, confirmation } = useConfirmDialog();
  const [record, setRecord] = useState<TextDocument | null>(null);
  const [name, setName] = useState(kind === "planning_context" ? "Travel brief.md" : "Untitled.md");
  const [markdown, setMarkdown] = useState("");
  const [mediaType, setMediaType] = useState("text/markdown");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [newId] = useState(() => crypto.randomUUID());
  const [attempt, setAttempt] = useState(0);
  const dirtyRef = useRef(false);
  const targetId = id ?? record?.id;
  const dirty = record
    ? markdown !== record.markdown || name !== record.name
    : !!markdown ||
      name !== (kind === "planning_context" ? "Travel brief.md" : "Untitled.md") ||
      mediaType !== "text/markdown";
  useEffect(() => {
    dirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // Load saved text.
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
  // Save validated text.
  async function save() {
    const savedName =
      !record && !id && !/\.[^.\s/\\]+$/.test(name.trim())
        ? `${name.trim()}${fileFormat(mediaType)!.extensions[0]}`
        : name;
    const renameError = fileRenameError(savedName, mediaType);
    const formatError =
      renameError && !targetId
        ? `Use a ${fileFormat(mediaType)!.extensions.join(" or ")} extension for this file.`
        : renameError;
    const validation =
      nameError(name) ??
      formatError ??
      fileBytesError(mediaType, new TextEncoder().encode(markdown));
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setSaving(true);
    onSavingChange?.(true);
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
      dirtyRef.current = false;
      onDirtyChange?.(false);
      setNotice("Saved.");
      notifyDocumentsChanged(reference);
      onSaved?.(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Your text is still here.");
    } finally {
      setBusy(false);
      setSaving(false);
      onSavingChange?.(false);
    }
  }
  // Handle draft actions.
  async function reload() {
    if (
      dirty &&
      !(await confirm(
        "Reload the document?",
        "Your unsaved text will be discarded.",
        "Discard and reload",
      ))
    )
      return;
    dirtyRef.current = false;
    setBusy(true);
    setNotice("");
    setAttempt((a) => a + 1);
  }
  function changeName(value: string) {
    setName(value);
    if (!id && !record) {
      const format = filenameFormat(value);
      if (format?.create && (kind !== "planning_context" || format.id === "markdown"))
        setMediaType(format.mime);
    }
  }
  function changeFormat(value: string) {
    const next = fileFormat(value)!;
    setMediaType(next.mime);
    setName(
      (current) => `${current.replace(/\.[^.\s/\\]+$/, "") || "Untitled"}${next.extensions[0]}`,
    );
  }
  function changeText(value: string) {
    setMarkdown(value);
    setNotice("");
  }
  return {
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
  };
}
