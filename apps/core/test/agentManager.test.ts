import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, type AgentEvent } from "@felix/contracts";
import {
  AgentManager,
  buildAgentPath,
  buildPromptCommand,
  readAgentTokenUsageEvent,
} from "../src/agentManager.ts";

type TestableAgentManager = AgentManager & {
  handleLine(appId: string, line: string): void;
};

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

  test("reads token usage from PI assistant message events", () => {
    expect(
      readAgentTokenUsageEvent({
        type: "message",
        id: "message-1",
        timestamp: "2026-06-06T05:53:29.009Z",
        message: {
          role: "assistant",
          responseId: "response-1",
          usage: {
            input: 157,
            output: 141,
            cacheRead: 18147,
            cacheWrite: 0,
            totalTokens: 18445,
          },
        },
      }),
    ).toEqual({
      usageId: "message-1",
      createdAt: "2026-06-06T05:53:29.009Z",
      usage: {
        input: 157,
        output: 141,
        cacheRead: 18147,
        cacheWrite: 0,
        totalTokens: 18445,
      },
    });
  });

  test("falls back to response id and computed totals for token usage", () => {
    expect(
      readAgentTokenUsageEvent({
        type: "message",
        message: {
          role: "assistant",
          responseId: "response-2",
          usage: {
            prompt_tokens: "10",
            completion_tokens: 5,
            cached_tokens: 3,
          },
        },
      })?.usage,
    ).toEqual({
      input: 10,
      output: 5,
      cacheRead: 3,
      cacheWrite: 0,
      totalTokens: 18,
    });
  });

  test("builds a packaged-agent path with bundled runtimes and app binaries first", () => {
    expect(
      buildAgentPath({
        appDir: "/Users/alex/Library/Application Support/Felix/apps/snake",
        nodeBin: "/Applications/Felix.app/Contents/Resources/node/bin/node",
        bunBin: "/Applications/Felix.app/Contents/Resources/bun/bin/bun",
        inheritedPath: "/usr/bin:/bin",
      }),
    ).toBe(
      [
        "/Applications/Felix.app/Contents/Resources/node/bin",
        "/Users/alex/Library/Application Support/Felix/apps/snake/.felix/bin",
        "/Applications/Felix.app/Contents/Resources/bun/bin",
        "/Users/alex/Library/Application Support/Felix/apps/snake/node_modules/.bin",
        "/usr/bin",
        "/bin",
      ].join(":"),
    );
  });
});

describe("agent event lifecycle", () => {
  test("does not close the Felix turn for retryable assistant message errors", () => {
    const events: AgentEvent[] = [];
    const manager = new AgentManager(
      "/tmp/felix",
      "/tmp/pi",
      "/tmp/node",
      "/tmp/bun",
      (_appId, event) => events.push(event),
      async () => DEFAULT_SETTINGS,
    ) as TestableAgentManager;

    manager.handleLine(
      "app",
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "error",
          errorMessage: "Upstream idle timeout exceeded",
        },
      }),
    );
    manager.handleLine(
      "app",
      JSON.stringify({
        type: "turn_end",
        message: {
          role: "assistant",
          stopReason: "error",
          errorMessage: "Upstream idle timeout exceeded",
        },
      }),
    );

    expect(events).toEqual([{ type: "message_end" }]);
  });

  test("emits a terminal error when auto retry finally fails", () => {
    const events: AgentEvent[] = [];
    const manager = new AgentManager(
      "/tmp/felix",
      "/tmp/pi",
      "/tmp/node",
      "/tmp/bun",
      (_appId, event) => events.push(event),
      async () => DEFAULT_SETTINGS,
    ) as TestableAgentManager;

    manager.handleLine(
      "app",
      JSON.stringify({
        type: "auto_retry_end",
        success: false,
        attempt: 3,
        finalError: "Upstream idle timeout exceeded",
      }),
    );

    expect(events).toEqual([{ type: "error", message: "Upstream idle timeout exceeded" }]);
  });

  test("emits a terminal error at final agent_end", () => {
    const events: AgentEvent[] = [];
    const manager = new AgentManager(
      "/tmp/felix",
      "/tmp/pi",
      "/tmp/node",
      "/tmp/bun",
      (_appId, event) => events.push(event),
      async () => DEFAULT_SETTINGS,
    ) as TestableAgentManager;

    manager.handleLine(
      "app",
      JSON.stringify({
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            stopReason: "error",
            errorMessage: "Upstream idle timeout exceeded",
          },
        ],
      }),
    );

    expect(events).toEqual([
      { type: "error", message: "Upstream idle timeout exceeded" },
      { type: "agent_end" },
    ]);
  });
});
