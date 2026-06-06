import { afterEach, describe, expect, test } from "bun:test";
import { listProviderModels } from "../src/providerModels.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("provider model loading", () => {
  test("preserves OpenRouter input modalities from provider metadata", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "vision-model",
              name: "Vision Model",
              architecture: {
                input_modalities: ["text", "image"],
                output_modalities: ["text"],
              },
            },
            {
              id: "audio-only",
              name: "Audio Only",
              architecture: {
                input_modalities: ["audio"],
                output_modalities: ["audio"],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const result = await listProviderModels({ providerId: "openrouter", apiKey: "sk-or-test" });

    expect(result.source).toBe("provider");
    expect(result.models).toEqual([
      {
        id: "vision-model",
        name: "Vision Model",
        inputModalities: ["text", "image"],
      },
    ]);
  });

  test("omits malformed or unrecognized input modality metadata", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "plain-model",
              architecture: {
                input_modalities: ["audio"],
                output_modalities: ["text"],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const result = await listProviderModels({ providerId: "openrouter", apiKey: "sk-or-test" });

    expect(result.models).toEqual([{ id: "plain-model", name: "Plain Model" }]);
  });
});
