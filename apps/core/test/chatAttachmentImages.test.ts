import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ChatAttachment } from "@felix/contracts";
import {
  detectSupportedImageMimeType,
  prepareAttachmentImages,
  supportsNativeImageInput,
} from "../src/chatAttachmentImages.ts";
import { promptWithAttachments } from "../src/miniAppManager.ts";

const tempDirs: string[] = [];
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde,
]);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("chat attachment images", () => {
  test("detects supported image types from bytes", () => {
    expect(detectSupportedImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(detectSupportedImageMimeType(PNG_BYTES)).toBe("image/png");
    expect(detectSupportedImageMimeType(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  test("requires known image input modality before preparing native images", async () => {
    const result = await prepareAttachmentImages(
      "/missing",
      [
        {
          id: "attachment_1",
          name: "image.png",
          mimeType: "image/png",
          size: PNG_BYTES.byteLength,
          relativePath: ".felix/attachments/attachment_1/image.png",
        },
      ],
      false,
    );

    expect(result).toEqual({
      images: [],
      notes: [
        {
          attachmentId: "attachment_1",
          note: "Native image not sent: the active model is registered as text-only. Switch to an image-capable model if you need Felix to inspect this picture directly.",
        },
      ],
    });
    expect(supportsNativeImageInput(["text", "image"])).toBe(true);
    expect(supportsNativeImageInput(["text"])).toBe(false);
    expect(supportsNativeImageInput(null)).toBe(false);
  });

  test("prepares model-native image blocks from persisted attachments", async () => {
    const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-app-"));
    tempDirs.push(appDir);
    const relativePath = ".felix/attachments/attachment_1/image.png";
    await fs.mkdir(path.dirname(path.join(appDir, relativePath)), { recursive: true });
    await fs.writeFile(path.join(appDir, relativePath), PNG_BYTES);
    const attachment: ChatAttachment = {
      id: "attachment_1",
      name: "image.png",
      mimeType: "application/octet-stream",
      size: PNG_BYTES.byteLength,
      relativePath,
    };

    const result = await prepareAttachmentImages(appDir, [attachment], true, async (_bytes, mimeType) => ({
      data: "encoded",
      mimeType,
      originalWidth: 1,
      originalHeight: 1,
      width: 1,
      height: 1,
      wasResized: false,
    }));

    expect(result).toEqual({
      images: [{ type: "image", data: "encoded", mimeType: "image/png" }],
      notes: [],
    });
  });

  test("includes preprocessing notes in the attachment prompt", () => {
    const prompt = promptWithAttachments(
      "Make this nicer",
      [
        {
          id: "attachment_1",
          name: "image.png",
          mimeType: "image/png",
          size: PNG_BYTES.byteLength,
          relativePath: ".felix/attachments/attachment_1/image.png",
        },
      ],
      [{ attachmentId: "attachment_1", note: "[Image resized from 4x4 to 2x2.]" }],
    );

    expect(prompt).toContain("Make this nicer");
    expect(prompt).toContain(
      "- image.png (image/png, 33 B): .felix/attachments/attachment_1/image.png",
    );
    expect(prompt).toContain("  [Image resized from 4x4 to 2x2.]");
  });
});
