"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { fileFormat } from "@/lib/file-types";
import { getDocument, subscribeDocuments } from "./client";
import type { DocumentSummary } from "./types";

/** Own metadata, file actions and unsaved-change guards. */
export function useDocumentDetail(
  reference: string,
  id: string,
  onClose: () => void,
  onDirtyChange?: (dirty: boolean) => void,
  onSavingChange?: (saving: boolean) => void,
) {
  // Track file state.
  const [textDirty, setTextDirty] = useState(false);
  const [textSaving, setTextSaving] = useState(false);
  const { confirm, confirmation } = useConfirmDialog();
  const [record, setRecord] = useState<DocumentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ name: string; revision: number } | null>(null);
  const [deleteRevision, setDeleteRevision] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [pdfSupported] = useState(
    () => typeof navigator !== "undefined" && navigator.pdfViewerEnabled === true,
  );
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setLoading(true);
    setRevision((current) => current + 1);
  }, []);
  // Load current metadata.
  useEffect(() => {
    const controller = new AbortController();
    void getDocument(reference, id, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setRecord(next);
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "Could not load this document.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reference, id, revision]);
  useEffect(() => subscribeDocuments(reference, refresh), [reference, refresh]);

  // Apply file actions.
  async function perform(action: () => Promise<DocumentSummary>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await action();
      setRecord(next);
      setEdit(null);
      setDeleteRevision(null);
      setNotice(success);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not update the document. Reload and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const renameDirty = !!edit && !!record && edit.name !== record.name;
  // Guard draft navigation.
  const close = async () => {
    if (
      (!textDirty && !(edit && record && edit.name !== record.name)) ||
      (await confirm(
        "Close without saving?",
        "Your unsaved changes will be discarded.",
        "Discard and close",
      ))
    )
      onClose();
  };
  const updateDirty = useCallback(
    (dirty: boolean) => {
      setTextDirty(dirty);
      onDirtyChange?.(dirty || renameDirty);
    },
    [onDirtyChange, renameDirty],
  );
  useEffect(() => {
    onDirtyChange?.(textDirty || renameDirty);
  }, [onDirtyChange, renameDirty, textDirty]);
  const updateSaving = useCallback(
    (saving: boolean) => {
      setTextSaving(saving);
      onSavingChange?.(saving);
    },
    [onSavingChange],
  );
  const available = record?.status === "ready";
  const format = record ? fileFormat(record.mediaType) : undefined;
  return {
    textDirty,
    textSaving,
    close,
    confirmation,
    record,
    loading,
    error,
    notice,
    busy,
    edit,
    setEdit,
    deleteRevision,
    setDeleteRevision,
    previewError,
    setPreviewError,
    pdfSupported,
    refresh,
    perform,
    renameDirty,
    updateDirty,
    updateSaving,
    available,
    format,
  };
}
