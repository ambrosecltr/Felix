import { describe, expect, test } from "bun:test";
import { ProviderModel, ProviderModelsResponse } from "../src/providers.ts";

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
});
