import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { FelixSettings } from "@felix/contracts";
import { DEFAULT_SETTINGS } from "@felix/contracts";
import { writeProviderConfig } from "../src/providerConfig.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("provider config", () => {
  test("overrides catalog model image input without replacing the model", async () => {
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-agent-"));
    tempDirs.push(agentDir);
    const settings: FelixSettings = {
      ...DEFAULT_SETTINGS,
      activeProvider: "openrouter",
      activeModel: DEFAULT_SETTINGS.activeModel,
      activeModelInputModalities: ["text", "image"],
      providers: [{ id: "openrouter", apiKey: "sk-or-test" }],
    };

    await writeProviderConfig(agentDir, settings);

    const raw = await fs.readFile(path.join(agentDir, "models.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      providers: {
        openrouter: {
          models: Array<{ id: string; input: string[] }>;
          modelOverrides?: Record<string, { input: string[] }>;
        };
      };
    };

    expect(parsed.providers.openrouter.models).toEqual([]);
    expect(parsed.providers.openrouter.modelOverrides?.[DEFAULT_SETTINGS.activeModel]?.input).toEqual([
      "text",
      "image",
    ]);
  });

  test("writes active model image input support into PI models config", async () => {
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-agent-"));
    tempDirs.push(agentDir);
    const settings: FelixSettings = {
      ...DEFAULT_SETTINGS,
      activeProvider: "openrouter",
      activeModel: "custom/vision",
      activeModelInputModalities: ["text", "image"],
      providers: [{ id: "openrouter", apiKey: "sk-or-test" }],
    };

    await writeProviderConfig(agentDir, settings);

    const raw = await fs.readFile(path.join(agentDir, "models.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      providers: { openrouter: { models: Array<{ id: string; input: string[] }> } };
    };
    const activeModel = parsed.providers.openrouter.models.find(
      (model) => model.id === "custom/vision",
    );

    expect(activeModel?.input).toEqual(["text", "image"]);
  });

  test("defaults unknown model input support to text only", async () => {
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-agent-"));
    tempDirs.push(agentDir);
    const settings: FelixSettings = {
      ...DEFAULT_SETTINGS,
      activeProvider: "openrouter",
      activeModel: "custom/unknown",
      activeModelInputModalities: null,
      providers: [{ id: "openrouter", apiKey: "sk-or-test" }],
    };

    await writeProviderConfig(agentDir, settings);

    const raw = await fs.readFile(path.join(agentDir, "models.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      providers: { openrouter: { models: Array<{ id: string; input: string[] }> } };
    };
    const activeModel = parsed.providers.openrouter.models.find(
      (model) => model.id === "custom/unknown",
    );

    expect(activeModel?.input).toEqual(["text"]);
  });

  test("preserves OpenCode registry model details without enabling Felix-managed reasoning", async () => {
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-agent-"));
    tempDirs.push(agentDir);
    const homeDir = await useTempHome();
    const registryFile = path.join(homeDir, ".cache", "opencode", "models.json");
    await fs.mkdir(path.dirname(registryFile), { recursive: true });
    await fs.writeFile(
      registryFile,
      JSON.stringify({
        "opencode-go": {
          models: {
            "kimi-k2.6": {
              name: "Kimi K2.6",
              family: "kimi",
              modalities: { input: ["text", "image", "video"], output: ["text"] },
              limit: { context: 262_144, output: 65_536 },
              cost: { input: 0.95, output: 4, cache_read: 0.16 },
              reasoning: true,
            },
          },
        },
      }),
      "utf8",
    );
    const settings: FelixSettings = {
      ...DEFAULT_SETTINGS,
      activeProvider: "oc-sdk-go",
      activeModel: "kimi-k2.6",
      activeModelInputModalities: null,
      providers: [{ id: "oc-sdk-go", apiKey: "sk-oc-test" }],
    };

    await writeProviderConfig(agentDir, settings, { homeDir });

    const parsed = JSON.parse(await fs.readFile(registryFile, "utf8")) as {
      "opencode-go": {
        models: Record<
          string,
          {
            modalities?: { input?: string[]; output?: string[] };
            limit?: { context?: number; output?: number };
            reasoning?: boolean;
          }
        >;
      };
    };
    const kimi = parsed["opencode-go"].models["kimi-k2.6"];
    expect(kimi?.modalities?.input).toEqual(["text", "image", "video"]);
    expect(kimi?.modalities?.output).toEqual(["text"]);
    expect(kimi?.limit?.context).toBe(262_144);
    expect(kimi?.reasoning).toBe(false);
  });
});

async function useTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-home-"));
  tempDirs.push(dir);
  return dir;
}
