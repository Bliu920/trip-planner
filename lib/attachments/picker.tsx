"use client";

import { FILE_ACCEPT, fileFormat } from "@/lib/file-types";

import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { FileText, FolderOpen, ImageIcon, Plus, Upload, X } from "lucide-react";
import { InputGroupButton } from "@/components/ui/input-group";
import { type Attachment, type DraftFile } from "./types";
import { DocumentLink, DocumentPicker } from "@/lib/documents";
import { useAttachmentScope } from "./draft";
export { useAttachmentDraft } from "./draft";
import "./attachments.css";

export function AttachmentPicker({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [surface, setSurface] = useState<"menu" | "documents" | null>(null);
  const scope = useAttachmentScope();
  if (disabled && surface !== null) setSurface(null);

  // Share the upload entrypoint.
  const button = (
    <InputGroupButton
      ref={trigger}
      className="cursor-pointer attachment-add"
      size="icon-sm"
      aria-label={scope ? "Add attachments" : "Upload files"}
      title={scope ? "Add attachments" : "Upload files"}
      disabled={disabled}
      onClick={scope ? undefined : () => input.current?.click()}
    >
      <Plus aria-hidden="true" />
    </InputGroupButton>
  );
  return (
    <>
      <input
        ref={input}
        hidden
        tabIndex={-1}
        disabled={disabled}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        aria-label="Choose attachments"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (!disabled && files.length) onSelect(files);
          event.target.value = "";
        }}
      />
      {scope ? (
        <DropdownMenu
          modal={false}
          disabled={disabled}
          open={surface === "menu"}
          onOpenChange={(open) =>
            setSurface((current) => (open ? "menu" : current === "menu" ? null : current))
          }
        >
          <DropdownMenuTrigger render={button} />
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            aria-label="Add attachments"
            finalFocus={surface !== "documents"}
          >
            <DropdownMenuItem onClick={() => input.current?.click()}>
              <Upload aria-hidden="true" />
              Upload files
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSurface("documents")}>
              <FolderOpen aria-hidden="true" />
              Choose from Library
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        button
      )}
      {scope && surface === "documents" && !disabled && (
        <DocumentPicker
          reference={scope.reference}
          onSelect={scope.addSaved}
          onClose={() => setSurface(null)}
          returnFocus={trigger}
          selectedIds={scope.files.map((file) => file.id)}
        />
      )}
    </>
  );
}

export function AttachmentDrafts({
  files,
  disabled,
  onRemove,
}: {
  files: DraftFile[];
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  return files.map(({ id, file }) => (
    <span className="attachment-chip" key={id}>
      {fileFormat(file.type)?.preview !== "image" ? (
        <FileText size={15} aria-hidden="true" />
      ) : (
        <ImageIcon size={15} aria-hidden="true" />
      )}
      <span title={file.name}>{file.name}</span>
      <InputGroupButton
        className="cursor-pointer"
        size="icon-xs"
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        onClick={() => onRemove(id)}
      >
        <X />
      </InputGroupButton>
    </span>
  ));
}

export function SavedAttachments({ reference, files }: { reference: string; files: Attachment[] }) {
  return files.length ? (
    <div className="saved-attachments">
      {files.map((file) => (
        <DocumentLink reference={reference} document={file} key={file.id} />
      ))}
    </div>
  ) : null;
}
