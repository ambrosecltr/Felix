import { z } from "zod";
import { AgentEvent, ChatTurn, ExtensionUiResponse } from "./agent.ts";
// ChatMessage retained in agent.ts for compatibility; turns are the new unit.
import { Checkpoint, MiniAppStatus, MiniAppSummary } from "./miniApp.ts";
import { FelixSettings } from "./settings.ts";

export const CreateMiniAppRequest = z.object({
  prompt: z.string(),
});
export type CreateMiniAppRequest = z.infer<typeof CreateMiniAppRequest>;

export const SendChatRequest = z.object({
  appId: z.string(),
  text: z.string(),
});
export type SendChatRequest = z.infer<typeof SendChatRequest>;

export const RestoreCheckpointRequest = z.object({
  appId: z.string(),
  checkpointId: z.string(),
});
export type RestoreCheckpointRequest = z.infer<typeof RestoreCheckpointRequest>;

/**
 * Request/response IPC methods (renderer -> main, awaitable).
 * Keys are channel names; tuple is [request, response].
 */
export interface FelixApi {
  "miniApp.list": [void, MiniAppSummary[]];
  "miniApp.create": [CreateMiniAppRequest, MiniAppSummary];
  "miniApp.open": [{ appId: string }, MiniAppSummary];
  "miniApp.stop": [{ appId: string }, void];
  "miniApp.delete": [{ appId: string }, void];
  "chat.history": [{ appId: string }, ChatTurn[]];
  "chat.send": [SendChatRequest, void];
  "chat.abort": [{ appId: string }, void];
  "agent.ui.respond": [{ appId: string; response: ExtensionUiResponse }, void];
  "checkpoint.list": [{ appId: string }, Checkpoint[]];
  "checkpoint.restore": [RestoreCheckpointRequest, void];
  "settings.get": [void, FelixSettings];
  "settings.set": [FelixSettings, FelixSettings];
}

export type FelixApiChannel = keyof FelixApi;
export type FelixApiRequest<C extends FelixApiChannel> = FelixApi[C][0];
export type FelixApiResponse<C extends FelixApiChannel> = FelixApi[C][1];

/**
 * Push events (main -> renderer, fire and forget).
 */
export const PushEvent = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("agent"),
    appId: z.string(),
    event: AgentEvent,
  }),
  z.object({
    kind: z.literal("status"),
    appId: z.string(),
    status: MiniAppStatus,
    devUrl: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("chatTurn"),
    appId: z.string(),
    turn: ChatTurn,
  }),
  z.object({
    kind: z.literal("miniAppUpdated"),
    appId: z.string(),
    summary: MiniAppSummary,
  }),
]);
export type PushEvent = z.infer<typeof PushEvent>;

export const PUSH_CHANNEL = "felix:push";
