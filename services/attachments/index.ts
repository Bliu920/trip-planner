import "server-only";
// Preserve legacy HTTP adapters.
export { handleLegacyAttachments as handleAttachments, DocumentError as AttachmentError } from "@/services/documents";
