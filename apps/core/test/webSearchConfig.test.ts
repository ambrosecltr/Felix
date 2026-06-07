import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_SETTINGS, type FelixSettings } from "@felix/contracts";
import {
  isWebSearchExtensionPath,
  normalizeWebSearchSettings,
  webSearchEnv,
  writeWebSearchConfig,
} from "../src/webSearchConfig.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("web search config", () => {
  test("writes rpiv-web-tools config and removes stale Felix-managed keys", async () => {
    const homeDir = await useTempHome();
    const configFile = path.join(homeDir, ".config", "rpiv-web-tools", "config.json");
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(
      configFile,
      JSON.stringify({
        otherField: "keep",
        apiKeys: {
          brave: "old-brave",
          external: "keep-external",
        },
        baseUrls: {
          ollama: "http://old-host",
          external: "http://keep.example",
        },
      }),
      "utf8",
    );

    const settings: FelixSettings = {
      ...DEFAULT_SETTINGS,
      webSearch: {
        enabled: true,
        provider: "searxng",
        apiKeys: { searxng: " searx-key " },
        baseUrls: { searxng: " http://localhost:8888 " },
      },
    };

    await writeWebSearchConfig(settings, { homeDir });

    const parsed = JSON.parse(await fs.readFile(configFile, "utf8")) as {
      provider?: string;
      otherField?: string;
      apiKeys?: Record<string, string>;
      baseUrls?: Record<string, string>;
    };
    expect(parsed.provider).toBe("searxng");
    expect(parsed.otherField).toBe("keep");
    expect(parsed.apiKeys).toEqual({
      external: "keep-external",
      searxng: "searx-key",
    });
    expect(parsed.baseUrls).toEqual({
      external: "http://keep.example",
      searxng: "http://localhost:8888",
    });
  });

  test("maps enabled web search settings to provider env vars", () => {
    const settings: FelixSettings = {
      ...DEFAULT_SETTINGS,
      webSearch: {
        enabled: true,
        provider: "ollama",
        apiKeys: { brave: "brave-key", ollama: "ollama-key" },
        baseUrls: { ollama: "http://localhost:11435" },
      },
    };

    expect(webSearchEnv(settings)).toEqual({
      BRAVE_SEARCH_API_KEY: "brave-key",
      OLLAMA_API_KEY: "ollama-key",
      OLLAMA_HOST: "http://localhost:11435",
    });
  });

  test("normalizes defaults and detects the bundled extension path", () => {
    expect(
      normalizeWebSearchSettings({
        enabled: true,
        provider: "ollama",
        apiKeys: {},
        baseUrls: {},
      }),
    ).toEqual({
      enabled: true,
      provider: "ollama",
      apiKeys: {},
      baseUrls: { ollama: "http://localhost:11434" },
    });
    expect(
      isWebSearchExtensionPath(
        "/Applications/Felix.app/Contents/Resources/agent/node_modules/@juicesharp/rpiv-web-tools",
      ),
    ).toBe(true);
  });
});

async function useTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-home-"));
  tempDirs.push(dir);
  return dir;
}
