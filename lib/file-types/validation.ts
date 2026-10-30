import formats from "./formats.json";

export const FILE_FORMATS = formats;
export type FileFormat = (typeof formats)[number];
export const FILE_ACCEPT = formats
  .flatMap((format) => [format.mime, ...format.extensions])
  .join(",");
export const SUPPORTED_FILE_LABELS = formats.map((format) => format.label).join(", ");
export const EDITABLE_FORMATS = formats.filter((format) => format.create);
export const MAX_TEXT_BYTES = Math.max(...EDITABLE_FORMATS.map((format) => format.maxBytes));
export const MAX_BINARY_BYTES = Math.max(...formats.map((format) => format.maxBytes));

export function fileFormat(mediaType: string): FileFormat | undefined {
  return formats.find((format) => format.mime === mediaType.toLowerCase().split(";")[0].trim());
}
export function filenameFormat(name: string): FileFormat | undefined {
  const extension = /\.[^.\s/\\]+$/.exec(name.trim().toLowerCase())?.[0];
  return formats.find((format) => format.extensions.includes(extension ?? ""));
}
export function uploadFormat(name: string, mediaType: string): FileFormat | undefined {
  const format = filenameFormat(name);
  const mime = mediaType.toLowerCase().split(";")[0].trim();
  return format &&
    (!mime ||
      mime === "application/octet-stream" ||
      mime === format.mime ||
      format.aliases.includes(mime))
    ? format
    : undefined;
}
export function fileMetadataError(name: string, mediaType: string, size: number): string | null {
  const format = uploadFormat(name, mediaType);
  if (!format)
    return `Choose a supported file: ${SUPPORTED_FILE_LABELS}. Its extension and file type must agree.`;
  if (!Number.isSafeInteger(size) || size < format.minBytes || size > format.maxBytes)
    return `${format.label} files must be ${format.minBytes ? "at least 1 byte and " : ""}no larger than ${format.maxBytes >= 1048576 ? `${format.maxBytes / 1048576} MB` : `${format.maxBytes / 1024} KB`}.`;
  return null;
}
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("Save this file as UTF-8 text and try again.");
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
    throw new Error("This file contains binary data or unsupported control characters.");
  return text;
}
export function fileBytesError(mediaType: string, bytes: Uint8Array): string | null {
  const format = fileFormat(mediaType);
  if (!format) return "This file type is not supported by Library.";
  if (bytes.length < format.minBytes || bytes.length > format.maxBytes)
    return "This file exceeds its supported size limit or is empty.";
  if (format.editor === "text") {
    try {
      decodeText(bytes);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }
  const signatures: Record<string, number[]> = {
    pdf: [37, 80, 68, 70, 45],
    png: [137, 80, 78, 71, 13, 10, 26, 10],
    jpeg: [255, 216, 255],
  };
  return signatures[format.id]?.every((byte, index) => bytes[index] === byte)
    ? null
    : `This file does not match its ${format.label} format.`;
}
/** Type is immutable. Display names may omit extensions, but may not disguise another type. */
export function fileRenameError(name: string, mediaType: string): string | null {
  const format = fileFormat(mediaType);
  if (!format) return "This file type is not supported by Library.";
  const suffix = /\.[^.\s/\\]+$/.exec(name.trim());
  return suffix && filenameFormat(name)?.id !== format.id
    ? `Keep the ${format.label} file extension when renaming this file.`
    : null;
}
/** Legacy generated names without extensions remain Markdown. Unknown suffixes never fall back. */
export function createdTextFormat(name: string, kind: string): FileFormat | undefined {
  const format =
    filenameFormat(name) ??
    (!/\.[^.\s/\\]+$/.test(name.trim()) ? fileFormat("text/markdown") : undefined);
  return format?.create && (kind !== "planning_context" || format.id === "markdown")
    ? format
    : undefined;
}
