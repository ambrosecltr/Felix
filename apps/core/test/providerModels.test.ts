import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { listProviderModels } from "../src/providerModels.ts";

const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
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

  test("loads OpenCode models from the local PI extension registry before the live endpoint", async () => {
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
              modalities: { input: ["text"], output: ["text"] },
            },
          },
        },
        opencode: {
          models: {
            "kimi-k2.6": {
              name: "Kimi K2.6",
              modalities: { input: ["text", "image", "video"], output: ["text"] },
            },
          },
        },
      }),
      "utf8",
    );
    globalThis.fetch = async () => {
      throw new Error("OpenCode registry should be used before the live endpoint");
    };

    const result = await listProviderModels(
      { providerId: "oc-sdk-go", apiKey: "sk-test" },
      { homeDir },
    );

    expect(result.source).toBe("local");
    expect(result.models).toEqual([
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        inputModalities: ["text", "image"],
      },
    ]);
  });
});

async function useTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-home-"));
  tempDirs.push(dir);
  return dir;
}
