import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  WEB_SEARCH_PROVIDER_CATALOG,
  WEB_SEARCH_PROVIDER_CATALOG_BY_ID,
  WEB_SEARCH_PROVIDER_IDS,
  type FelixSettings,
  type WebSearchProviderId,
} from "@felix/contracts";

type JsonRecord = Record<string, unknown>;

interface WebSearchConfigWriteOptions {
  homeDir?: string;
}

export async function writeWebSearchConfig(
  settings: FelixSettings,
  options: WebSearchConfigWriteOptions = {},
): Promise<void> {
  if (!settings.webSearch.enabled) return;

  const filePath = webSearchConfigFile(options);
  const existing = await readJsonObject(filePath);
  const existingApiKeys = isRecord(existing.apiKeys) ? existing.apiKeys : {};
  const existingBaseUrls = isRecord(existing.baseUrls) ? existing.baseUrls : {};

  const nextConfig: JsonRecord = {
    ...existing,
    provider: settings.webSearch.provider,
    apiKeys: mergeKnownProviderValues(existingApiKeys, settings.webSearch.apiKeys),
    baseUrls: mergeKnownProviderValues(existingBaseUrls, settings.webSearch.baseUrls),
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(nextConfig, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function webSearchEnv(settings: FelixSettings): Record<string, string> {
  if (!settings.webSearch.enabled) return {};

  const env: Record<string, string> = {};
  for (const provider of WEB_SEARCH_PROVIDER_CATALOG) {
    const apiKey = settings.webSearch.apiKeys[provider.id]?.trim();
    if (apiKey) env[provider.apiKeyEnvVar] = apiKey;

    const baseUrl = settings.webSearch.baseUrls[provider.id]?.trim();
    if (baseUrl && provider.baseUrlEnvVar) env[provider.baseUrlEnvVar] = baseUrl;
  }
  return env;
}

export function normalizeWebSearchSettings(
  settings: FelixSettings["webSearch"],
): FelixSettings["webSearch"] {
  const apiKeys = normalizeProviderValues(settings.apiKeys);
  const baseUrls = normalizeProviderValues(settings.baseUrls);
  const activeProvider = WEB_SEARCH_PROVIDER_CATALOG_BY_ID[settings.provider];

  if (activeProvider.defaultBaseUrl && !baseUrls[activeProvider.id]) {
    baseUrls[activeProvider.id] = activeProvider.defaultBaseUrl;
  }

  return {
    enabled: settings.enabled,
    provider: settings.provider,
    apiKeys,
    baseUrls,
  };
}

export function isWebSearchExtensionPath(extensionPath: string): boolean {
  return extensionPath.endsWith(path.join("@juicesharp", "rpiv-web-tools"));
}

function webSearchConfigFile(options: WebSearchConfigWriteOptions): string {
  return path.join(options.homeDir ?? os.homedir(), ".config", "rpiv-web-tools", "config.json");
}

function normalizeProviderValues(
  values: FelixSettings["webSearch"]["apiKeys"],
): Partial<Record<WebSearchProviderId, string>> {
  const normalized: Partial<Record<WebSearchProviderId, string>> = {};
  for (const id of WEB_SEARCH_PROVIDER_IDS) {
    const value = values[id]?.trim();
    if (value) normalized[id] = value;
  }
  return normalized;
}

function mergeKnownProviderValues(
  existing: JsonRecord,
  configured: FelixSettings["webSearch"]["apiKeys"],
): JsonRecord {
  const knownProviderIds = new Set<string>(WEB_SEARCH_PROVIDER_IDS);
  const merged: JsonRecord = {};

  for (const [key, value] of Object.entries(existing)) {
    if (!knownProviderIds.has(key)) merged[key] = value;
  }
  for (const [key, value] of Object.entries(normalizeProviderValues(configured))) {
    merged[key] = value;
  }
  return merged;
}

async function readJsonObject(filePath: string): Promise<JsonRecord> {
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
    return {};
  }
  return {};
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
