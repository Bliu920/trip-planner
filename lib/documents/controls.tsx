"use client";

import type { ReactNode, RefObject } from "react";
import { Check, File, FileText, ImageIcon, X } from "lucide-react";
import {
  Dialog as SharedDialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDocumentList } from "./client";
import { fileFormat } from "@/lib/file-types";
import type { DocumentRef } from "./types";
import "./documents.css";

export function documentSize(bytes: number) {
  return bytes === 0
    ? "0 bytes"
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentIcon({ mediaType }: { mediaType: string }) {
  const preview = fileFormat(mediaType)?.preview;
  return preview === "image" ? (
    <ImageIcon size={18} aria-hidden="true" />
  ) : preview ? (
    <FileText size={18} aria-hidden="true" />
  ) : (
    <File size={18} aria-hidden="true" />
  );
}

export function DocumentDialog({
  title,
  onClose,
  children,
  wide = false,
  returnFocus,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <SharedDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`document-dialog${wide ? " document-dialog-wide" : ""}`}
        finalFocus={returnFocus}
        showCloseButton={false}
      >
        <header className="document-dialog-heading">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose
            render={
              <Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" />
            }
            aria-label="Close document dialog"
          >
            <X size={18} />
          </DialogClose>
        </header>
        {children}
      </DialogContent>
    </SharedDialog>
  );
}

export function DocumentPicker({
  reference,
  onSelect,
  onClose,
  returnFocus,
  selectedIds = [],
}: {
  reference: string;
  onSelect: (document: DocumentRef) => void;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
  selectedIds?: readonly string[];
}) {
  const { documents, loading, error, refresh } = useDocumentList(reference);
  const ready = documents.filter(
    (document) => document.status === "ready" && fileFormat(document.mediaType)?.ai,
  );
  return (
    <DocumentDialog title="Choose from Library" onClose={onClose} returnFocus={returnFocus}>
      {loading && (
        <p role="status" className="document-muted">
          Loading library...
        </p>
      )}
      {error && (
        <div className="document-error" role="alert">
          <p>{error}</p>
          <Button
            type="button"
            variant="ghost"
            className="cursor-pointer"
            onClick={() => {
              void refresh();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {!loading && !error && !ready.length && (
        <p className="document-empty-small">No saved files yet.</p>
      )}
      <div className="document-picker-list">
        {ready.map((document) => {
          const attached = selectedIds.includes(document.id);
          return (
            <button
              key={document.id}
              type="button"
              className="cursor-pointer document-picker-row"
              aria-disabled={attached}
              onClick={() => {
                if (!attached) {
                  onSelect(document);
                  onClose();
                }
              }}
            >
              <DocumentIcon mediaType={document.mediaType} />
              <span>
                <strong>{document.name}</strong>
                <small>{documentSize(document.size)}</small>
              </span>
              <span className="document-picker-status">
                {attached && <Check size={14} aria-hidden="true" />}
                {attached ? "Attached" : "Attach"}
              </span>
            </button>
          );
        })}
      </div>
    </DocumentDialog>
  );
}
