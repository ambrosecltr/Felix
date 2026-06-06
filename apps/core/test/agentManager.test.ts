import { describe, expect, test } from "bun:test";
import { buildPromptCommand } from "../src/agentManager.ts";

describe("agent prompt commands", () => {
  test("omits images when none are prepared", () => {
    expect(buildPromptCommand("hello")).toEqual({ type: "prompt", message: "hello" });
  });

  test("includes prepared images in PI prompt commands", () => {
    expect(
      buildPromptCommand("look", [{ type: "image", data: "encoded", mimeType: "image/png" }]),
    ).toEqual({
      type: "prompt",
      message: "look",
      images: [{ type: "image", data: "encoded", mimeType: "image/png" }],
    });
  });

  test("preserves steering behavior with images while streaming", () => {
    expect(
      buildPromptCommand(
        "change this",
        [{ type: "image", data: "encoded", mimeType: "image/png" }],
        true,
      ),
    ).toEqual({
      type: "prompt",
      message: "change this",
      images: [{ type: "image", data: "encoded", mimeType: "image/png" }],
      streamingBehavior: "steer",
    });
  });
});
