import { describe, expect, test } from "bun:test";
import {
  PROVIDER_CATALOG_BY_ID,
  ProviderModel,
  ProviderModelsResponse,
  ProviderOAuthStatus,
} from "../src/providers.ts";

describe("provider model contracts", () => {
  test("accepts provider-reported image input modalities", () => {
    expect(
      ProviderModel.parse({
        id: "openai/gpt-5.4",
        name: "GPT-5.4",
        inputModalities: ["text", "image"],
      }),
    ).toEqual({
      id: "openai/gpt-5.4",
      name: "GPT-5.4",
      inputModalities: ["text", "image"],
    });
  });

  test("keeps input modalities optional for providers that do not report them", () => {
    expect(ProviderModel.parse({ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" })).toEqual({
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
    });
  });

  test("rejects unknown input modalities", () => {
    expect(() =>
      ProviderModel.parse({
        id: "audio-model",
        name: "Audio Model",
        inputModalities: ["text", "audio"],
      }),
    ).toThrow();
  });

  test("round-trips modalities in provider model responses", () => {
    expect(
      ProviderModelsResponse.parse({
        providerId: "openrouter",
        source: "provider",
        error: null,
        models: [{ id: "vision", name: "Vision", inputModalities: ["text", "image"] }],
      }).models[0]?.inputModalities,
    ).toEqual(["text", "image"]);
  });

  test("defines ChatGPT subscription as PI's built-in OAuth provider", () => {
    const provider = PROVIDER_CATALOG_BY_ID["openai-codex"];

    expect(provider.auth.type).toBe("oauth");
    expect(provider.piConfig).toBe("builtin");
    expect(provider.modelSource).toBe("pi-builtin");
    expect(provider.defaultModel).toBe("gpt-5.6-sol");
    expect(provider.fallbackModels.slice(0, 3).map((model) => model.id)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ]);
    expect(provider.fallbackModels[0]?.reasoningEfforts).toEqual([
      "off",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  test("does not expose OAuth credentials in provider status", () => {
    expect(
      ProviderOAuthStatus.parse({ providerId: "openai-codex", authorized: true }),
    ).toEqual({ providerId: "openai-codex", authorized: true });
  });
});
