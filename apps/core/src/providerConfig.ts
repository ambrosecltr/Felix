import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  PROVIDER_CATALOG_BY_ID,
  type FelixSettings,
  type ProviderId,
  type ProviderInputModality,
  type ProviderModel,
} from "@felix/contracts";

interface PiProviderConfig {
  name: string;
  baseUrl: string;
  api: string;
  apiKey: string;
  authHeader: true;
  models: PiProviderModelConfig[];
  modelOverrides?: Record<string, PiProviderModelOverride>;
}

interface PiProviderModelConfig {
  id: string;
  name: string;
  input: ProviderInputModality[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
}

interface PiProviderModelOverride {
  input: ProviderInputModality[];
}

interface PiApiKeyCredential {
  type: "api_key";
  key: string;
}

interface OpenCodeCliCredential {
  type: "api";
  key: string;
}

type JsonRecord = Record<string, unknown>;

interface ProviderConfigWriteOptions {
  homeDir?: string;
}

const OPENCODE_PROVIDER_BY_AUTH_KEY: Record<string, ProviderId> = {
  "opencode-go": "oc-sdk-go",
  opencode: "oc-sdk-zen",
};
const DEFAULT_MODEL_LIMIT = { contextWindow: 204_800, maxTokens: 131_072 };
const DEFAULT_MODEL_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * Writes PI's auth.json and models.json into the Felix agent dir so spawned
 * `pi` processes can authenticate with the keys configured in Felix settings.
 */
export async function writeProviderConfig(
  agentDir: string,
  settings: FelixSettings,
  options: ProviderConfigWriteOptions = {},
): Promise<void> {
  await fs.mkdir(agentDir, { recursive: true });

  const auth: Record<string, PiApiKeyCredential> = {};
  const providers: Partial<Record<ProviderId, PiProviderConfig>> = {};
  const opencodeCredentials: Record<string, string> = {};
  const activeModel = storedActiveModel(settings);

  for (const provider of settings.providers) {
    const meta = PROVIDER_CATALOG_BY_ID[provider.id];
    const apiKey = provider.apiKey.trim();
    if (apiKey.length === 0) continue;
    if (meta.auth.type !== "api_key") continue;

    if (meta.auth.externalAuthKey) {
      opencodeCredentials[meta.auth.externalAuthKey] = apiKey;
    }

    if (meta.piConfig !== "generated") continue;

    const envVar = meta.auth.envVars[0];
    if (!envVar) {
      throw new Error(`${meta.label} is missing an API key environment variable.`);
    }

    auth[provider.id] = { type: "api_key", key: apiKey };
    providers[provider.id] = {
      name: meta.label,
      baseUrl: meta.baseUrl,
      api: meta.api,
      apiKey: `$${envVar}`,
      authHeader: true,
      models: modelsForPiConfig(settings, provider.id, activeModel),
      modelOverrides: modelOverridesForPiConfig(settings, provider.id, activeModel),
    };
  }

  await fs.writeFile(
    path.join(agentDir, "auth.json"),
    JSON.stringify(auth, null, 2),
    { encoding: "utf8", mode: 0o600 },
  );
  await fs.writeFile(
    path.join(agentDir, "models.json"),
    JSON.stringify({ providers }, null, 2),
    "utf8",
  );

  await writeOpenCodeAuth(opencodeCredentials, options);
  await writeOpenCodeRegistry(settings, opencodeCredentials, options);
}

function storedActiveModel(settings: FelixSettings): ProviderModel | null {
  if (!settings.activeModelInputModalities) return null;
  return {
    id: settings.activeModel,
    name: settings.activeModel,
    inputModalities: settings.activeModelInputModalities,
  };
}

export function providerEnv(settings: FelixSettings): Record<string, string> {
  const env: Record<string, string> = {};
  for (const provider of settings.providers) {
    const meta = PROVIDER_CATALOG_BY_ID[provider.id];
    const apiKey = provider.apiKey.trim();
    if (apiKey.length === 0) continue;
    if (meta.auth.type !== "api_key") continue;
    for (const envVar of meta.auth.envVars) {
      env[envVar] = apiKey;
    }
  }
  return env;
}

async function writeOpenCodeAuth(
  credentials: Record<string, string>,
  options: ProviderConfigWriteOptions,
): Promise<void> {
  const entries = Object.entries(credentials);
  if (entries.length === 0) return;

  const [openCodeAuth, piAuth] = await Promise.all([
    readJsonObject(openCodeAuthFile(options), "Auth file"),
    readJsonObject(piHomeAuthFile(options), "Auth file"),
  ]);

  for (const [authKey, apiKey] of entries) {
    openCodeAuth[authKey] = { type: "api", key: apiKey } satisfies OpenCodeCliCredential;
    piAuth[authKey] = { type: "api_key", key: apiKey } satisfies PiApiKeyCredential;
  }

  await Promise.all([
    writePrivateJsonFile(openCodeAuthFile(options), openCodeAuth),
    writePrivateJsonFile(piHomeAuthFile(options), piAuth),
  ]);
}

async function writeOpenCodeRegistry(
  settings: FelixSettings,
  credentials: Record<string, string>,
  options: ProviderConfigWriteOptions,
): Promise<void> {
  const authKeys = Object.keys(credentials);
  if (authKeys.length === 0) return;

  const registry = await readJsonObject(openCodeRegistryFile(options), "OpenCode model registry");

  for (const authKey of authKeys) {
    const providerId = OPENCODE_PROVIDER_BY_AUTH_KEY[authKey];
    if (!providerId) continue;

    const existingProvider: JsonRecord = isRecord(registry[authKey]) ? registry[authKey] : {};
    const existingModels = isRecord(existingProvider.models) ? existingProvider.models : {};

    registry[authKey] = {
      ...existingProvider,
      models: mergeRegistryModels(existingModels, modelsForRegistry(settings, providerId)),
    };
  }

  await writePrivateJsonFile(openCodeRegistryFile(options), registry);
}

function openCodeAuthFile(options: ProviderConfigWriteOptions): string {
  return path.join(homeDir(options), ".local", "share", "opencode", "auth.json");
}

function piHomeAuthFile(options: ProviderConfigWriteOptions): string {
  return path.join(homeDir(options), ".pi", "agent", "auth.json");
}

function openCodeRegistryFile(options: ProviderConfigWriteOptions): string {
  return path.join(homeDir(options), ".cache", "opencode", "models.json");
}

function homeDir(options: ProviderConfigWriteOptions): string {
  return options.homeDir ?? os.homedir();
}

function modelsForPiConfig(
  settings: FelixSettings,
  providerId: ProviderId,
  activeModel: ProviderModel | null,
): PiProviderModelConfig[] {
  const model = activePiModelForSettings(settings, providerId, activeModel);
  return model ? [toPiProviderModelConfig(model)] : [];
}

function modelOverridesForPiConfig(
  settings: FelixSettings,
  providerId: ProviderId,
  activeModel: ProviderModel | null,
): Record<string, PiProviderModelOverride> | undefined {
  if (settings.activeProvider !== providerId || !activeModel?.inputModalities) return undefined;
  return { [activeModel.id]: { input: activeModel.inputModalities } };
}

function toPiProviderModelConfig(model: ProviderModel): PiProviderModelConfig {
  return {
    id: model.id,
    name: model.name,
    input: model.inputModalities ?? ["text"],
    cost: DEFAULT_MODEL_COST,
    contextWindow: DEFAULT_MODEL_LIMIT.contextWindow,
    maxTokens: DEFAULT_MODEL_LIMIT.maxTokens,
    reasoning: isReasoningModel(model.id),
  };
}

function modelsForRegistry(settings: FelixSettings, providerId: ProviderId): JsonRecord {
  const provider = PROVIDER_CATALOG_BY_ID[providerId];
  const supportsPiThinking = provider.modelSource !== "opencode-registry";
  const models = providerModelsForSettings(settings, providerId, null);

  return Object.fromEntries(
    models.map((model) => [
      model.id,
      {
        name: model.name,
        family: inferOpenCodeFamily(model.id),
        limit: { context: 204_800, output: 131_072 },
        modalities: { input: model.inputModalities ?? ["text"] },
        cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
        reasoning: supportsPiThinking && isReasoningModel(model.id),
      },
    ]),
  );
}

function mergeRegistryModels(existingModels: JsonRecord, generatedModels: JsonRecord): JsonRecord {
  const merged: JsonRecord = { ...existingModels };
  for (const [modelId, generatedModel] of Object.entries(generatedModels)) {
    const existingModel = existingModels[modelId];
    merged[modelId] =
      isRecord(existingModel) && isRecord(generatedModel)
        ? mergeRegistryModel(existingModel, generatedModel)
        : generatedModel;
  }
  return merged;
}

function mergeRegistryModel(existingModel: JsonRecord, generatedModel: JsonRecord): JsonRecord {
  return {
    ...generatedModel,
    ...existingModel,
    modalities: mergeRegistryModalities(
      isRecord(existingModel.modalities) ? existingModel.modalities : null,
      isRecord(generatedModel.modalities) ? generatedModel.modalities : null,
    ),
  };
}

function mergeRegistryModalities(
  existingModalities: JsonRecord | null,
  generatedModalities: JsonRecord | null,
): JsonRecord | undefined {
  if (!existingModalities) return generatedModalities ?? undefined;
  if (!generatedModalities) return existingModalities;
  return {
    ...generatedModalities,
    ...existingModalities,
    input: unionStringArrays(generatedModalities.input, existingModalities.input),
  };
}

function unionStringArrays(left: unknown, right: unknown): string[] | unknown {
  if (!Array.isArray(left) && !Array.isArray(right)) return right ?? left;
  const values = new Set<string>();
  const candidates = [
    ...(Array.isArray(left) ? left : []),
    ...(Array.isArray(right) ? right : []),
  ];
  for (const value of candidates) {
    if (typeof value === "string") values.add(value);
  }
  return values.size > 0 ? [...values] : right ?? left;
}

function activePiModelForSettings(
  settings: FelixSettings,
  providerId: ProviderId,
  activeModel: ProviderModel | null,
): ProviderModel | null {
  if (settings.activeProvider !== providerId || settings.activeModel.trim().length === 0) {
    return null;
  }
  const provider = PROVIDER_CATALOG_BY_ID[providerId];
  const activeId = settings.activeModel;
  if (provider.fallbackModels.some((model) => model.id === activeId)) return null;

  const active = activeModel?.id === activeId ? activeModel : storedActiveModel(settings);
  if (active?.inputModalities) return active;
  return { id: activeId, name: activeId };
}

function providerModelsForSettings(
  settings: FelixSettings,
  providerId: ProviderId,
  activeModel: ProviderModel | null,
): ProviderModel[] {
  const provider = PROVIDER_CATALOG_BY_ID[providerId];
  const models = provider.fallbackModels.map((model) => ({ ...model }));
  if (settings.activeProvider !== providerId || settings.activeModel.trim().length === 0) {
    return models;
  }

  const active =
    activeModel?.id === settings.activeModel
      ? activeModel
      : {
          id: settings.activeModel,
          name: settings.activeModel,
          inputModalities: settings.activeModelInputModalities ?? undefined,
        };
  const existingIndex = models.findIndex((model) => model.id === active.id);
  if (existingIndex === -1) {
    models.push(active);
  } else {
    models[existingIndex] = { ...models[existingIndex], ...active };
  }
  return models;
}

function inferOpenCodeFamily(modelId: string): string {
  const lowerId = modelId.toLowerCase();
  if (lowerId.includes("deepseek")) return "deepseek";
  if (lowerId.includes("kimi")) return "kimi";
  if (lowerId.includes("claude")) return "claude";
  if (lowerId.includes("gpt")) return "openai";
  if (lowerId.includes("qwen")) return "qwen";
  if (lowerId.includes("glm")) return "zai";
  return "";
}

function isReasoningModel(modelId: string): boolean {
  const lowerId = modelId.toLowerCase();
  return lowerId.includes("thinking") || lowerId.includes("reasoning");
}

async function readJsonObject(filePath: string, label: string): Promise<JsonRecord> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return {};
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Throw a path-aware error below.
  }

  throw new Error(`${label} is malformed: ${filePath}`);
}

async function writePrivateJsonFile(filePath: string, payload: JsonRecord): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
