import { z } from "zod";

export const ChatRole = z.enum(["kid", "felix", "system"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const AgentEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({ type: z.literal("message_start") }),
  z.object({ type: z.literal("message_end") }),
  z.object({ type: z.literal("tool_start"), toolName: z.string(), label: z.string().optional() }),
  z.object({ type: z.literal("tool_end"), toolName: z.string(), isError: z.boolean() }),
  z.object({ type: z.literal("agent_start") }),
  z.object({ type: z.literal("agent_end") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEvent>;

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
    isError: z.boolean().optional(),
  }),
]);
export type ChatStep = z.infer<typeof ChatStep>;

export const ChatTurnStatus = z.enum(["working", "done", "error"]);
export type ChatTurnStatus = z.infer<typeof ChatTurnStatus>;

export const ChatTurn = z.object({
  id: z.string(),
  role: ChatRole,
  text: z.string(),
  steps: ChatStep.array(),
  status: ChatTurnStatus,
  createdAt: z.string(),
});
export type ChatTurn = z.infer<typeof ChatTurn>;
