import { z } from "zod";

export const MiniAppIcon = z.object({
  relativePath: z.string(),
  mimeType: z.string(),
  generatedAt: z.string(),
  description: z.string(),
});
export type MiniAppIcon = z.infer<typeof MiniAppIcon>;

export const MiniAppManifest = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().default("🚀"),
  appDescription: z.string().default(""),
  icon: MiniAppIcon.nullable().default(null),
  iconError: z.string().nullable().default(null),
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

export const MiniAppIconDataResponse = z.object({
  dataUrl: z.string().nullable(),
  generatedAt: z.string().nullable(),
});
export type MiniAppIconDataResponse = z.infer<typeof MiniAppIconDataResponse>;

export const Checkpoint = z.object({
  id: z.string(),
  message: z.string(),
  createdAt: z.string(),
  author: z.enum(["kid", "felix", "system"]),
});
export type Checkpoint = z.infer<typeof Checkpoint>;
