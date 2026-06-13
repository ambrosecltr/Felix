import { describe, expect, test } from "bun:test";
import { ProfileOverview, SetProfileNameRequest, TokenUsage } from "../src/profile.ts";

describe("profile contracts", () => {
  test("trims profile names before saving", () => {
    expect(SetProfileNameRequest.parse({ name: "  Alex Taylor  " })).toEqual({
      name: "Alex Taylor",
    });
  });

  test("rejects blank profile names", () => {
    expect(() => SetProfileNameRequest.parse({ name: "   " })).toThrow();
  });

  test("accepts token usage parts and profile overview stats", () => {
    const overview = ProfileOverview.parse({
      profile: { name: "Alex" },
      stats: {
        lifetimeTokens: 1250,
        peakTokens: 900,
        currentStreakDays: 2,
        longestStreakDays: 4,
        activity: [{ date: "2026-06-06", tokens: 900 }],
        topApps: [{ appId: "snake", name: "Snake", emoji: "S", tokens: 1250 }],
      },
    });

    expect(overview.stats.topApps[0]?.tokens).toBe(1250);
    expect(overview.stats.topApps[0]?.icon).toBe(null);
    expect(overview.stats.topApps[0]?.completedMessages).toBe(0);
    expect(overview.stats.topApps[0]?.buildTimeMs).toBe(0);
  });

  test("fills missing token usage parts with zeros", () => {
    expect(TokenUsage.parse({ totalTokens: 10 })).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 10,
    });
  });
});
