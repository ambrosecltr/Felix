import { z } from "zod";
import { PROVIDER_CATALOG_BY_ID, ProviderId, ProviderInputModality } from "./providers.ts";

export const WEB_SEARCH_PROVIDER_IDS = [
  "brave",
  "tavily",
  "serper",
  "exa",
  "youcom",
  "jina",
  "firecrawl",
  "perplexity",
  "searxng",
  "ollama",
] as const;

export const WebSearchProviderId = z.enum(WEB_SEARCH_PROVIDER_IDS);
export type WebSearchProviderId = z.infer<typeof WebSearchProviderId>;

export interface WebSearchProviderCatalogEntry {
  id: WebSearchProviderId;
  label: string;
  apiKeyEnvVar: string;
  apiKeyPlaceholder: string;
  baseUrlEnvVar?: string;
  defaultBaseUrl?: string;
}

export const WEB_SEARCH_PROVIDER_CATALOG_BY_ID: Record<
  WebSearchProviderId,
  WebSearchProviderCatalogEntry
> = {
  brave: {
    id: "brave",
    label: "Brave",
    apiKeyEnvVar: "BRAVE_SEARCH_API_KEY",
    apiKeyPlaceholder: "BSA...",
  },
  tavily: {
    id: "tavily",
    label: "Tavily",
    apiKeyEnvVar: "TAVILY_API_KEY",
    apiKeyPlaceholder: "tvly-...",
  },
  serper: {
    id: "serper",
    label: "Serper",
    apiKeyEnvVar: "SERPER_API_KEY",
    apiKeyPlaceholder: "...",
  },
  exa: {
    id: "exa",
    label: "Exa",
    apiKeyEnvVar: "EXA_API_KEY",
    apiKeyPlaceholder: "exa-...",
  },
  youcom: {
    id: "youcom",
    label: "You.com",
    apiKeyEnvVar: "YOUCOM_API_KEY",
    apiKeyPlaceholder: "youdotcom-...",
  },
  jina: {
    id: "jina",
    label: "Jina",
    apiKeyEnvVar: "JINA_API_KEY",
    apiKeyPlaceholder: "jina_...",
  },
  firecrawl: {
    id: "firecrawl",
    label: "Firecrawl",
    apiKeyEnvVar: "FIRECRAWL_API_KEY",
    apiKeyPlaceholder: "fc-...",
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    apiKeyEnvVar: "PERPLEXITY_API_KEY",
    apiKeyPlaceholder: "pplx-...",
  },
  searxng: {
    id: "searxng",
    label: "SearXNG",
    apiKeyEnvVar: "SEARXNG_API_KEY",
    apiKeyPlaceholder: "optional",
    baseUrlEnvVar: "SEARXNG_URL",
    defaultBaseUrl: "http://localhost:8080",
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    apiKeyEnvVar: "OLLAMA_API_KEY",
    apiKeyPlaceholder: "optional",
    baseUrlEnvVar: "OLLAMA_HOST",
    defaultBaseUrl: "http://localhost:11434",
  },
};

export const WEB_SEARCH_PROVIDER_CATALOG = WEB_SEARCH_PROVIDER_IDS.map(
  (id) => WEB_SEARCH_PROVIDER_CATALOG_BY_ID[id],
);

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

export const WebSearchSettings = z.object({
  enabled: z.boolean().default(false),
  provider: WebSearchProviderId.default("brave"),
  apiKeys: z.record(WebSearchProviderId, z.string()).default({}),
  baseUrls: z.record(WebSearchProviderId, z.string()).default({}),
});
export type WebSearchSettings = z.infer<typeof WebSearchSettings>;

export const LockdownSettings = z.object({
  enabled: z.boolean().default(false),
  pinHash: z.string().default(""),
  pinSalt: z.string().default(""),
});
export type LockdownSettings = z.infer<typeof LockdownSettings>;

export const FelixSettings = z.object({
  activeProvider: ProviderId.default("openrouter"),
  activeModel: z.string().default("anthropic/claude-3.5-sonnet"),
  activeModelInputModalities: ProviderInputModality.array().nullable().default(null),
  providers: z.array(ProviderConfig).default([]),
  iconGeneration: IconGenerationSettings.default({
    enabled: false,
    xaiApiKey: "",
  }),
  webSearch: WebSearchSettings.default({
    enabled: false,
    provider: "brave",
    apiKeys: {},
    baseUrls: {},
  }),
  lockdown: LockdownSettings.default({
    enabled: false,
    pinHash: "",
    pinSalt: "",
  }),
  sandboxAllowNetwork: z.boolean().default(true),
  dataDir: z.string().nullable().default(null),
});
export type FelixSettings = z.infer<typeof FelixSettings>;

export const DEFAULT_SETTINGS: FelixSettings = {
  activeProvider: "openrouter",
  activeModel: PROVIDER_CATALOG_BY_ID.openrouter.defaultModel,
  activeModelInputModalities: null,
  providers: [],
  iconGeneration: {
    enabled: false,
    xaiApiKey: "",
  },
  webSearch: {
    enabled: false,
    provider: "brave",
    apiKeys: {},
    baseUrls: {},
  },
  lockdown: {
    enabled: false,
    pinHash: "",
    pinSalt: "",
  },
  sandboxAllowNetwork: true,
  dataDir: null,
};
