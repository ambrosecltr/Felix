import { z } from "zod";

export const ChatRole = z.enum(["kid", "felix", "system"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const AgentEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({ type: z.literal("message_start") }),
  z.object({ type: z.literal("message_end") }),
  z.object({
    type: z.literal("tool_start"),
    toolName: z.string(),
    label: z.string().optional(),
    detail: z.string().optional(),
  }),
  z.object({ type: z.literal("tool_end"), toolName: z.string(), isError: z.boolean() }),
  z.object({
    type: z.literal("extension_ui_request"),
    request: z.object({
      id: z.string(),
      method: z.string(),
      title: z.string().optional(),
      message: z.string().optional(),
      options: z.string().array().optional(),
      placeholder: z.string().optional(),
      prefill: z.string().optional(),
      timeout: z.number().optional(),
      notifyType: z.enum(["info", "warning", "error"]).optional(),
      statusKey: z.string().optional(),
      statusText: z.string().optional(),
      widgetKey: z.string().optional(),
      widgetLines: z.string().array().optional(),
      text: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal("agent_start") }),
  z.object({ type: z.literal("agent_end") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEvent>;

export const ExtensionUiResponse = z.object({
  id: z.string(),
  value: z.string().optional(),
  confirmed: z.boolean().optional(),
  cancelled: z.boolean().optional(),
});
export type ExtensionUiResponse = z.infer<typeof ExtensionUiResponse>;

export const ChatMessage = z.object({
  id: z.string(),
  role: ChatRole,
  text: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatStep = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    toolName: z.string(),
    label: z.string(),
    detail: z.string().optional(),
    isError: z.boolean().optional(),
  }),
]);
export type ChatStep = z.infer<typeof ChatStep>;

export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_CHAT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_CHAT_ATTACHMENT_BASE64_CHARS = Math.ceil((MAX_CHAT_ATTACHMENT_BYTES * 4) / 3) + 4;

export const ChatAttachmentInput = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().max(128).default("application/octet-stream"),
  size: z.number().int().nonnegative().max(MAX_CHAT_ATTACHMENT_BYTES),
  dataBase64: z.string().max(MAX_CHAT_ATTACHMENT_BASE64_CHARS),
});
export type ChatAttachmentInput = z.infer<typeof ChatAttachmentInput>;

export const ChatAttachment = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  relativePath: z.string(),
});
export type ChatAttachment = z.infer<typeof ChatAttachment>;

export const ChatTurnStatus = z.enum(["working", "done", "error"]);
export type ChatTurnStatus = z.infer<typeof ChatTurnStatus>;

export const ChatTurn = z.object({
  id: z.string(),
  role: ChatRole,
  text: z.string(),
  steps: ChatStep.array(),
  attachments: ChatAttachment.array().default([]),
  status: ChatTurnStatus,
  createdAt: z.string(),
});
export type ChatTurn = z.infer<typeof ChatTurn>;
