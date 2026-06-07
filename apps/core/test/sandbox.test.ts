import { describe, expect, test } from "bun:test";
import { buildSeatbeltProfile } from "../src/sandbox.ts";

describe("sandbox profile", () => {
  test("allows writes to the mini app and Felix agent state directories", () => {
    const profile = buildSeatbeltProfile({
      appDir: "/Users/alex/Library/Application Support/Felix/apps/snake",
      agentDir: "/Users/alex/Library/Application Support/Felix/agent",
      allowNetwork: false,
    });

    expect(profile).toContain(
      '(subpath "/Users/alex/Library/Application Support/Felix/apps/snake")',
    );
    expect(profile).toContain('(subpath "/Users/alex/Library/Application Support/Felix/agent")');
    expect(profile).toContain("(deny network*)");
  });
});
