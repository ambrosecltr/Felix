import {
  MAX_CHAT_ATTACHMENT_BYTES,
  type ChatAttachmentInput,
} from "@felix/contracts";

export async function filesToChatAttachments(files: File[]): Promise<ChatAttachmentInput[]> {
  const attachments: ChatAttachmentInput[] = [];

  for (const file of files) {
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} is larger than ${formatFileSize(MAX_CHAT_ATTACHMENT_BYTES)}.`);
    }

    attachments.push({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
    });
  }

  return attachments;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
