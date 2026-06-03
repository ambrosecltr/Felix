import { z } from "zod";

export const ProviderId = z.enum(["openrouter", "deepseek"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const ProviderConfig = z.object({
  id: ProviderId,
  apiKey: z.string().default(""),
});
export type ProviderConfig = z.infer<typeof ProviderConfig>;

export const FelixSettings = z.object({
  activeProvider: ProviderId.default("openrouter"),
  activeModel: z.string().default("anthropic/claude-3.5-sonnet"),
  providers: z.array(ProviderConfig).default([]),
  sandboxAllowNetwork: z.boolean().default(true),
  dataDir: z.string().nullable().default(null),
});
export type FelixSettings = z.infer<typeof FelixSettings>;

export const DEFAULT_SETTINGS: FelixSettings = {
  activeProvider: "openrouter",
  activeModel: "anthropic/claude-3.5-sonnet",
  providers: [],
  sandboxAllowNetwork: true,
  dataDir: null,
};
