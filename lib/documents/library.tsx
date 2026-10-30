"use client";

import { FILE_ACCEPT, fileFormat } from "@/lib/file-types";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  FilePlus2,
  FileText,
  LayoutGrid,
  List,
  MessageSquarePlus,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import type { DocumentOpenRequest, DocumentTab } from "./navigation";
import { DocumentEditor } from "./editor";
import { DocumentInlineDetail } from "./detail";
import { DocumentIcon, documentSize } from "./controls";
import { useDocumentList } from "./client";
import { useLibraryUpload } from "./use-upload";
import { MAX_FILES, type DocumentRef } from "./types";
import "./documents.css";

type Props = {
  reference: string;
  onUse?: (document: DocumentRef) => void;
  onOpenMessage?: (conversationId: string, messageId: string) => void;
  openRequest?: DocumentOpenRequest | null;
  closeRequest?: string | null;
  onFileTabChange?: (tab: DocumentTab | null) => void;
};

export function DocumentLibrary({
  reference,
  onUse,
  onOpenMessage,
  openRequest,
  closeRequest,
  onFileTabChange,
}: Props) {
  const { documents, loading, error, refresh } = useDocumentList(reference);
  const {
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
  } = useLibraryUpload(reference, documents, refresh);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { confirm, confirmation } = useConfirmDialog();
  const handledRequest = useRef<string | null>(null);
  const handledClose = useRef<string | null>(null);
  const latestRequest = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const createBackButton = useRef<HTMLButtonElement>(null);
  const listScroll = useRef(0);
  const [view, setView] = useState<"icons" | "list">("icons");
  const input = useRef<HTMLInputElement>(null);
  const pendingInput = useRef<HTMLInputElement>(null);
  const heading = useId();

  const openRequestedFile = useCallback(
    async (request: DocumentOpenRequest) => {
      latestRequest.current = request.requestId;
      if (detail === request.id && !creating) return;
      if (
        dirty &&
        !(await confirm(
          "Leave without saving?",
          "Your unsaved changes will be discarded.",
          "Discard and open",
        ))
      )
        return;
      if (latestRequest.current !== request.requestId) return;
      if (!detail && !creating)
        listScroll.current = listRef.current?.closest(".workspace-view")?.scrollTop ?? 0;
      setDirty(false);
      setCreating(false);
      setDetail(request.id);
      requestAnimationFrame(() =>
        listRef.current?.closest(".workspace-view")?.scrollTo({ top: 0 }),
      );
    },
    [confirm, creating, detail, dirty],
  );
  useEffect(() => {
    if (!openRequest || saving || handledRequest.current === openRequest.requestId) return;
    handledRequest.current = openRequest.requestId;
    void openRequestedFile(openRequest);
  }, [openRequest, openRequestedFile, saving]);

  useEffect(() => {
    if (creating) createBackButton.current?.focus({ preventScroll: true });
  }, [creating]);

  const fileName = detail
    ? (documents.find((file) => file.id === detail)?.name ?? "File")
    : creating
      ? "New file"
      : null;
  useEffect(() => {
    onFileTabChange?.(fileName ? { id: detail ?? "new", name: fileName, dirty, saving } : null);
  }, [detail, dirty, fileName, onFileTabChange, saving]);
  useEffect(() => {
    if (!closeRequest || saving || handledClose.current === closeRequest) return;
    handledClose.current = closeRequest;
    void (async () => {
      if (
        dirty &&
        !(await confirm(
          "Leave without saving?",
          "Your unsaved changes will be discarded.",
          "Discard and leave",
        ))
      )
        return;
      const previous = detail;
      setDirty(false);
      setCreating(false);
      setDetail(null);
      requestAnimationFrame(() => {
        listRef.current?.closest(".workspace-view")?.scrollTo({ top: listScroll.current });
        if (previous)
          listRef.current
            ?.querySelector<HTMLButtonElement>(`[data-file-id="${previous}"]`)
            ?.focus({ preventScroll: true });
      });
    })();
  }, [closeRequest, confirm, detail, dirty, saving]);

  async function closeCreation() {
    if (
      dirty &&
      !(await confirm(
        "Leave without saving?",
        "Your unsaved changes will be discarded.",
        "Discard and leave",
      ))
    )
      return;
    setDirty(false);
    setCreating(false);
  }
  function openDetail(id: string) {
    listScroll.current = listRef.current?.closest(".workspace-view")?.scrollTop ?? 0;
    setDetail(id);
    requestAnimationFrame(() => listRef.current?.closest(".workspace-view")?.scrollTo({ top: 0 }));
  }
  function closeDetail() {
    const previous = detail;
    setDirty(false);
    setDetail(null);
    requestAnimationFrame(() => {
      listRef.current?.closest(".workspace-view")?.scrollTo({ top: listScroll.current });
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-file-id="${previous}"]`)
        ?.focus({ preventScroll: true });
    });
  }

  // Compose independent library.
  return (
    <section
      className="document-library"
      data-file-open={!!detail || creating}
      aria-label="Library"
    >
      {confirmation}
      {creating && (
        <section className="document-inline-view" aria-label="New file">
          <header className="document-inline-heading">
            <Button
              ref={createBackButton}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              disabled={saving}
              aria-label="Back to Library"
              title="Back to Library"
              onClick={() => void closeCreation()}
            >
              <ArrowLeft size={18} />
            </Button>
            <h2>New file</h2>
          </header>
          <DocumentEditor
            reference={reference}
            onDirtyChange={setDirty}
            onSavingChange={setSaving}
            onSaved={(id) => {
              setDirty(false);
              setCreating(false);
              setDetail(id);
            }}
          />
        </section>
      )}
      {detail && (
        <DocumentInlineDetail
          key={detail}
          reference={reference}
          id={detail}
          onClose={closeDetail}
          onUse={onUse}
          onOpenMessage={onOpenMessage}
          onDirtyChange={setDirty}
          onSavingChange={setSaving}
        />
      )}
      <div ref={listRef} hidden={!!detail || creating}>
        <header className="document-library-heading">
          <div className="document-library-title">
            <h2 id={heading}>Library</h2>
            {!loading && !error && (
              <span className="document-count" aria-label={`${documents.length} files`}>
                {documents.length}
              </span>
            )}
          </div>
          <div className="document-toolbar" role="group" aria-label="Library actions">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              aria-label="New document"
              title="New document"
              onClick={() => setCreating(true)}
            >
              <FilePlus2 size={16} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              aria-label="Add files"
              title="Add files"
              disabled={uploading || selected.length >= MAX_FILES}
              onClick={() => input.current?.click()}
            >
              <Upload size={16} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              aria-label={view === "icons" ? "Switch to list view" : "Switch to icon view"}
              title={view === "icons" ? "Switch to list view" : "Switch to icon view"}
              onClick={() => setView((current) => (current === "icons" ? "list" : "icons"))}
            >
              {view === "icons" ? (
                <List size={16} aria-hidden="true" />
              ) : (
                <LayoutGrid size={16} aria-hidden="true" />
              )}
            </Button>
          </div>
        </header>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          disabled={uploading}
          accept={FILE_ACCEPT}
          aria-label="Choose files to upload"
          onChange={(event) => {
            choose(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <input
          ref={pendingInput}
          type="file"
          hidden
          disabled={uploading}
          accept={FILE_ACCEPT}
          aria-label="Select original file to resume upload"
          onChange={(event) => {
            resumeUpload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {!!selected.length && (
          <div className="document-upload">
            <div className="document-upload-drafts">
              {selected.map((draft) => (
                <div key={draft.id} className="document-upload-draft">
                  <DocumentIcon mediaType={draft.file.type} />
                  <span title={draft.file.name}>{draft.file.name}</span>
                  <small>{documentSize(draft.file.size)}</small>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="cursor-pointer"
                    disabled={uploading}
                    aria-label={`Remove ${draft.file.name} from upload selection`}
                    onClick={() =>
                      setSelected((current) => current.filter((file) => file.id !== draft.id))
                    }
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                className="cursor-pointer"
                disabled={uploading}
                onClick={() => {
                  void upload(selected);
                }}
              >
                <Upload size={15} aria-hidden="true" />
                {uploading
                  ? "Uploading..."
                  : `Upload ${selected.length} ${selected.length === 1 ? "file" : "files"}`}
              </Button>
            </div>
            {progress && (
              <p className="document-muted" role="status">
                Uploading {progress}...
              </p>
            )}
          </div>
        )}
        {uploadError && (
          <p className="document-error" role="alert">
            {uploadError}
          </p>
        )}
        {notice && (
          <p className="document-muted" role="status">
            {notice}
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
              Retry loading library
            </Button>
          </div>
        )}
        {loading && !documents.length && (
          <p className="document-muted" role="status">
            Loading library...
          </p>
        )}
        {!loading && !error && !documents.length && (
          <div className="document-empty">
            <FileText size={28} aria-hidden="true" />
            <h3>No files yet</h3>
          </div>
        )}
        {!!documents.length && (
          <div className="document-browser" data-view={view}>
            {view === "list" && (
              <div className="document-list-heading" aria-hidden="true">
                <span>Name</span>
                <span>Size</span>
                <span>Added</span>
                <span />
              </div>
            )}
            <ul className="document-files" aria-label="Trip library">
              {documents.map((document) => (
                <li key={document.id} className="document-entry">
                  <button
                    type="button"
                    data-file-id={document.id}
                    className="cursor-pointer document-open"
                    aria-label={`Open ${document.name}`}
                    title={document.name}
                    onClick={() => openDetail(document.id)}
                  >
                    <span
                      className="document-file-icon"
                      data-type={fileFormat(document.mediaType)?.preview ?? "unsupported"}
                    >
                      <DocumentIcon mediaType={document.mediaType} />
                    </span>
                    <span className="document-file-name">
                      <span className="document-file-title">{document.name}</span>
                      {document.status !== "ready" && (
                        <span className="document-state-label">
                          {document.status === "pending"
                            ? "Upload incomplete"
                            : document.status === "deleting"
                              ? "Deletion pending"
                              : "Deleted"}
                        </span>
                      )}
                    </span>
                    <span className="document-file-size">{documentSize(document.size)}</span>
                    {view === "list" && (
                      <time className="document-file-date" dateTime={document.createdAt}>
                        {new Date(document.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    )}
                  </button>
                  <div className="document-entry-actions">
                    {document.status === "ready" && fileFormat(document.mediaType)?.ai && onUse && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer"
                        aria-label={`Use ${document.name} in chat`}
                        title="Use in chat"
                        onClick={() => onUse(document)}
                      >
                        <MessageSquarePlus size={16} aria-hidden="true" />
                      </Button>
                    )}
                    {document.status === "pending" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer"
                        disabled={uploading}
                        aria-label={`Resume upload of ${document.name}`}
                        title="Select original file"
                        onClick={() => {
                          setResume(document.id);
                          pendingInput.current?.click();
                        }}
                      >
                        <RotateCcw size={16} aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
