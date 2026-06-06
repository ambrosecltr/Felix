import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PROVIDER_CATALOG_BY_ID, type FelixSettings, type ProviderId } from "@felix/contracts";

interface PiProviderConfig {
  name: string;
  baseUrl: string;
  api: string;
  apiKey: string;
  authHeader: true;
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

const OPENCODE_AUTH_FILE = path.join(os.homedir(), ".local", "share", "opencode", "auth.json");
const PI_HOME_AUTH_FILE = path.join(os.homedir(), ".pi", "agent", "auth.json");
const OPENCODE_REGISTRY_FILE = path.join(os.homedir(), ".cache", "opencode", "models.json");
const OPENCODE_PROVIDER_BY_AUTH_KEY: Record<string, ProviderId> = {
  "opencode-go": "oc-sdk-go",
  opencode: "oc-sdk-zen",
};

/**
 * Writes PI's auth.json and models.json into the Felix agent dir so spawned
 * `pi` processes can authenticate with the keys configured in Felix settings.
 */
export async function writeProviderConfig(
  agentDir: string,
  settings: FelixSettings,
): Promise<void> {
  await fs.mkdir(agentDir, { recursive: true });

  const auth: Record<string, PiApiKeyCredential> = {};
  const providers: Partial<Record<ProviderId, PiProviderConfig>> = {};
  const opencodeCredentials: Record<string, string> = {};

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

  await writeOpenCodeAuth(opencodeCredentials);
  await writeOpenCodeRegistry(settings, opencodeCredentials);
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

async function writeOpenCodeAuth(credentials: Record<string, string>): Promise<void> {
  const entries = Object.entries(credentials);
  if (entries.length === 0) return;

  const [openCodeAuth, piAuth] = await Promise.all([
    readJsonObject(OPENCODE_AUTH_FILE, "Auth file"),
    readJsonObject(PI_HOME_AUTH_FILE, "Auth file"),
  ]);

  for (const [authKey, apiKey] of entries) {
    openCodeAuth[authKey] = { type: "api", key: apiKey } satisfies OpenCodeCliCredential;
    piAuth[authKey] = { type: "api_key", key: apiKey } satisfies PiApiKeyCredential;
  }

  await Promise.all([
    writePrivateJsonFile(OPENCODE_AUTH_FILE, openCodeAuth),
    writePrivateJsonFile(PI_HOME_AUTH_FILE, piAuth),
  ]);
}

async function writeOpenCodeRegistry(
  settings: FelixSettings,
  credentials: Record<string, string>,
): Promise<void> {
  const authKeys = Object.keys(credentials);
  if (authKeys.length === 0) return;

  const registry = await readJsonObject(OPENCODE_REGISTRY_FILE, "OpenCode model registry");

  for (const authKey of authKeys) {
    const providerId = OPENCODE_PROVIDER_BY_AUTH_KEY[authKey];
    if (!providerId) continue;

    const existingProvider: JsonRecord = isRecord(registry[authKey]) ? registry[authKey] : {};
    const existingModels = isRecord(existingProvider.models) ? existingProvider.models : {};

    registry[authKey] = {
      ...existingProvider,
      models: {
        ...existingModels,
        ...modelsForRegistry(settings, providerId),
      },
    };
  }

  await writePrivateJsonFile(OPENCODE_REGISTRY_FILE, registry);
}

function modelsForRegistry(settings: FelixSettings, providerId: ProviderId): JsonRecord {
  const provider = PROVIDER_CATALOG_BY_ID[providerId];
  const supportsPiThinking = provider.modelSource !== "opencode-registry";
  const models = provider.fallbackModels.map((model) => model);
  if (
    settings.activeProvider === providerId &&
    settings.activeModel.trim().length > 0 &&
    !models.some((model) => model.id === settings.activeModel)
  ) {
    models.push({ id: settings.activeModel, name: settings.activeModel });
  }

  return Object.fromEntries(
    models.map((model) => [
      model.id,
      {
        name: model.name,
        family: inferOpenCodeFamily(model.id),
        limit: { context: 204_800, output: 131_072 },
        modalities: { input: ["text"] },
        cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
        reasoning: supportsPiThinking && isReasoningModel(model.id),
      },
    ]),
  );
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
