import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  PROVIDER_CATALOG_BY_ID,
  ProviderModelsRequest,
  type ProviderInputModality,
  type ProviderId,
  type ProviderCatalogEntry,
  type ProviderModel,
  type ProviderModelsResponse,
} from "@felix/contracts";

const MODEL_LIST_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

interface ProviderModelListOptions {
  homeDir?: string;
}

const OPENCODE_REGISTRY_PROVIDER_BY_ID: Partial<Record<ProviderId, string>> = {
  "oc-sdk-go": "opencode-go",
  "oc-sdk-zen": "opencode",
};
const OPENCODE_REGISTRY_PROVIDER_IDS = new Set(Object.values(OPENCODE_REGISTRY_PROVIDER_BY_ID));

const NVIDIA_SKIP_MODEL_IDS = new Set([
  "baai/bge-m3",
  "nvidia/embed-qa-4",
  "nvidia/nv-embed-v1",
  "nvidia/nv-embedcode-7b-v1",
  "nvidia/nv-embedqa-e5-v5",
  "nvidia/nv-embedqa-mistral-7b-v2",
  "nvidia/nvclip",
  "nvidia/streampetr",
  "nvidia/vila",
  "nvidia/neva-22b",
  "nvidia/nemoretriever-parse",
  "nvidia/nemotron-parse",
  "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1",
  "nvidia/llama-3.2-nemoretriever-300m-embed-v1",
  "nvidia/llama-3.2-nemoretriever-300m-embed-v2",
  "nvidia/llama-3.2-nv-embedqa-1b-v1",
  "nvidia/llama-3.2-nv-embedqa-1b-v2",
  "nvidia/llama-nemotron-embed-vl-1b-v2",
  "nvidia/llama-3.1-nemotron-70b-reward",
  "nvidia/nemotron-4-340b-reward",
  "nvidia/nemotron-content-safety-reasoning-4b",
  "nvidia/llama-3.1-nemoguard-8b-content-safety",
  "nvidia/llama-3.1-nemoguard-8b-topic-control",
  "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
  "meta/llama-guard-4-12b",
  "nvidia/riva-translate-4b-instruct",
  "nvidia/riva-translate-4b-instruct-v1.1",
  "google/deplot",
  "google/paligemma",
  "google/recurrentgemma-2b",
  "google/shieldgemma-9b",
  "microsoft/kosmos-2",
  "adept/fuyu-8b",
  "bigcode/starcoder2-15b",
  "bigcode/starcoder2-7b",
  "snowflake/arctic-embed-l",
  "mistralai/mamba-codestral-7b-v0.1",
  "mistralai/mathstral-7b-v0.1",
  "mistralai/mixtral-8x22b-v0.1",
  "nvidia/mistral-nemo-minitron-8b-base",
  "google/gemma-2b",
  "google/gemma-7b",
  "google/codegemma-7b",
  "meta/llama2-70b",
]);

const NON_CHAT_ID_PARTS = [
  "embed",
  "embedding",
  "reward",
  "safety",
  "guard",
  "translate",
  "parse",
  "rerank",
  "clip",
];

export async function listProviderModels(
  request: ProviderModelsRequest,
  options: ProviderModelListOptions = {},
): Promise<ProviderModelsResponse> {
  const parsedRequest = ProviderModelsRequest.parse(request);
  const provider = PROVIDER_CATALOG_BY_ID[parsedRequest.providerId];
  const credential = credentialFor(provider, parsedRequest);

  if (!credential) {
    return {
      providerId: provider.id,
      models: [],
      source: "none",
      error: `${provider.label} needs ${provider.auth.label} before models can be loaded.`,
    };
  }

  if (provider.modelSource === "opencode-registry") {
    try {
      const localModels = await readOpenCodeRegistryModels(provider.id, options);
      if (localModels.length > 0) {
        return { providerId: provider.id, models: localModels, source: "local", error: null };
      }
    } catch {
      // Fall through to the live provider endpoint and normal recovery path.
    }
  }

  try {
    const models = await fetchProviderModels(provider.id, credential);
    if (models.length > 0) {
      return { providerId: provider.id, models, source: "provider", error: null };
    }

    return modelRecoveryResponse(
      provider,
      "The provider returned no usable chat models.",
      options,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ProviderAuthError) {
      return { providerId: provider.id, models: [], source: "none", error: message };
    }
    return modelRecoveryResponse(provider, message, options);
  }
}

