import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type ChatAttachment,
  type ProviderInputModality,
} from "@felix/contracts";

export interface ImageResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxBytes?: number;
  jpegQuality?: number;
}

export interface ResizedImage {
  data: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  wasResized: boolean;
}

export interface AgentImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface AttachmentImagePromptNote {
  attachmentId: string;
  note: string;
}

export interface PreparedAttachmentImages {
  images: AgentImageContent[];
  notes: AttachmentImagePromptNote[];
}

export type ResizeImage = (bytes: Uint8Array, mimeType: string) => Promise<ResizedImage | null>;

const DEFAULT_MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const IMAGE_TYPE_SNIFF_BYTES = 4100;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const DEFAULT_IMAGE_RESIZE_OPTIONS: Required<ImageResizeOptions> = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBytes: DEFAULT_MAX_IMAGE_BYTES,
  jpegQuality: 80,
};

export function supportsNativeImageInput(
  inputModalities: readonly ProviderInputModality[] | null | undefined,
): boolean {
  return inputModalities?.includes("image") ?? false;
}

export async function prepareAttachmentImages(
  appDir: string,
  attachments: ChatAttachment[],
  nativeImageInputSupported: boolean,
  resizeImage: ResizeImage = encodeImageForPrompt,
): Promise<PreparedAttachmentImages> {
  if (attachments.length === 0) {
    return { images: [], notes: [] };
  }
  if (!nativeImageInputSupported) {
    return { images: [], notes: unsupportedImageNotes(attachments) };
  }

  const images: AgentImageContent[] = [];
  const notes: AttachmentImagePromptNote[] = [];

  for (const attachment of attachments) {
    const filePath = safeAttachmentPath(appDir, attachment.relativePath);
    const bytes = await fs.readFile(filePath);
    const mimeType = detectSupportedImageMimeType(bytes.subarray(0, IMAGE_TYPE_SNIFF_BYTES));
    if (!mimeType) continue;

    const resized = await resizeImage(bytes, mimeType);
    if (!resized) {
      notes.push({
        attachmentId: attachment.id,
        note: "Native image omitted: could not be resized below the inline image size limit.",
      });
      continue;
    }

    images.push({ type: "image", data: resized.data, mimeType: resized.mimeType });
    const dimensionNote = formatDimensionNote(resized);
    if (dimensionNote) notes.push({ attachmentId: attachment.id, note: dimensionNote });
  }

  return { images, notes };
}

function unsupportedImageNotes(attachments: ChatAttachment[]): AttachmentImagePromptNote[] {
  return attachments
    .filter((attachment) => attachment.mimeType.startsWith("image/"))
    .map((attachment) => ({
      attachmentId: attachment.id,
      note: "Native image not sent: the active model is registered as text-only. Switch to an image-capable model if you need Felix to inspect this picture directly.",
    }));
}

export async function encodeImageForPrompt(
  inputBytes: Uint8Array,
  mimeType: string,
  options?: ImageResizeOptions,
): Promise<ResizedImage | null> {
  const opts = { ...DEFAULT_IMAGE_RESIZE_OPTIONS, ...options };
  if (encodedBase64Size(inputBytes.byteLength) >= opts.maxBytes) return null;

  const dimensions = readImageDimensions(inputBytes, mimeType);
  return {
    data: Buffer.from(inputBytes).toString("base64"),
    mimeType,
    originalWidth: dimensions?.width ?? 0,
    originalHeight: dimensions?.height ?? 0,
    width: dimensions?.width ?? 0,
    height: dimensions?.height ?? 0,
    wasResized: false,
  };
}

export function formatDimensionNote(result: ResizedImage): string | undefined {
  if (!result.wasResized) return undefined;
  const scale = result.originalWidth / result.width;
  return `[Image: original ${result.originalWidth}x${result.originalHeight}, displayed at ${result.width}x${result.height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`;
}

export function detectSupportedImageMimeType(buffer: Uint8Array): string | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return buffer[3] === 0xf7 ? null : "image/jpeg";
  }
  if (startsWith(buffer, PNG_SIGNATURE)) {
    return isPng(buffer) && !isAnimatedPng(buffer) ? "image/png" : null;
  }
  if (startsWithAscii(buffer, 0, "GIF")) return "image/gif";
  if (startsWithAscii(buffer, 0, "RIFF") && startsWithAscii(buffer, 8, "WEBP")) {
    return "image/webp";
  }
  return null;
}

