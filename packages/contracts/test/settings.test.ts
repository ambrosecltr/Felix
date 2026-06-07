import { describe, expect, test } from "bun:test";
import { FelixSettings } from "../src/settings.ts";

describe("settings contract", () => {
  test("migrates existing settings without web search or lockdown config", () => {
    const parsed = FelixSettings.parse({
      activeProvider: "openrouter",
      activeModel: "anthropic/claude-3.5-sonnet",
      activeModelInputModalities: null,
      providers: [],
      iconGeneration: {
        enabled: false,
        xaiApiKey: "",
      },
      sandboxAllowNetwork: true,
      dataDir: null,
    });

    expect(parsed.webSearch).toEqual({
      enabled: false,
      provider: "brave",
      apiKeys: {},
      baseUrls: {},
    });
    expect(parsed.lockdown).toEqual({
      enabled: false,
      pinHash: "",
      pinSalt: "",
    });
  });

  test("rejects unknown web search providers", () => {
    expect(() =>
      FelixSettings.parse({
        webSearch: {
          enabled: true,
          provider: "unknown",
          apiKeys: {},
          baseUrls: {},
        },
      }),
    ).toThrow();
  });
});
