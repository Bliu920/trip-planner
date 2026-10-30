"use client";

import { fileBytesError, fileFormat, uploadFormat } from "@/lib/file-types";
import { useCallback, useEffect, useState } from "react";
import {
  fileError,
  type DocumentRef,
  type DocumentSource,
  type DocumentSummary,
  type DraftFile,
} from "./types";

import {
  notifyTripChanged as notifyDocumentsChanged,
  subscribeTripChanges as subscribeDocuments,
} from "@/lib/trips/events";
const baseUrl = (reference: string) => `/api/trips/${encodeURIComponent(reference)}/documents`;

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not update the document. Try again.");
  return body as T;
}

export function listDocuments(reference: string, signal?: AbortSignal): Promise<DocumentSummary[]> {
  return fetch(baseUrl(reference), {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  }).then(responseJson<DocumentSummary[]>);
}

export function getDocument(
  reference: string,
  id: string,
  signal?: AbortSignal,
): Promise<DocumentSummary> {
  return fetch(`${baseUrl(reference)}/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  }).then(responseJson<DocumentSummary>);
}

export function documentUrl(reference: string, id: string, inline = false) {
  return `${baseUrl(reference)}/${encodeURIComponent(id)}/content${inline ? "?inline=1" : ""}`;
}

export {
  notifyTripChanged as notifyDocumentsChanged,
  subscribeTripChanges as subscribeDocuments,
} from "@/lib/trips/events";

async function mutate(reference: string, id: string, method: string, body?: unknown, action = "") {
  const result = await responseJson<DocumentSummary>(
    await fetch(`${baseUrl(reference)}/${encodeURIComponent(id)}${action}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    }),
  );
  notifyDocumentsChanged(reference);
  return result;
}

export const renameDocument = (reference: string, id: string, name: string, revision: number) =>
  mutate(reference, id, "PATCH", { name, revision });
export const deleteDocument = (reference: string, id: string, revision: number) =>
  mutate(reference, id, "DELETE", { revision });
export const finalizeDocument = (reference: string, id: string) =>
  mutate(reference, id, "POST", undefined, "/finalize");

export class DocumentUploadError extends Error {
  constructor(
    message: string,
    public readonly completed: DocumentRef[],
  ) {
    super(message);
  }
}

export async function uploadDocuments(
  reference: string,
  files: DraftFile[],
  source: DocumentSource,
  onProgress: (name: string) => void,
): Promise<DocumentRef[]> {
  const completed: DocumentRef[] = [];
  try {
    for (const draft of files) {
      onProgress(draft.file.name);
      // Reuse saved originals.
      if (draft.saved) {
        const saved = await getDocument(reference, draft.id);
        if (saved.status !== "ready" || !fileFormat(saved.mediaType)?.ai)
          throw new Error(
            `${draft.file.name} is no longer available. Remove it from your selection.`,
          );
        completed.push({
          id: saved.id,
          name: saved.name,
          size: saved.size,
          mediaType: saved.mediaType,
        });
        continue;
      }
      const error = fileError(draft.file);
      if (error) throw new Error(error);
      const format = uploadFormat(draft.file.name, draft.file.type)!;
      const bytesError = fileBytesError(
        format.mime,
        new Uint8Array(await draft.file.arrayBuffer()),
      );
      if (bytesError) throw new Error(bytesError);
      const intent = await responseJson<{
        document: DocumentSummary;
        ready: boolean;
        uploadUrl?: string;
      }>(
        await fetch(baseUrl(reference), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            id: draft.id,
            name: draft.file.name,
            size: draft.file.size,
            mediaType: format.mime,
            source,
          }),
        }),
      );
      let saved = intent.document;
      if (!intent.ready) {
        if (!intent.uploadUrl) throw new Error("Could not prepare this upload. Try again.");
        // Reconcile interrupted transfers.
        try {
          await fetch(intent.uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": format.mime,
              "x-upsert": "false",
              "Cache-Control": "max-age=0",
            },
            body: draft.file,
            signal: AbortSignal.timeout(60000),
          });
        } catch {
          /* Finalization checks whether storage received the original. */
        }
        saved = await finalizeDocument(reference, draft.id);
      }
      completed.push({
        id: saved.id,
        name: saved.name,
        size: saved.size,
        mediaType: saved.mediaType,
      });
      notifyDocumentsChanged(reference);
    }
    return completed;
  } catch (error) {
    notifyDocumentsChanged(reference);
    throw new DocumentUploadError(
      error instanceof Error ? error.message : "Could not upload the file. Try again.",
      completed,
    );
  }
}

export function useDocumentList(reference: string) {
  const [snapshot, setSnapshot] = useState<{
    reference: string;
    documents: DocumentSummary[];
    error: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setLoading(true);
    setRevision((current) => current + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void listDocuments(reference, controller.signal)
      .then((documents) => {
        if (!controller.signal.aborted) setSnapshot({ reference, documents, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setSnapshot((current) => ({
            reference,
            documents: current?.reference === reference ? current.documents : [],
            error: error instanceof Error ? error.message : "Could not load Library.",
          }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reference, revision]);
  useEffect(() => subscribeDocuments(reference, refresh), [reference, refresh]);
  const current = snapshot?.reference === reference ? snapshot : null;
  return {
    documents: current?.documents ?? [],
    loading: loading || !current,
    error: current?.error ?? "",
    refresh,
  };
}