export function encodedBase64Size(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

function safeAttachmentPath(appDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error("Attachment path must be relative");
  const root = path.resolve(appDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Attachment path is outside the app directory");
  }
  return resolved;
}

function readImageDimensions(
  buffer: Uint8Array,
  mimeType: string,
): { width: number; height: number } | null {
  if (mimeType === "image/png") return readPngDimensions(buffer);
  if (mimeType === "image/jpeg") return readJpegDimensions(buffer);
  if (mimeType === "image/gif") return readGifDimensions(buffer);
  if (mimeType === "image/webp") return readWebpDimensions(buffer);
  return null;
}

function readPngDimensions(buffer: Uint8Array): { width: number; height: number } | null {
  if (!isPng(buffer) || buffer.length < 24) return null;
  return { width: readUint32BE(buffer, 16), height: readUint32BE(buffer, 20) };
}

function readJpegDimensions(buffer: Uint8Array): { width: number; height: number } | null {
  if (!startsWith(buffer, [0xff, 0xd8])) return null;

  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset];
    offset++;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    if (offset + 2 > buffer.length) return null;

    const segmentLength = readUint16BE(buffer, offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7) return null;
      return {
        height: readUint16BE(buffer, offset + 3),
        width: readUint16BE(buffer, offset + 5),
      };
    }
    offset += segmentLength;
  }

  return null;
}

function readGifDimensions(buffer: Uint8Array): { width: number; height: number } | null {
  if (!startsWithAscii(buffer, 0, "GIF") || buffer.length < 10) return null;
  return { width: readUint16LE(buffer, 6), height: readUint16LE(buffer, 8) };
}

function readWebpDimensions(buffer: Uint8Array): { width: number; height: number } | null {
  if (!startsWithAscii(buffer, 0, "RIFF") || !startsWithAscii(buffer, 8, "WEBP")) return null;
  if (startsWithAscii(buffer, 12, "VP8X") && buffer.length >= 30) {
    return {
      width: 1 + readUint24LE(buffer, 24),
      height: 1 + readUint24LE(buffer, 27),
    };
  }
  if (startsWithAscii(buffer, 12, "VP8 ") && buffer.length >= 30) {
    if (!startsWith(buffer.subarray(23), [0x9d, 0x01, 0x2a])) return null;
    return {
      width: readUint16LE(buffer, 26) & 0x3fff,
      height: readUint16LE(buffer, 28) & 0x3fff,
    };
  }
  if (startsWithAscii(buffer, 12, "VP8L") && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits =
      (buffer[21] ?? 0) |
      ((buffer[22] ?? 0) << 8) |
      ((buffer[23] ?? 0) << 16) |
      ((buffer[24] ?? 0) << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

function isPng(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 16 &&
    readUint32BE(buffer, PNG_SIGNATURE.length) === 13 &&
    startsWithAscii(buffer, 12, "IHDR")
  );
}

function isAnimatedPng(buffer: Uint8Array): boolean {
  let offset: number = PNG_SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const chunkLength = readUint32BE(buffer, offset);
    const chunkTypeOffset = offset + 4;
    if (startsWithAscii(buffer, chunkTypeOffset, "acTL")) return true;
    if (startsWithAscii(buffer, chunkTypeOffset, "IDAT")) return false;

    const nextOffset = offset + 8 + chunkLength + 4;
    if (nextOffset <= offset || nextOffset > buffer.length) return false;
    offset = nextOffset;
  }
  return false;
}

function readUint32BE(buffer: Uint8Array, offset: number): number {
  return (
    ((buffer[offset] ?? 0) * 0x1000000) +
    ((buffer[offset + 1] ?? 0) << 16) +
    ((buffer[offset + 2] ?? 0) << 8) +
    (buffer[offset + 3] ?? 0)
  );
}

function readUint24LE(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] ?? 0) +
    ((buffer[offset + 1] ?? 0) << 8) +
    ((buffer[offset + 2] ?? 0) << 16)
  );
}

function readUint16BE(buffer: Uint8Array, offset: number): number {
  return (((buffer[offset] ?? 0) << 8) + (buffer[offset + 1] ?? 0));
}

function readUint16LE(buffer: Uint8Array, offset: number): number {
  return ((buffer[offset] ?? 0) + ((buffer[offset + 1] ?? 0) << 8));
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  );
}

function startsWith(buffer: Uint8Array, bytes: readonly number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function startsWithAscii(buffer: Uint8Array, offset: number, text: string): boolean {
  if (buffer.length < offset + text.length) return false;
  for (let index = 0; index < text.length; index++) {
    if (buffer[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}
