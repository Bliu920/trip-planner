"use client";

import { FILE_ACCEPT, fileFormat, uploadFormat } from "@/lib/file-types";

import { useId, useRef, useState } from "react";
import { FilePlus2, FileText, LayoutGrid, List, MessageSquarePlus, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentEditor } from "./editor";
import { DocumentDetail, DocumentIcon, documentSize } from "./controls";
import { DocumentUploadError, uploadDocuments, useDocumentList } from "./client";
import { MAX_FILES, fileError, type DocumentRef, type DraftFile } from "./types";
import "./documents.css";

type Props = {
  reference: string;
  onUse?: (document: DocumentRef) => void;
  onOpenMessage?: (conversationId: string, messageId: string) => void;
};

export function DocumentLibrary({ reference, onUse, onOpenMessage }: Props) {
  const { documents, loading, error, refresh } = useDocumentList(reference);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DraftFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const [view, setView] = useState<"icons" | "list">("icons");
  const input = useRef<HTMLInputElement>(null);
  const pendingInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const heading = useId();

  function choose(files: File[]) {
    if (lock.current || !files.length) return;
    if (files.length + selected.length > MAX_FILES) { setUploadError("Choose up to three files per upload."); return; }
    const invalid = files.map(fileError).find(Boolean);
    if (invalid) { setUploadError(invalid); return; }
    setUploadError(""); setNotice("");
    setSelected(current => [...current, ...files.map(file => ({ id: crypto.randomUUID(), file }))]);
  }

  async function upload(files: DraftFile[]) {
    if (lock.current || !files.length) return;
    lock.current = true;
    setUploading(true); setUploadError(""); setNotice("");
    try {
      const saved = await uploadDocuments(reference, files, "library", setProgress);
      const ids = new Set(saved.map(file => file.id));
      setSelected(current => current.filter(file => !ids.has(file.id)));
      setNotice(`${saved.length} ${saved.length === 1 ? "file uploaded" : "files uploaded"}.`);
    } catch (error) {
      const saved = error instanceof DocumentUploadError ? error.completed : [];
      if (saved.length) {
        const ids = new Set(saved.map(file => file.id));
        setSelected(current => current.filter(file => !ids.has(file.id)));
        setNotice(`${saved.length} ${saved.length === 1 ? "file uploaded" : "files uploaded"}. Retry the remaining files.`);
      }
      setUploadError(error instanceof Error ? error.message : "Could not upload your document. Try again.");
    } finally {
      lock.current = false; setUploading(false); setProgress("");
      void refresh();
    }
  }

  function resumeUpload(file: File | undefined) {
    const record = documents.find(document => document.id === resume);
    if (!file || !record) return;
    const invalid = fileError(file);
    if (invalid) { setUploadError(invalid); return; }
    if (file.name !== record.originalName || file.size !== record.size || uploadFormat(file.name, file.type)?.mime !== record.mediaType) {
      setUploadError("Select the same original file, with the same filename, size and type. To upload a different file, discard the unfinished upload first."); return;
    }
    const retry: DraftFile = { id: record.id, file };
    setSelected(current => [...current.filter(item => item.id !== retry.id), retry]);
    void upload([retry]);
  }

  // Compose independent library.
  return <section className="document-library" aria-labelledby={heading}>
    <header className="document-library-heading">
      <div className="document-library-title"><h2 id={heading}>Library</h2>{!loading && !error && <span className="document-count" aria-label={`${documents.length} files`}>{documents.length}</span>}</div>
      <div className="document-toolbar" role="group" aria-label="Library actions">
        <Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" aria-label="New document" title="New document" onClick={() => setCreating(true)}><FilePlus2 size={16} aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" aria-label="Add files" title="Add files" disabled={uploading || selected.length >= MAX_FILES} onClick={() => input.current?.click()}><Upload size={16} aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" aria-label={view === "icons" ? "Switch to list view" : "Switch to icon view"} title={view === "icons" ? "Switch to list view" : "Switch to icon view"} onClick={() => setView(current => current === "icons" ? "list" : "icons")}>
          {view === "icons" ? <List size={16} aria-hidden="true" /> : <LayoutGrid size={16} aria-hidden="true" />}
        </Button>
      </div>
    </header>
    {creating && <DocumentEditor reference={reference} onClose={()=>setCreating(false)} />}
    <input ref={input} type="file" hidden multiple disabled={uploading} accept={FILE_ACCEPT} aria-label="Choose files to upload" onChange={event => { choose(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <input ref={pendingInput} type="file" hidden disabled={uploading} accept={FILE_ACCEPT} aria-label="Select original file to resume upload" onChange={event => { resumeUpload(event.target.files?.[0]); event.target.value = ""; }} />
    {!!selected.length && <div className="document-upload">
      <div className="document-upload-drafts">{selected.map(draft => <div key={draft.id} className="document-upload-draft"><DocumentIcon mediaType={draft.file.type} /><span title={draft.file.name}>{draft.file.name}</span><small>{documentSize(draft.file.size)}</small><Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" disabled={uploading} aria-label={`Remove ${draft.file.name} from upload selection`} onClick={() => setSelected(current => current.filter(file => file.id !== draft.id))}><X size={14} /></Button></div>)}<Button type="button" className="cursor-pointer" disabled={uploading} onClick={() => { void upload(selected); }}><Upload size={15} aria-hidden="true" />{uploading ? "Uploading..." : `Upload ${selected.length} ${selected.length === 1 ? "file" : "files"}`}</Button></div>
      {progress && <p className="document-muted" role="status">Uploading {progress}...</p>}
    </div>}
    {uploadError && <p className="document-error" role="alert">{uploadError}</p>}
    {notice && <p className="document-muted" role="status">{notice}</p>}
    {error && <div className="document-error" role="alert"><p>{error}</p><Button type="button" variant="ghost" className="cursor-pointer" onClick={() => { void refresh(); }}>Retry loading library</Button></div>}
    {loading && !documents.length && <p className="document-muted" role="status">Loading library...</p>}
    {!loading && !error && !documents.length && <div className="document-empty"><FileText size={28} aria-hidden="true" /><h3>No files yet</h3></div>}
    {!!documents.length && <div className="document-browser" data-view={view}>
      {view === "list" && <div className="document-list-heading" aria-hidden="true"><span>Name</span><span>Size</span><span>Added</span><span /></div>}
      <ul className="document-files" aria-label="Trip library">{documents.map(document => <li key={document.id} className="document-entry">
        <button type="button" className="cursor-pointer document-open" aria-label={`Open ${document.name}`} title={document.name} onClick={() => setDetail(document.id)}>
          <span className="document-file-icon" data-type={fileFormat(document.mediaType)?.preview ?? "unsupported"}><DocumentIcon mediaType={document.mediaType} /></span>
          <span className="document-file-name"><span className="document-file-title">{document.name}</span>{document.status !== "ready" && <span className="document-state-label">{document.status === "pending" ? "Upload incomplete" : document.status === "deleting" ? "Deletion pending" : "Deleted"}</span>}</span>
          <span className="document-file-size">{documentSize(document.size)}</span>
          {view === "list" && <time className="document-file-date" dateTime={document.createdAt}>{new Date(document.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>}
        </button>
        <div className="document-entry-actions">{document.status === "ready" && fileFormat(document.mediaType)?.ai && onUse && <Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" aria-label={`Use ${document.name} in chat`} title="Use in chat" onClick={() => onUse(document)}><MessageSquarePlus size={16} aria-hidden="true" /></Button>}{document.status === "pending" && <Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" disabled={uploading} aria-label={`Resume upload of ${document.name}`} title="Select original file" onClick={() => { setResume(document.id); pendingInput.current?.click(); }}><RotateCcw size={16} aria-hidden="true" /></Button>}</div>
      </li>)}</ul>
    </div>}
    {detail && <DocumentDetail key={detail} reference={reference} id={detail} onClose={() => setDetail(null)} onUse={onUse} onOpenMessage={onOpenMessage} />}
  </section>;
}
