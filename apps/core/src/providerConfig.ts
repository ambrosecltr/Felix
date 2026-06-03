import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FelixSettings, ProviderId } from "@felix/contracts";

interface ProviderMeta {
  baseUrl: string;
  api: string;
  envVar: string;
}

const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    api: "openai-completions",
    envVar: "OPENROUTER_API_KEY",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    api: "openai-completions",
    envVar: "DEEPSEEK_API_KEY",
  },
};

/**
 * Writes PI's auth.json and models.json into the Felix agent dir so the
 * spawned `pi` processes can authenticate against OpenRouter / DeepSeek
 * using the keys the parent configured in Felix settings.
 */
export async function writeProviderConfig(
  agentDir: string,
  settings: FelixSettings,
): Promise<void> {
  await fs.mkdir(agentDir, { recursive: true });

  const auth: Record<string, { type: "api"; key: string }> = {};
  const models: Array<Record<string, unknown>> = [];

  for (const provider of settings.providers) {
    const meta = PROVIDERS[provider.id];
    if (!meta || provider.apiKey.trim().length === 0) continue;
    auth[provider.id] = { type: "api", key: provider.apiKey };
    models.push({
      provider: provider.id,
      baseUrl: meta.baseUrl,
      api: meta.api,
      apiKeyEnv: meta.envVar,
    });
  }

  await fs.writeFile(
    path.join(agentDir, "auth.json"),
    JSON.stringify(auth, null, 2),
    { encoding: "utf8", mode: 0o600 },
  );
  await fs.writeFile(
    path.join(agentDir, "models.json"),
    JSON.stringify({ providers: models }, null, 2),
    "utf8",
  );
}

export function providerEnv(settings: FelixSettings): Record<string, string> {
  const env: Record<string, string> = {};
  for (const provider of settings.providers) {
    const meta = PROVIDERS[provider.id];
    if (!meta || provider.apiKey.trim().length === 0) continue;
    env[meta.envVar] = provider.apiKey;
  }
  return env;
}
