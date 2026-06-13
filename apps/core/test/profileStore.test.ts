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
      {
        appId: "snake",
        name: "Snake Lab",
        emoji: "S",
        icon: snakeIcon,
        tokens: 600,
        completedMessages: 0,
        buildTimeMs: 0,
      },
      {
        appId: "paint",
        name: "Paint Pad",
        emoji: "P",
        icon: null,
        tokens: 400,
        completedMessages: 0,
        buildTimeMs: 0,
      },
    ]);
  });

  test("dedupes completed turns and build sessions in top app metrics", async () => {
    const store = await tempProfileStore();
    await store.recordTokenUsage("snake", "usage-1", localIso(2026, 5, 6), usage(700));
    await store.recordTokenUsage("paint", "usage-2", localIso(2026, 5, 6), usage(500));

    expect(await store.recordCompletedTurn("snake", "turn-1", localIso(2026, 5, 6))).toBe(true);
    expect(await store.recordCompletedTurn("snake", "turn-1", localIso(2026, 5, 6))).toBe(false);
    await store.recordCompletedTurn("snake", "turn-2", localIso(2026, 5, 6));
    await store.recordCompletedTurn("paint", "turn-3", localIso(2026, 5, 6));
    expect(
      await store.recordBuildSession(
        "snake",
        "build-1",
        "2026-06-06T12:00:00.000Z",
        "2026-06-06T12:02:30.000Z",
      ),
    ).toBe(true);
    expect(
      await store.recordBuildSession(
        "snake",
        "build-1",
        "2026-06-06T12:00:00.000Z",
        "2026-06-06T12:02:30.000Z",
      ),
    ).toBe(false);

    const overview = await store.overview(
      [miniApp("snake", "Snake Lab", "S"), miniApp("paint", "Paint Pad", "P")],
      new Date(2026, 5, 6, 12),
    );

    expect(overview.stats.topApps).toEqual([
      {
        appId: "snake",
        name: "Snake Lab",
        emoji: "S",
        icon: null,
        tokens: 700,
        completedMessages: 2,
        buildTimeMs: 150_000,
      },
      {
        appId: "paint",
        name: "Paint Pad",
        emoji: "P",
        icon: null,
        tokens: 500,
        completedMessages: 1,
        buildTimeMs: 0,
      },
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

  test("ranks top apps using only available apps", () => {
    const now = new Date(2026, 5, 6, 12);
    const stats = buildProfileStats(
      [
        entry("deleted-largest", "2026-06-06", 1000),
        entry("snake", "2026-06-06", 700),
        entry("deleted-smallest", "2026-06-06", 600),
        entry("paint", "2026-06-06", 500),
        entry("notes", "2026-06-06", 400),
        entry("music", "2026-06-06", 300),
        entry("calendar", "2026-06-06", 200),
        entry("mail", "2026-06-06", 100),
      ],
      [
        miniApp("snake", "Snake Lab", "S"),
        miniApp("paint", "Paint Pad", "P"),
        miniApp("notes", "Notes", "N"),
        miniApp("music", "Music", "M"),
        miniApp("calendar", "Calendar", "C"),
        miniApp("mail", "Mail", "E"),
      ],
      now,
    );

    expect(stats.lifetimeTokens).toBe(3800);
    expect(stats.topApps).toEqual([
      {
        appId: "snake",
        name: "Snake Lab",
        emoji: "S",
        icon: null,
        tokens: 700,
        completedMessages: 0,
        buildTimeMs: 0,
      },
      {
        appId: "paint",
        name: "Paint Pad",
        emoji: "P",
        icon: null,
        tokens: 500,
        completedMessages: 0,
        buildTimeMs: 0,
      },
      {
        appId: "notes",
        name: "Notes",
        emoji: "N",
        icon: null,
        tokens: 400,
        completedMessages: 0,
        buildTimeMs: 0,
      },
      {
        appId: "music",
        name: "Music",
        emoji: "M",
        icon: null,
        tokens: 300,
        completedMessages: 0,
        buildTimeMs: 0,
      },
      {
        appId: "calendar",
        name: "Calendar",
        emoji: "C",
        icon: null,
        tokens: 200,
        completedMessages: 0,
        buildTimeMs: 0,
      },
    ]);
  });
});

async function tempProfileStore(): Promise<ProfileStore> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-profile-"));
  tempDirs.push(dir);
  return new ProfileStore(
    path.join(dir, "profile.json"),
    path.join(dir, "token-usage.json"),
    path.join(dir, "profile-metrics.json"),
  );
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
