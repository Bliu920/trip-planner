// Maintenance: docs/modules/library.md.
// Expose supported capabilities.
export {
  FILE_FORMATS,
  FILE_ACCEPT,
  SUPPORTED_FILE_LABELS,
  EDITABLE_FORMATS,
  MAX_TEXT_BYTES,
  MAX_BINARY_BYTES,
  fileFormat,
  filenameFormat,
  uploadFormat,
  fileMetadataError,
  fileBytesError,
  fileRenameError,
  createdTextFormat,
  decodeText,
} from "./validation";
export type { FileFormat } from "./validation";