async function fetchProviderModels(
  providerId: ProviderId,
  credential: string,
): Promise<ProviderModel[]> {
  const provider = PROVIDER_CATALOG_BY_ID[providerId];
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${credential}`,
  };

  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models`, {
    headers,
    signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
  });

  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError(`${provider.label} authorization failed. Re-authorize and try again.`);
  }

  if (!response.ok) {
    throw new Error(`Provider model list failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const data = readArrayProperty(payload, "data");
  if (!data) throw new Error("Provider model list response was not in the expected format.");

  return dedupeModels(
    data
      .map((entry) => normalizeModel(providerId, entry))
      .filter((model): model is ProviderModel => model !== null),
  );
}

async function modelRecoveryResponse(
  provider: ProviderCatalogEntry,
  error: string,
  options: ProviderModelListOptions = {},
): Promise<ProviderModelsResponse> {
  let recoveryError = error;

  if (provider.modelSource === "opencode-registry") {
    try {
      const localModels = await readOpenCodeRegistryModels(provider.id, options);
      if (localModels.length > 0) {
        return { providerId: provider.id, models: localModels, source: "local", error };
      }
    } catch (registryError) {
      const registryMessage =
        registryError instanceof Error ? registryError.message : String(registryError);
      recoveryError = `${error} ${registryMessage}`;
    }
  }

  const fallbackModels = fallbackFor(provider.id);
  return {
    providerId: provider.id,
    models: fallbackModels,
    source: fallbackModels.length > 0 ? "fallback" : "none",
    error: recoveryError,
  };
}

function credentialFor(
  provider: ProviderCatalogEntry,
  request: ProviderModelsRequest,
): string | null {
  if (provider.auth.type === "api_key") {
    const apiKey = request.apiKey?.trim() ?? "";
    return apiKey.length > 0 ? apiKey : null;
  }

  const accessToken = request.oauthAccessToken?.trim() ?? "";
  return accessToken.length > 0 ? accessToken : null;
}

async function readOpenCodeRegistryModels(
  providerId: ProviderId,
  options: ProviderModelListOptions,
): Promise<ProviderModel[]> {
  const registryProviderId = OPENCODE_REGISTRY_PROVIDER_BY_ID[providerId];
  if (!registryProviderId) return [];

  const registryPath = await firstExistingFile(openCodeRegistryPaths(options));
  if (!registryPath) return [];

  const raw = await fs.readFile(registryPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error(`OpenCode model registry is malformed: ${registryPath}`);

  const registryProvider = readRecordProperty(parsed, registryProviderId);
  const modelMap = registryProvider ? readRecordProperty(registryProvider, "models") : null;
  if (!modelMap) return [];
  const registryInputs = registryInputModalitiesByModelId(parsed, registryProviderId);

  return dedupeModels(
    Object.entries(modelMap)
      .map(([modelId, entry]) =>
        normalizeOpenCodeRegistryModel(modelId, entry, registryInputs[modelId]),
      )
      .filter((model): model is ProviderModel => model !== null),
  );
}

function openCodeRegistryPaths(options: ProviderModelListOptions): string[] {
  const homeDir = options.homeDir ?? os.homedir();
  return [
    path.join(homeDir, ".cache", "opencode", "models.json"),
    path.join(homeDir, ".config", "opencode", "models.json"),
  ];
}

function registryInputModalitiesByModelId(
  registry: JsonRecord,
  providerId: string,
): Partial<Record<string, ProviderInputModality[]>> {
  const inputsByModelId: Partial<Record<string, ProviderInputModality[]>> = {};
  for (const [candidateProviderId, candidateProvider] of Object.entries(registry)) {
    if (
      candidateProviderId === providerId ||
      !OPENCODE_REGISTRY_PROVIDER_IDS.has(candidateProviderId) ||
      !isRecord(candidateProvider)
    ) {
      continue;
    }
    const candidateModels = readRecordProperty(candidateProvider, "models");
    if (!candidateModels) continue;

    for (const [modelId, candidateModel] of Object.entries(candidateModels)) {
      if (!isRecord(candidateModel)) continue;
      const inputModalities = readModalitiesInput(candidateModel);
      if (!inputModalities) continue;
      const mergedInputModalities = mergeInputModalities(inputsByModelId[modelId], inputModalities);
      if (mergedInputModalities) inputsByModelId[modelId] = mergedInputModalities;
    }
  }
  return inputsByModelId;
}

function normalizeOpenCodeRegistryModel(
  modelId: string,
  entry: unknown,
  registryInputModalities: ProviderInputModality[] | undefined,
): ProviderModel | null {
  if (!isRecord(entry)) return null;
  const inputModalities = mergeInputModalities(readModalitiesInput(entry), registryInputModalities);
  return withOptionalInputModalities({
    id: modelId,
    name: readStringProperty(entry, "name") ?? makeDisplayName(modelId),
  }, inputModalities);
}

function mergeInputModalities(
  left: ProviderInputModality[] | null | undefined,
  right: ProviderInputModality[] | null | undefined,
): ProviderInputModality[] | null {
  const modalities: ProviderInputModality[] = [];
  for (const values of [left, right]) {
    for (const value of values ?? []) {
      if (!modalities.includes(value)) modalities.push(value);
    }
  }
  return modalities.length > 0 ? modalities : null;
}

async function firstExistingFile(paths: readonly string[]): Promise<string | null> {
  for (const filePath of paths) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  return null;
}

function normalizeModel(providerId: ProviderId, entry: unknown): ProviderModel | null {
  if (!isRecord(entry)) return null;
  const id = readStringProperty(entry, "id");
  if (!id || !isChatModel(providerId, id, entry)) return null;
  const inputModalities = readModelInputModalities(entry);
  return withOptionalInputModalities({
    id,
    name: readStringProperty(entry, "name") ?? makeDisplayName(id),
  }, inputModalities);
}

function isChatModel(providerId: ProviderId, id: string, entry: Record<string, unknown>): boolean {
  if (providerId === "nvidia-nim") {
    const normalizedId = id.toLowerCase();
    return (
      !NVIDIA_SKIP_MODEL_IDS.has(id) &&
      !NON_CHAT_ID_PARTS.some((part) => normalizedId.includes(part))
    );
  }

  if (providerId === "openrouter") {
    const architecture = readRecordProperty(entry, "architecture");
    const outputModalities = architecture
      ? readStringArrayProperty(architecture, "output_modalities")
      : null;
    return !outputModalities || outputModalities.includes("text");
  }

  return true;
}

function fallbackFor(providerId: ProviderId): ProviderModel[] {
  return [...PROVIDER_CATALOG_BY_ID[providerId].fallbackModels];
}

function dedupeModels(models: ProviderModel[]): ProviderModel[] {
  const seen = new Set<string>();
  const deduped: ProviderModel[] = [];
  for (const model of models) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    deduped.push(model);
  }
  return deduped;
}

function withOptionalInputModalities(
  model: Pick<ProviderModel, "id" | "name">,
  inputModalities: ProviderInputModality[] | null,
): ProviderModel {
  if (!inputModalities) return model;
  return { ...model, inputModalities };
}

function readModelInputModalities(entry: Record<string, unknown>): ProviderInputModality[] | null {
  const architecture = readRecordProperty(entry, "architecture");
  return (
    normalizeInputModalities(architecture ? readStringArrayProperty(architecture, "input_modalities") : null) ??
    normalizeInputModalities(readStringArrayProperty(entry, "input_modalities")) ??
    readModalitiesInput(entry)
  );
}

function readModalitiesInput(entry: Record<string, unknown>): ProviderInputModality[] | null {
  const modalities = readRecordProperty(entry, "modalities");
  return modalities ? normalizeInputModalities(readStringArrayProperty(modalities, "input")) : null;
}

function normalizeInputModalities(values: string[] | null): ProviderInputModality[] | null {
  if (!values) return null;
  const modalities: ProviderInputModality[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase();
    if ((normalized === "text" || normalized === "image") && !modalities.includes(normalized)) {
      modalities.push(normalized);
    }
  }
  return modalities.length > 0 ? modalities : null;
}

function makeDisplayName(modelId: string): string {
  const lastPart = modelId.split("/").at(-1) ?? modelId;
  return lastPart
    .replace(/[-_]/g, " ")
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordProperty(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function readStringProperty(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readArrayProperty(source: unknown, key: string): unknown[] | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  return Array.isArray(value) ? value : null;
}

function readStringArrayProperty(
  source: Record<string, unknown>,
  key: string,
): string[] | null {
  const value = source[key];
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : null;
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

class ProviderAuthError extends Error {}
