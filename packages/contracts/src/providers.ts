import { z } from "zod";

export const PROVIDER_IDS = [
  "openrouter",
  "deepseek",
  "nvidia-nim",
  "oc-sdk-go",
  "oc-sdk-zen",
] as const;

export const ProviderId = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderId>;

export const ProviderModel = z.object({
  id: z.string(),
  name: z.string(),
});
export type ProviderModel = z.infer<typeof ProviderModel>;

export const ProviderModelsRequest = z.object({
  providerId: ProviderId,
  apiKey: z.string().optional(),
  oauthAccessToken: z.string().optional(),
});
export type ProviderModelsRequest = z.infer<typeof ProviderModelsRequest>;

export const ProviderModelsResponse = z.object({
  providerId: ProviderId,
  models: z.array(ProviderModel),
  source: z.enum(["provider", "local", "fallback", "none"]),
  error: z.string().nullable(),
});
export type ProviderModelsResponse = z.infer<typeof ProviderModelsResponse>;

export interface ProviderApiKeyAuth {
  type: "api_key";
  label: string;
  envVars: readonly string[];
  placeholder: string;
  externalAuthKey?: string;
}

export interface ProviderOAuthAuth {
  type: "oauth";
  label: string;
}

export type ProviderAuth = ProviderApiKeyAuth | ProviderOAuthAuth;

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  baseUrl: string;
  api: "openai-completions";
  auth: ProviderAuth;
  piConfig: "generated" | "extension";
  modelSource: "openai-models" | "opencode-registry";
  extensionPackage?: string;
  defaultModel: string;
  fallbackModels: readonly ProviderModel[];
}

export const PROVIDER_CATALOG_BY_ID: Record<ProviderId, ProviderCatalogEntry> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    api: "openai-completions",
    auth: {
      type: "api_key",
      label: "API Key",
      envVars: ["OPENROUTER_API_KEY"],
      placeholder: "sk-or-...",
    },
    piConfig: "generated",
    modelSource: "openai-models",
    defaultModel: "anthropic/claude-3.5-sonnet",
    fallbackModels: [
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
      { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6" },
      { id: "openai/gpt-5.4", name: "GPT-5.4" },
      { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
    ],
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    api: "openai-completions",
    auth: {
      type: "api_key",
      label: "API Key",
      envVars: ["DEEPSEEK_API_KEY"],
      placeholder: "sk-...",
    },
    piConfig: "generated",
    modelSource: "openai-models",
    defaultModel: "deepseek-v4-pro",
    fallbackModels: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-v3.2", name: "DeepSeek V3.2" },
    ],
  },
  "nvidia-nim": {
    id: "nvidia-nim",
    label: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    api: "openai-completions",
    auth: {
      type: "api_key",
      label: "API Key",
      envVars: ["NVIDIA_NIM_API_KEY", "NVIDIA_API_KEY"],
      placeholder: "nvapi-...",
    },
    piConfig: "generated",
    modelSource: "openai-models",
    defaultModel: "deepseek-ai/deepseek-v4-flash",
    fallbackModels: [
      { id: "deepseek-ai/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-ai/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-ai/deepseek-v3.2", name: "DeepSeek V3.2" },
      { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6" },
      { id: "moonshotai/kimi-k2-thinking", name: "Kimi K2 Thinking" },
      { id: "minimaxai/minimax-m2.1", name: "MiniMax M2.1" },
      { id: "z-ai/glm5", name: "GLM 5" },
      { id: "z-ai/glm4.7", name: "GLM 4.7" },
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B" },
      { id: "qwen/qwen3-coder-480b-a35b-instruct", name: "Qwen3 Coder 480B" },
      { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B" },
      { id: "meta/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" },
      { id: "meta/llama-3.1-405b-instruct", name: "Llama 3.1 405B" },
      { id: "mistralai/mistral-large-3-675b-instruct-2512", name: "Mistral Large 3" },
      { id: "mistralai/devstral-2-123b-instruct-2512", name: "Devstral 2" },
      {
        id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
        name: "Nemotron Ultra 253B",
      },
      {
        id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        name: "Nemotron Super 49B v1.5",
      },
      { id: "microsoft/phi-4-mini-flash-reasoning", name: "Phi 4 Mini Flash Reasoning" },
      { id: "ibm/granite-3.3-8b-instruct", name: "Granite 3.3 8B" },
    ],
  },
  "oc-sdk-go": {
    id: "oc-sdk-go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    api: "openai-completions",
    auth: {
      type: "api_key",
      label: "OpenCode Go API Key",
      envVars: [],
      placeholder: "sk-...",
      externalAuthKey: "opencode-go",
    },
    piConfig: "extension",
    modelSource: "opencode-registry",
    extensionPackage: "pi-opencode-bridge",
    defaultModel: "deepseek-v4-pro",
    fallbackModels: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "kimi-k2.6", name: "Kimi K2.6" },
      { id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro" },
      { id: "glm-5.1", name: "GLM 5.1" },
      { id: "qwen3.6-plus", name: "Qwen3.6 Plus" },
    ],
  },
  "oc-sdk-zen": {
    id: "oc-sdk-zen",
    label: "OpenCode Zen",
    baseUrl: "https://opencode.ai/zen/v1",
    api: "openai-completions",
    auth: {
      type: "api_key",
      label: "OpenCode Zen API Key",
      envVars: [],
      placeholder: "sk-...",
      externalAuthKey: "opencode",
    },
    piConfig: "extension",
    modelSource: "opencode-registry",
    extensionPackage: "pi-opencode-bridge",
    defaultModel: "claude-opus-4.7",
    fallbackModels: [
      { id: "claude-opus-4.7", name: "Claude Opus 4.7" },
      { id: "gpt-5.2", name: "GPT-5.2" },
    ],
  },
};

export const PROVIDER_CATALOG = PROVIDER_IDS.map((id) => PROVIDER_CATALOG_BY_ID[id]);
