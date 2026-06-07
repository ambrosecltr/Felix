import { z } from "zod";
import {
  AgentEvent,
  ChatAttachmentInput,
  ChatTurn,
  ExtensionUiResponse,
  MAX_CHAT_ATTACHMENTS,
} from "./agent.ts";
// ChatMessage retained in agent.ts for compatibility; turns are the new unit.
import {
  Checkpoint,
  MiniAppIconDataResponse,
  MiniAppStatus,
  MiniAppSummary,
} from "./miniApp.ts";
import { ProviderModelsRequest, ProviderModelsResponse } from "./providers.ts";
import { ProfileOverview, SetProfileNameRequest } from "./profile.ts";
import { FelixSettings } from "./settings.ts";

export const CreateMiniAppRequest = z.object({
  prompt: z.string(),
});
export type CreateMiniAppRequest = z.infer<typeof CreateMiniAppRequest>;

export const SendChatRequest = z.object({
  appId: z.string(),
  text: z.string(),
  attachments: ChatAttachmentInput.array().max(MAX_CHAT_ATTACHMENTS).default([]),
});
export type SendChatRequest = z.infer<typeof SendChatRequest>;

export const RestoreCheckpointRequest = z.object({
  appId: z.string(),
  checkpointId: z.string(),
});
export type RestoreCheckpointRequest = z.infer<typeof RestoreCheckpointRequest>;

export const MiniAppIconRequest = z.object({
  appId: z.string(),
});
export type MiniAppIconRequest = z.infer<typeof MiniAppIconRequest>;

export const UpdateDownloadProgress = z.object({
  percent: z.number().min(0).max(100),
  bytesPerSecond: z.number().nonnegative(),
  transferred: z.number().nonnegative(),
  total: z.number().nonnegative(),
});
export type UpdateDownloadProgress = z.infer<typeof UpdateDownloadProgress>;

export const UpdateStatus = z.object({
  state: z.enum([
    "idle",
    "checking",
    "available",
    "not-available",
    "downloading",
    "downloaded",
    "installing",
    "error",
  ]),
  currentVersion: z.string(),
  availableVersion: z.string().nullable(),
  progress: UpdateDownloadProgress.nullable(),
  error: z.string().nullable(),
  checkedAt: z.string().nullable(),
});
export type UpdateStatus = z.infer<typeof UpdateStatus>;

/**
 * Request/response IPC methods (renderer -> main, awaitable).
 * Keys are channel names; tuple is [request, response].
 */
export interface FelixApi {
  "miniApp.list": [void, MiniAppSummary[]];
  "miniApp.create": [CreateMiniAppRequest, MiniAppSummary];
  "miniApp.open": [{ appId: string }, MiniAppSummary];
  "miniApp.icon": [MiniAppIconRequest, MiniAppIconDataResponse];
  "miniApp.stop": [{ appId: string }, void];
  "miniApp.delete": [{ appId: string }, void];
  "chat.history": [{ appId: string }, ChatTurn[]];
  "chat.clear": [{ appId: string }, void];
  "chat.send": [SendChatRequest, void];
  "chat.abort": [{ appId: string }, void];
  "agent.ui.respond": [{ appId: string; response: ExtensionUiResponse }, void];
  "checkpoint.list": [{ appId: string }, Checkpoint[]];
  "checkpoint.restore": [RestoreCheckpointRequest, void];
  "settings.get": [void, FelixSettings];
  "settings.set": [FelixSettings, FelixSettings];
  "profile.get": [void, ProfileOverview];
  "profile.setName": [SetProfileNameRequest, ProfileOverview];
  "provider.models": [ProviderModelsRequest, ProviderModelsResponse];
  "update.status": [void, UpdateStatus];
  "update.check": [void, UpdateStatus];
  "update.downloadAndInstall": [void, UpdateStatus];
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
  z.object({
    kind: z.literal("profileUpdated"),
    profile: ProfileOverview,
  }),
  z.object({
    kind: z.literal("update"),
    status: UpdateStatus,
  }),
]);
export type PushEvent = z.infer<typeof PushEvent>;

export const PUSH_CHANNEL = "felix:push";
