import { z } from "zod";

export const MiniAppManifest = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().default("🚀"),
  createdAt: z.string(),
  updatedAt: z.string(),
  devPort: z.number().int().positive().nullable().default(null),
});
export type MiniAppManifest = z.infer<typeof MiniAppManifest>;

export const MiniAppStatus = z.enum([
  "idle",
  "scaffolding",
  "installing",
  "starting",
  "running",
  "stopped",
  "error",
]);
export type MiniAppStatus = z.infer<typeof MiniAppStatus>;

export const MiniAppSummary = MiniAppManifest.extend({
  status: MiniAppStatus,
  devUrl: z.string().nullable().default(null),
});
export type MiniAppSummary = z.infer<typeof MiniAppSummary>;

export const Checkpoint = z.object({
  id: z.string(),
  message: z.string(),
  createdAt: z.string(),
  author: z.enum(["kid", "felix", "system"]),
});
export type Checkpoint = z.infer<typeof Checkpoint>;
