import { z } from "zod";
import { PROVIDER_CATALOG_BY_ID, ProviderId } from "./providers.ts";

export const ProviderOAuthConfig = z.object({
  accessToken: z.string().default(""),
  refreshToken: z.string().default(""),
  expiresAt: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type ProviderOAuthConfig = z.infer<typeof ProviderOAuthConfig>;

export const ProviderConfig = z.object({
  id: ProviderId,
  apiKey: z.string().default(""),
  oauth: ProviderOAuthConfig.optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfig>;

export const IconGenerationSettings = z.object({
  enabled: z.boolean().default(false),
  xaiApiKey: z.string().default(""),
});
export type IconGenerationSettings = z.infer<typeof IconGenerationSettings>;

export const FelixSettings = z.object({
  activeProvider: ProviderId.default("openrouter"),
  activeModel: z.string().default("anthropic/claude-3.5-sonnet"),
  providers: z.array(ProviderConfig).default([]),
  iconGeneration: IconGenerationSettings.default({
    enabled: false,
    xaiApiKey: "",
  }),
  sandboxAllowNetwork: z.boolean().default(true),
  dataDir: z.string().nullable().default(null),
});
export type FelixSettings = z.infer<typeof FelixSettings>;

export const DEFAULT_SETTINGS: FelixSettings = {
  activeProvider: "openrouter",
  activeModel: PROVIDER_CATALOG_BY_ID.openrouter.defaultModel,
  providers: [],
  iconGeneration: {
    enabled: false,
    xaiApiKey: "",
  },
  sandboxAllowNetwork: true,
  dataDir: null,
};
