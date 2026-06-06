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
});
