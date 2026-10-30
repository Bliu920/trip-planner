"use client";

import { useRef, useState } from "react";
import { uploadFormat } from "@/lib/file-types";
import { DocumentUploadError, uploadDocuments } from "./client";
import { MAX_FILES, fileError, type DocumentSummary, type DraftFile } from "./types";

/** Own upload selection, retries and partial completion. */
export function useLibraryUpload(
  reference: string,
  documents: DocumentSummary[],
  refresh: () => void,
) {
  // Track upload selection.
  const [selected, setSelected] = useState<DraftFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [resume, setResume] = useState<string | null>(null);
  const lock = useRef(false);
  function choose(files: File[]) {
    if (lock.current || !files.length) return;
    if (files.length + selected.length > MAX_FILES) {
      setUploadError("Choose up to three files per upload.");
      return;
    }
    const invalid = files.map(fileError).find(Boolean);
    if (invalid) {
      setUploadError(invalid);
      return;
    }
    setUploadError("");
    setNotice("");
    setSelected((current) => [
      ...current,
      ...files.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }

  // Upload selected files.
  async function upload(files: DraftFile[]) {
    if (lock.current || !files.length) return;
    lock.current = true;
    setUploading(true);
    setUploadError("");
    setNotice("");
    try {
      const saved = await uploadDocuments(reference, files, "library", setProgress);
      const ids = new Set(saved.map((file) => file.id));
      setSelected((current) => current.filter((file) => !ids.has(file.id)));
      setNotice(`${saved.length} ${saved.length === 1 ? "file uploaded" : "files uploaded"}.`);
    } catch (error) {
      const saved = error instanceof DocumentUploadError ? error.completed : [];
      if (saved.length) {
        const ids = new Set(saved.map((file) => file.id));
        setSelected((current) => current.filter((file) => !ids.has(file.id)));
        setNotice(
          `${saved.length} ${saved.length === 1 ? "file uploaded" : "files uploaded"}. Retry the remaining files.`,
        );
      }
      setUploadError(
        error instanceof Error ? error.message : "Could not upload your document. Try again.",
      );
    } finally {
      lock.current = false;
      setUploading(false);
      setProgress("");
      void refresh();
    }
  }

  // Resume unfinished uploads.
  function resumeUpload(file: File | undefined) {
    const record = documents.find((document) => document.id === resume);
    if (!file || !record) return;
    const invalid = fileError(file);
    if (invalid) {
      setUploadError(invalid);
      return;
    }
    if (
      file.name !== record.originalName ||
      file.size !== record.size ||
      uploadFormat(file.name, file.type)?.mime !== record.mediaType
    ) {
      setUploadError(
        "Select the same original file, with the same filename, size and type. To upload a different file, discard the unfinished upload first.",
      );
      return;
    }
    const retry: DraftFile = { id: record.id, file };
    setSelected((current) => [...current.filter((item) => item.id !== retry.id), retry]);
    void upload([retry]);
  }

  return {
    selected,
    setSelected,
    uploading,
    progress,
    uploadError,
    notice,
    setResume,
    choose,
    upload,
    resumeUpload,
  };
}
