"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowLeft, Check, ChevronRight, Download, File, FileText, ImageIcon, MoreHorizontal, Paperclip, X } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { Dialog as SharedDialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteDocument, documentUrl, finalizeDocument, getDocument, renameDocument, subscribeDocuments, useDocumentList } from "./client";
import { fileFormat } from "@/lib/file-types";
import { useDocumentNavigation } from "./navigation";
import { DocumentEditor, type DocumentEditorControl } from "./editor";
import { nameError, type DocumentRef, type DocumentSummary } from "./types";
import "./documents.css";

export function documentSize(bytes: number) {
  return bytes === 0 ? "0 bytes" : bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentIcon({ mediaType }: { mediaType: string }) {
  const preview = fileFormat(mediaType)?.preview;
  return preview === "image" ? <ImageIcon size={18} aria-hidden="true" /> : preview ? <FileText size={18} aria-hidden="true" /> : <File size={18} aria-hidden="true" />;
}

function Dialog({ title, onClose, children, wide = false, returnFocus }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; returnFocus?: RefObject<HTMLElement | null> }) {
  return <SharedDialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={`document-dialog${wide ? " document-dialog-wide" : ""}`} finalFocus={returnFocus} showCloseButton={false}>
      <header className="document-dialog-heading"><DialogTitle>{title}</DialogTitle><DialogClose render={<Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" />} aria-label="Close document dialog"><X size={18} /></DialogClose></header>
      {children}
    </DialogContent>
  </SharedDialog>;
}

type DetailProps = {
  reference: string;
  id: string;
  onClose: () => void;
  onUse?: (document: DocumentRef) => void;
  onOpenMessage?: (conversationId: string, messageId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
};

export function DocumentDetail(props: DetailProps) {
  return <DocumentDetailView key={`${props.reference}:${props.id}`} {...props} />;
}

export function DocumentInlineDetail(props: DetailProps) {
  return <DocumentDetailView key={`${props.reference}:${props.id}`} {...props} inline />;
}

function DocumentDetailView({ reference, id, onClose, onUse, onOpenMessage, onDirtyChange, onSavingChange, inline = false }: DetailProps & { inline?: boolean }) {
  const [textDirty,setTextDirty]=useState(false);
  const [textSaving, setTextSaving] = useState(false);
  const { confirm, confirmation } = useConfirmDialog();
  const close = async () => { if ((!textDirty && !(edit && record && edit.name !== record.name)) || await confirm("Close without saving?", "Your unsaved changes will be discarded.", "Discard and close")) onClose(); };
  const [record, setRecord] = useState<DocumentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ name: string; revision: number } | null>(null);
  const [deleteRevision, setDeleteRevision] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [pdfSupported] = useState(() => typeof navigator !== "undefined" && navigator.pdfViewerEnabled === true);
  const nameId = useId();
  const backButton = useRef<HTMLButtonElement>(null);
  const editor = useRef<DocumentEditorControl>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setLoading(true); setRevision(current => current + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void getDocument(reference, id, controller.signal).then(next => {
      if (!controller.signal.aborted) { setRecord(next); setError(""); }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load this document.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reference, id, revision]);
  useEffect(() => subscribeDocuments(reference, refresh), [reference, refresh]);
  useEffect(() => { if (inline) backButton.current?.focus({ preventScroll: true }); }, [inline]);

  async function perform(action: () => Promise<DocumentSummary>, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await action();
      setRecord(next); setEdit(null); setDeleteRevision(null); setNotice(success);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update the document. Reload and try again."); }
    finally { setBusy(false); }
  }

  const renameDirty = !!edit && !!record && edit.name !== record.name;
  const updateDirty = useCallback((dirty: boolean) => { setTextDirty(dirty); onDirtyChange?.(dirty || renameDirty); }, [onDirtyChange, renameDirty]);
  useEffect(() => { onDirtyChange?.(textDirty || renameDirty); }, [onDirtyChange, renameDirty, textDirty]);
  const updateSaving = useCallback((saving: boolean) => { setTextSaving(saving); onSavingChange?.(saving); }, [onSavingChange]);
  const available = record?.status === "ready";
  const format = record ? fileFormat(record.mediaType) : undefined;
  const content = <>
    {confirmation}
    <div className="document-detail">
      {loading && <p role="status" className="document-muted">Loading document...</p>}
      {error && <div className="document-error" role="alert"><p>{error}</p><Button type="button" variant="ghost" className="cursor-pointer" disabled={busy || loading || textDirty} onClick={() => { setEdit(null); setDeleteRevision(null); void refresh(); }}>Reload document</Button></div>}
      {record && <>
        {!inline && <p className="document-metadata">{format?.label ?? "Unsupported format"} · {documentSize(record.size)} · Added {new Date(record.createdAt).toLocaleDateString()}</p>}
        {!inline && record.originalName !== record.name && <p className="document-muted">Original filename: {record.originalName}</p>}
        {available && <>
          {!inline && <div className="document-actions">
            {format && <a className="document-action-link" href={documentUrl(reference, id)} download={record.name} referrerPolicy="no-referrer"><Download size={15} aria-hidden="true" />Download</a>}
            {onUse && format?.ai && <Button type="button" variant="outline" className="cursor-pointer" disabled={busy || loading || !!error || textDirty || renameDirty} onClick={() => { onUse(record); onClose(); }}>Use in chat</Button>}
            <Button type="button" variant="ghost" className="cursor-pointer" disabled={busy || loading || textDirty} onClick={() => { setDeleteRevision(null); setEdit({ name: record.name, revision: record.revision }); }}>Rename</Button>
            <Button type="button" variant="ghost" className="cursor-pointer document-delete" disabled={busy || loading || textDirty} onClick={() => { setEdit(null); setDeleteRevision(record.revision); }}>Delete from trip</Button>
          </div>}
          {edit && <div className="document-edit">
            <label htmlFor={nameId}>Document name</label>
            <Input id={nameId} value={edit.name} maxLength={180} disabled={busy || loading} onChange={event => setEdit({ ...edit, name: event.target.value })} />
            <div className="document-actions"><Button type="button" className="cursor-pointer" disabled={busy || loading || !!nameError(edit.name) || edit.name === record.name} onClick={() => { void perform(() => renameDocument(reference, id, edit.name.trim(), edit.revision), "Document renamed."); }}>{busy ? "Saving..." : "Save name"}</Button><Button type="button" variant="ghost" className="cursor-pointer" disabled={busy || loading} onClick={() => setEdit(null)}>Cancel</Button></div>
          </div>}
          {deleteRevision === null && !edit && (format?.editor === "text" || !loading && !error) && <div className="document-preview">
            {format?.editor === "text" ? <DocumentEditor reference={reference} id={id} onDirtyChange={updateDirty} onSavingChange={updateSaving} controlRef={editor} toolbar={!inline} /> : format?.preview === "pdf" ? !pdfSupported ? <p>Download the PDF to view it in your PDF reader.</p> : <object type="application/pdf" data={documentUrl(reference, id, true)} aria-label={`Preview of ${record.name}`}><p>A preview is not available in this browser. Download the PDF to open it.</p></object>
              : format?.preview !== "image" ? <p>This file type is not supported by Library.</p>
              : previewError ? <p>The preview could not load. Download the file or try again.</p>
              // Native image preserves private, authenticated content routing.
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={documentUrl(reference, id, true)} alt={`Preview of ${record.name}`} onError={() => setPreviewError(true)} />}
          </div>}
        </>}
        {record.status === "pending" && <div className="document-state"><h3>Upload incomplete</h3><p>Check whether your upload finished. If it did not, choose the original file again in Library to retry.</p><div className="document-actions"><Button type="button" variant="outline" className="cursor-pointer" disabled={busy || loading} onClick={() => { void perform(() => finalizeDocument(reference, id), "Upload completed."); }}>{busy ? "Checking..." : "Check upload"}</Button><Button type="button" variant="ghost" className="cursor-pointer document-delete" disabled={busy || loading} onClick={() => setDeleteRevision(record.revision)}>Discard upload</Button></div></div>}
        {record.status === "deleting" && <div className="document-state"><h3>Deletion pending</h3><p>Chats can no longer open this file. Deletion is still finishing. Earlier messages and saved trip details remain.</p><Button type="button" variant="outline" className="cursor-pointer" disabled={busy || loading} onClick={() => { void perform(() => deleteDocument(reference, id, record.revision), "Deletion checked. The file may still be deleting."); }}>{busy ? "Checking..." : "Retry deletion"}</Button></div>}
        {record.status === "deleted" && <div className="document-state"><h3>Document deleted</h3><p>The original file is no longer available. Existing messages and saved planning facts remain.</p></div>}
        {deleteRevision !== null && <div className="document-confirm" role="group" aria-label="Confirm document deletion"><h3>Delete this document from the trip?</h3><p>Chats will no longer be able to open this file. Earlier messages and saved trip details remain. A reply already using the file may still finish.</p><div className="document-actions"><Button type="button" variant="destructive" className="cursor-pointer" disabled={busy || loading} onClick={() => { void perform(() => deleteDocument(reference, id, deleteRevision), "File removed from your chats."); }}>{busy ? "Deleting..." : "Delete document"}</Button><Button type="button" variant="ghost" className="cursor-pointer" disabled={busy || loading} onClick={() => setDeleteRevision(null)}>Keep document</Button></div></div>}
        {record.usages.length > 0 && <div className="document-usage"><h3>Used in messages</h3>{onOpenMessage ? record.usages.map((usage, index) => <Button key={usage.messageId} type="button" variant="ghost" className="cursor-pointer" disabled={textDirty || renameDirty} onClick={() => { onOpenMessage(usage.conversationId, usage.messageId); onClose(); }}>Open message {index + 1}</Button>) : <p>{record.usages.length} saved {record.usages.length === 1 ? "message references" : "messages reference"} this document.</p>}</div>}
      </>}
      {notice && <p role="status" className="document-muted">{notice}</p>}
    </div>
  </>;
  if (inline) return <section className="document-inline-view" aria-label={record?.name ?? "File"}>
    <header className="document-inline-heading">
      <Button ref={backButton} type="button" variant="ghost" size="icon-sm" className="cursor-pointer" disabled={textSaving || busy} aria-label="Back to Library" title="Back to Library" onClick={() => void close()}><ArrowLeft size={17} /></Button>
      <div className="document-breadcrumb"><span>Library</span><ChevronRight size={13} aria-hidden="true" /><h2 title={record?.name}>{record?.name ?? "File"}</h2></div>
      {available && <div className="document-inline-tools">
        {format?.editor === "text" && <Button type="button" variant="outline" size="sm" className="cursor-pointer document-save" disabled={busy || loading || textSaving || !textDirty || !!edit || deleteRevision !== null} onClick={() => editor.current?.save()}>{textSaving ? "Saving..." : "Save"}</Button>}
        {onUse && format?.ai && <Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" disabled={busy || loading || !!error || textDirty || renameDirty} aria-label="Use in chat" title="Use in chat" onClick={() => { onUse(record); onClose(); }}><Paperclip size={16} /></Button>}
        {format && <a className="document-tool-link" href={documentUrl(reference, id)} download={record.name} aria-label="Download" title="Download" referrerPolicy="no-referrer"><Download size={16} /></a>}
        <Menu.Root><Menu.Trigger render={<Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer" aria-label="File actions" title="File actions" disabled={busy || textSaving} />}><MoreHorizontal size={18} /></Menu.Trigger>
          <Menu.Portal><Menu.Positioner align="end" sideOffset={6} collisionPadding={12}><Menu.Popup className="document-file-menu">
            <Menu.Item className="cursor-pointer" disabled={loading || textDirty || !!edit || deleteRevision !== null} onClick={() => { setDeleteRevision(null); setEdit({ name: record.name, revision: record.revision }); }}>Rename</Menu.Item>
            {format?.editor === "text" && <Menu.Item className="cursor-pointer" disabled={loading || !!edit || deleteRevision !== null} onClick={() => editor.current?.reload()}>Reload</Menu.Item>}
            <Menu.Item className="cursor-pointer document-delete" disabled={loading || textDirty || renameDirty} onClick={() => { setEdit(null); setDeleteRevision(record.revision); }}>Delete from trip</Menu.Item>
          </Menu.Popup></Menu.Positioner></Menu.Portal>
        </Menu.Root>
      </div>}
    </header>
    {content}
  </section>;
  return <Dialog title={record?.name ?? "Document"} onClose={() => void close()} wide>{content}</Dialog>;
}

export function DocumentPicker({ reference, onSelect, onClose, returnFocus, selectedIds = [] }: {
  reference: string;
  onSelect: (document: DocumentRef) => void;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
  selectedIds?: readonly string[];
}) {
  const { documents, loading, error, refresh } = useDocumentList(reference);
  const ready = documents.filter(document => document.status === "ready" && fileFormat(document.mediaType)?.ai);
  return <Dialog title="Choose from Library" onClose={onClose} returnFocus={returnFocus}>
    {loading && <p role="status" className="document-muted">Loading library...</p>}
    {error && <div className="document-error" role="alert"><p>{error}</p><Button type="button" variant="ghost" className="cursor-pointer" onClick={() => { void refresh(); }}>Retry</Button></div>}
    {!loading && !error && !ready.length && <p className="document-empty-small">No saved files yet.</p>}
    <div className="document-picker-list">{ready.map(document => {
      const attached = selectedIds.includes(document.id);
      return <button key={document.id} type="button" className="cursor-pointer document-picker-row" aria-disabled={attached} onClick={() => { if (!attached) { onSelect(document); onClose(); } }}><DocumentIcon mediaType={document.mediaType} /><span><strong>{document.name}</strong><small>{documentSize(document.size)}</small></span><span className="document-picker-status">{attached && <Check size={14} aria-hidden="true" />}{attached ? "Attached" : "Attach"}</span></button>;
    })}</div>
  </Dialog>;
}

export function DocumentLink({ reference, document: file }: { reference: string; document: DocumentRef }) {
  const [open, setOpen] = useState(false);
  const navigate = useDocumentNavigation();
  return <><button type="button" className="cursor-pointer document-message-link" onClick={() => navigate ? navigate(reference, file.id) : setOpen(true)} title={`Open ${file.name}`}><Paperclip size={14} aria-hidden="true" /><span>{file.name}</span></button>{open && <DocumentDetail reference={reference} id={file.id} onClose={() => setOpen(false)} />}</>;
}
