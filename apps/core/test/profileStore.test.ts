import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { MiniAppManifest, TokenUsage } from "@felix/contracts";
import { buildProfileStats, ProfileStore } from "../src/profileStore.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("profile store", () => {
  test("persists trimmed profile names", async () => {
    const store = await tempProfileStore();

    await store.setName("  Alex Taylor  ");

    const profile = await store.getProfile();
    expect(profile.name).toBe("Alex Taylor");
  });

  test("dedupes token usage events and derives overview stats", async () => {
    const store = await tempProfileStore();
    const now = new Date(2026, 5, 6, 12);
    const snakeIcon = {
      relativePath: ".felix/icon.png",
      mimeType: "image/png",
      generatedAt: "2026-06-02T00:00:00.000Z",
      description: "Snake app icon",
    };
    const apps = [
      miniApp("snake", "Snake Lab", "S", snakeIcon),
      miniApp("paint", "Paint Pad", "P"),
    ];

    expect(
      await store.recordTokenUsage("snake", "usage-1", localIso(2026, 5, 4), usage(100)),
    ).toBe(true);
    expect(
      await store.recordTokenUsage("snake", "usage-1", localIso(2026, 5, 4), usage(100)),
    ).toBe(false);
    await store.recordTokenUsage("paint", "usage-2", localIso(2026, 5, 5), usage(400));
    await store.recordTokenUsage("snake", "usage-3", localIso(2026, 5, 6), usage(500));

    const overview = await store.overview(apps, now);

    expect(overview.stats.lifetimeTokens).toBe(1000);
    expect(overview.stats.peakTokens).toBe(500);
    expect(overview.stats.currentStreakDays).toBe(3);
    expect(overview.stats.longestStreakDays).toBe(3);
    expect(overview.stats.activity).toEqual([
      { date: "2026-06-04", tokens: 100 },
      { date: "2026-06-05", tokens: 400 },
      { date: "2026-06-06", tokens: 500 },
    ]);
    expect(overview.stats.topApps).toEqual([
      { appId: "snake", name: "Snake Lab", emoji: "S", icon: snakeIcon, tokens: 600 },
      { appId: "paint", name: "Paint Pad", emoji: "P", icon: null, tokens: 400 },
    ]);
  });

  test("keeps yesterday's streak current until a day is missed", () => {
    const now = new Date(2026, 5, 6, 12);
    const stats = buildProfileStats(
      [
        entry("app", "2026-06-03", 100),
        entry("app", "2026-06-04", 100),
        entry("app", "2026-06-05", 100),
      ],
      [miniApp("app", "App", "A")],
      now,
    );

    expect(stats.currentStreakDays).toBe(3);
    expect(stats.longestStreakDays).toBe(3);
  });
});

async function tempProfileStore(): Promise<ProfileStore> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-profile-"));
  tempDirs.push(dir);
  return new ProfileStore(path.join(dir, "profile.json"), path.join(dir, "token-usage.json"));
}

function usage(totalTokens: number): TokenUsage {
  return {
    input: totalTokens,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens,
  };
}

function entry(appId: string, date: string, totalTokens: number) {
  return {
    usageId: `${appId}-${date}`,
    appId,
    date,
    createdAt: `${date}T12:00:00.000Z`,
    usage: usage(totalTokens),
  };
}

function miniApp(
  id: string,
  name: string,
  emoji: string,
  icon: MiniAppManifest["icon"] = null,
): MiniAppManifest {
  return {
    id,
    name,
    emoji,
    appDescription: "",
    icon,
    iconError: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    devPort: null,
  };
}

function localIso(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day, 12).toISOString();
}
