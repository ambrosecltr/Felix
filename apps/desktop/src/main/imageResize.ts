import { nativeImage, type NativeImage } from "electron";
import type { ResizeImage, ResizedImage } from "@felix/core";

const MAX_BYTES = 4.5 * 1024 * 1024;
const MAX_WIDTH = 2000;
const MAX_HEIGHT = 2000;
const JPEG_QUALITIES = [80, 85, 70, 55, 40] as const;

interface EncodedCandidate {
  data: string;
  encodedSize: number;
  mimeType: string;
}

export const resizeImageForModel: ResizeImage = async (bytes, mimeType) => {
  const input = Buffer.from(bytes);
  const image = nativeImage.createFromBuffer(input);
  const originalSize = image.getSize();

  if (image.isEmpty() || originalSize.width <= 0 || originalSize.height <= 0) {
    return encodeOriginalIfSmallEnough(input, mimeType);
  }

  if (
    originalSize.width <= MAX_WIDTH &&
    originalSize.height <= MAX_HEIGHT &&
    encodedBase64Size(input.byteLength) < MAX_BYTES
  ) {
    return {
      data: input.toString("base64"),
      mimeType,
      originalWidth: originalSize.width,
      originalHeight: originalSize.height,
      width: originalSize.width,
      height: originalSize.height,
      wasResized: false,
    };
  }

  let currentSize = constrainSize(originalSize.width, originalSize.height);
  for (;;) {
    const resized = image.resize({
      width: currentSize.width,
      height: currentSize.height,
      quality: "best",
    });
    const candidate = bestCandidate(resized);
    if (candidate && candidate.encodedSize < MAX_BYTES) {
      return resizedResult(candidate, originalSize.width, originalSize.height, currentSize);
    }

    if (currentSize.width === 1 && currentSize.height === 1) return null;
    const nextSize = {
      width: currentSize.width === 1 ? 1 : Math.max(1, Math.floor(currentSize.width * 0.75)),
      height: currentSize.height === 1 ? 1 : Math.max(1, Math.floor(currentSize.height * 0.75)),
    };
    if (nextSize.width === currentSize.width && nextSize.height === currentSize.height) return null;
    currentSize = nextSize;
  }
};

function encodeOriginalIfSmallEnough(input: Buffer, mimeType: string): ResizedImage | null {
  if (encodedBase64Size(input.byteLength) >= MAX_BYTES) return null;
  return {
    data: input.toString("base64"),
    mimeType,
    originalWidth: 0,
    originalHeight: 0,
    width: 0,
    height: 0,
    wasResized: false,
  };
}

function resizedResult(
  candidate: EncodedCandidate,
  originalWidth: number,
  originalHeight: number,
  size: { width: number; height: number },
): ResizedImage {
  return {
    data: candidate.data,
    mimeType: candidate.mimeType,
    originalWidth,
    originalHeight,
    width: size.width,
    height: size.height,
    wasResized: size.width !== originalWidth || size.height !== originalHeight,
  };
}

function bestCandidate(image: NativeImage): EncodedCandidate | null {
  const candidates = [
    encodeCandidate(image.toPNG(), "image/png"),
    ...JPEG_QUALITIES.map((quality) => encodeCandidate(image.toJPEG(quality), "image/jpeg")),
  ].filter((candidate): candidate is EncodedCandidate => candidate !== null);

  return candidates.reduce<EncodedCandidate | null>((best, candidate) => {
    if (!best || candidate.encodedSize < best.encodedSize) return candidate;
    return best;
  }, null);
}

function encodeCandidate(buffer: Buffer, mimeType: string): EncodedCandidate | null {
  if (buffer.byteLength === 0) return null;
  return {
    data: buffer.toString("base64"),
    encodedSize: encodedBase64Size(buffer.byteLength),
    mimeType,
  };
}

function constrainSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encodedBase64Size(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}
