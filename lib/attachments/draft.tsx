"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_FILES, fileError, type DocumentRef, type DraftFile } from "@/lib/documents/types";

function useFiles() {
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [error, setError] = useState("");
  function add(selected: File[]) {
    if (selected.length + files.length > MAX_FILES) { setError("Attach up to three files at a time."); return; }
    const invalid = selected.map(fileError).find(Boolean);
    if (invalid) { setError(invalid); return; }
    setError("");
    setFiles(current => [...current, ...selected.map(file => ({ id: crypto.randomUUID(), file }))]);
  }
  function addSaved(document: DocumentRef) {
    if (files.some(file => file.id === document.id)) return;
    if (files.length >= MAX_FILES) { setError("Attach up to three files at a time."); return; }
    setError("");
    setFiles(current => [...current, { id: document.id, saved: true, file: { name: document.name, size: document.size, type: document.mediaType } }]);
  }
  return {
    files, error, add, addSaved,
    remove: (id: string) => { setFiles(current => current.filter(file => file.id !== id)); setError(""); },
    clear: () => { const submitted = new Set(files.map(file => file.id)); setFiles(current => current.filter(file => !submitted.has(file.id))); setError(""); },
  };
}

type Scope = ReturnType<typeof useFiles> & { reference: string };
const Context = createContext<Scope | null>(null);
export type DocumentSelection = { document: DocumentRef; requestId: string };

export function AttachmentScope({ reference, selection, onSelectionHandled, children }: {
  reference: string; selection?: DocumentSelection | null; onSelectionHandled?: () => void; children: ReactNode;
}) {
  const draft = useFiles();
  const consumed = useRef<string | null>(null);
  // Stage library selections.
  useEffect(() => {
    if (!selection || consumed.current === selection.requestId) return;
    consumed.current = selection.requestId;
    draft.addSaved(selection.document);
    onSelectionHandled?.();
  }, [selection, draft, onSelectionHandled]);
  return <Context.Provider value={{ ...draft, reference }}>{children}</Context.Provider>;
}
export function useAttachmentScope() { return useContext(Context); }
export function useAttachmentDraft() {
  const local = useFiles();
  const shared = useAttachmentScope();
  return shared ?? local;
}
