// Maintenance guide: docs/modules/library.md.
// Expose document surfaces.
export { DocumentLibrary } from "./library";
export { DocumentDetail, DocumentLink, DocumentPicker } from "./controls";
export { listDocuments, getDocument, uploadDocuments, documentUrl, notifyDocumentsChanged, subscribeDocuments, DocumentUploadError } from "./client";
export type { DocumentRef, DocumentSummary, DocumentSource, DocumentStatus, DraftFile } from "./types";

export { DocumentEditor } from "./editor";

export { DocumentNavigationProvider, useDocumentNavigation } from "./navigation";
export type { DocumentOpenRequest, DocumentTab } from "./navigation";
