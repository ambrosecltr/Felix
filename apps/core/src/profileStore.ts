import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  FelixProfile,
  ProfileOverview,
  SetProfileNameRequest,
  TokenUsage,
  type MiniAppManifest,
  type ProfileAppUsage,
  type ProfileStats,
  type TokenActivityDay,
} from "@felix/contracts";

const TOKEN_ACTIVITY_DAYS = 365;
const TOP_APP_LIMIT = 5;

export interface TokenUsageEntry {
  usageId: string;
  appId: string;
  date: string;
  createdAt: string;
  usage: TokenUsage;
}

interface TokenUsageLedger {
  version: 1;
  entries: TokenUsageEntry[];
}

export interface CompletedTurnMetricEntry {
  turnId: string;
  appId: string;
  completedAt: string;
}

export interface BuildSessionMetricEntry {
  buildId: string;
  appId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface ProfileMetricsLedger {
  version: 1;
  completedTurns: CompletedTurnMetricEntry[];
  buildSessions: BuildSessionMetricEntry[];
}

export class ProfileStore {
  private cachedProfile: FelixProfile | null = null;
  private cachedLedger: TokenUsageLedger | null = null;
  private cachedMetrics: ProfileMetricsLedger | null = null;
  private profileWriteQueue: Promise<void> = Promise.resolve();
  private ledgerWriteQueue: Promise<void> = Promise.resolve();
  private metricsWriteQueue: Promise<void> = Promise.resolve();
  private ledgerMutationQueue: Promise<unknown> = Promise.resolve();
  private metricsMutationQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly profileFile: string,
    private readonly tokenUsageFile: string,
    private readonly profileMetricsFile: string,
  ) {}

  async getProfile(): Promise<FelixProfile> {
    if (this.cachedProfile) return structuredClone(this.cachedProfile);
    try {
      const raw = await fs.readFile(this.profileFile, "utf8");
      this.cachedProfile = FelixProfile.parse(JSON.parse(raw));
    } catch (error) {
      if (!isNotFound(error)) throw error;
      this.cachedProfile = FelixProfile.parse({});
    }
    return structuredClone(this.cachedProfile);
  }

  async setName(name: string): Promise<FelixProfile> {
    const request = SetProfileNameRequest.parse({ name });
    const profile = FelixProfile.parse({ ...(await this.getProfile()), name: request.name });
    this.cachedProfile = profile;
    const snapshot = structuredClone(profile);
    this.profileWriteQueue = this.profileWriteQueue
      .catch(() => {})
      .then(() => writeJsonFileAtomically(this.profileFile, snapshot));
    await this.profileWriteQueue;
    return structuredClone(profile);
  }

  async recordTokenUsage(
    appId: string,
    usageId: string,
    createdAt: string,
    usage: TokenUsage,
  ): Promise<boolean> {
    const task = this.ledgerMutationQueue
      .catch(() => {})
      .then(() => this.recordTokenUsageNow(appId, usageId, createdAt, usage));
    this.ledgerMutationQueue = task;
    return task;
  }

  private async recordTokenUsageNow(
    appId: string,
    usageId: string,
    createdAt: string,
    usage: TokenUsage,
  ): Promise<boolean> {
    const parsedUsage = TokenUsage.parse(usage);
    if (parsedUsage.totalTokens <= 0) return false;

    const trimmedUsageId = usageId.trim();
    if (trimmedUsageId.length === 0) return false;

    const ledger = await this.mutableLedger();
    if (ledger.entries.some((entry) => entry.usageId === trimmedUsageId)) return false;

    const timestamp = validDateOrNow(createdAt);
    ledger.entries.push({
      usageId: trimmedUsageId,
      appId,
      date: localDateKey(timestamp),
      createdAt: timestamp.toISOString(),
      usage: parsedUsage,
    });
    await this.writeLedger(ledger);
    return true;
  }

  async recordCompletedTurn(
    appId: string,
    turnId: string,
    completedAt: string,
  ): Promise<boolean> {
    const task = this.metricsMutationQueue
      .catch(() => {})
      .then(() => this.recordCompletedTurnNow(appId, turnId, completedAt));
    this.metricsMutationQueue = task;
    return task;
  }

  private async recordCompletedTurnNow(
    appId: string,
    turnId: string,
    completedAt: string,
  ): Promise<boolean> {
    const trimmedAppId = appId.trim();
    const trimmedTurnId = turnId.trim();
    if (trimmedAppId.length === 0 || trimmedTurnId.length === 0) return false;

    const metrics = await this.mutableMetrics();
    if (metrics.completedTurns.some((entry) => entry.turnId === trimmedTurnId)) return false;

    const timestamp = validDateOrNow(completedAt);
    metrics.completedTurns.push({
      turnId: trimmedTurnId,
      appId: trimmedAppId,
      completedAt: timestamp.toISOString(),
    });
    await this.writeMetrics(metrics);
    return true;
  }

  async recordBuildSession(
    appId: string,
    buildId: string,
    startedAt: string,
    endedAt: string,
  ): Promise<boolean> {
    const task = this.metricsMutationQueue
      .catch(() => {})
      .then(() => this.recordBuildSessionNow(appId, buildId, startedAt, endedAt));
    this.metricsMutationQueue = task;
    return task;
  }

  private async recordBuildSessionNow(
    appId: string,
    buildId: string,
    startedAt: string,
    endedAt: string,
  ): Promise<boolean> {
    const trimmedAppId = appId.trim();
    const trimmedBuildId = buildId.trim();
    if (trimmedAppId.length === 0 || trimmedBuildId.length === 0) return false;

    const start = validDateOrNull(startedAt);
    const end = validDateOrNull(endedAt);
    if (!start || !end) return false;

    const durationMs = end.getTime() - start.getTime();
    if (durationMs <= 0) return false;

    const metrics = await this.mutableMetrics();
    if (metrics.buildSessions.some((entry) => entry.buildId === trimmedBuildId)) return false;

    metrics.buildSessions.push({
      buildId: trimmedBuildId,
      appId: trimmedAppId,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      durationMs,
    });
    await this.writeMetrics(metrics);
    return true;
  }

  async overview(apps: MiniAppManifest[], now = new Date()): Promise<ProfileOverview> {
    const [profile, ledger, metrics] = await Promise.all([
      this.getProfile(),
      this.getLedger(),
      this.getMetrics(),
    ]);
    const stats = buildProfileStats(ledger.entries, apps, now, metrics);
    return ProfileOverview.parse({ profile, stats });
  }

  private async getLedger(): Promise<TokenUsageLedger> {
    if (this.cachedLedger) return structuredClone(this.cachedLedger);
    try {
      const raw = await fs.readFile(this.tokenUsageFile, "utf8");
      this.cachedLedger = parseTokenUsageLedger(JSON.parse(raw));
    } catch (error) {
      if (!isNotFound(error)) throw error;
      this.cachedLedger = emptyLedger();
    }
    return structuredClone(this.cachedLedger);
  }

  private async mutableLedger(): Promise<TokenUsageLedger> {
    if (this.cachedLedger) return this.cachedLedger;
    this.cachedLedger = await this.getLedger();
    return this.cachedLedger;
  }

  private async writeLedger(ledger: TokenUsageLedger): Promise<void> {
    const snapshot = structuredClone(ledger);
    this.cachedLedger = snapshot;
    this.ledgerWriteQueue = this.ledgerWriteQueue
      .catch(() => {})
      .then(() => writeJsonFileAtomically(this.tokenUsageFile, snapshot));
    await this.ledgerWriteQueue;
  }

  private async getMetrics(): Promise<ProfileMetricsLedger> {
    if (this.cachedMetrics) return structuredClone(this.cachedMetrics);
    try {
      const raw = await fs.readFile(this.profileMetricsFile, "utf8");
      this.cachedMetrics = parseProfileMetricsLedger(JSON.parse(raw));
    } catch (error) {
      if (!isNotFound(error)) throw error;
      this.cachedMetrics = emptyMetricsLedger();
    }
    return structuredClone(this.cachedMetrics);
  }

  private async mutableMetrics(): Promise<ProfileMetricsLedger> {
    if (this.cachedMetrics) return this.cachedMetrics;
    this.cachedMetrics = await this.getMetrics();
    return this.cachedMetrics;
  }

  private async writeMetrics(metrics: ProfileMetricsLedger): Promise<void> {
    const snapshot = structuredClone(metrics);
    this.cachedMetrics = snapshot;
    this.metricsWriteQueue = this.metricsWriteQueue
      .catch(() => {})
      .then(() => writeJsonFileAtomically(this.profileMetricsFile, snapshot));
    await this.metricsWriteQueue;
  }
}

export function buildProfileStats(
  entries: TokenUsageEntry[],
  apps: MiniAppManifest[],
  now = new Date(),
  metrics: ProfileMetricsLedger = emptyMetricsLedger(),
): ProfileStats {
  const tokensByDate = new Map<string, number>();
  const tokensByApp = new Map<string, number>();
  const completedMessagesByApp = new Map<string, number>();
  const buildTimeByApp = new Map<string, number>();
  let lifetimeTokens = 0;

  for (const entry of entries) {
    const tokens = entry.usage.totalTokens;
    lifetimeTokens += tokens;
    tokensByDate.set(entry.date, (tokensByDate.get(entry.date) ?? 0) + tokens);
    tokensByApp.set(entry.appId, (tokensByApp.get(entry.appId) ?? 0) + tokens);
  }

  for (const entry of metrics.completedTurns) {
    completedMessagesByApp.set(
      entry.appId,
      (completedMessagesByApp.get(entry.appId) ?? 0) + 1,
    );
  }

  for (const entry of metrics.buildSessions) {
    buildTimeByApp.set(entry.appId, (buildTimeByApp.get(entry.appId) ?? 0) + entry.durationMs);
  }

  const activity = activityDays(tokensByDate, now);
  const activeDates = new Set(
    [...tokensByDate.entries()].filter(([, tokens]) => tokens > 0).map(([date]) => date),
  );
  const appById = new Map(apps.map((app) => [app.id, app]));
  const topApps: ProfileAppUsage[] = [...tokensByApp.entries()]
    .flatMap(([appId, tokens]) => {
      const app = appById.get(appId);
      if (!app) return [];

      return [{
        appId,
        name: app.name,
        emoji: app.emoji,
        icon: app.icon,
        tokens,
        completedMessages: completedMessagesByApp.get(appId) ?? 0,
        buildTimeMs: buildTimeByApp.get(appId) ?? 0,
      }];
    })
    .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
    .slice(0, TOP_APP_LIMIT);

  return {
    lifetimeTokens,
    peakTokens: Math.max(0, ...tokensByDate.values()),
    currentStreakDays: currentStreakDays(activeDates, now),
    longestStreakDays: longestStreakDays(activeDates),
    activity,
    topApps,
  };
}

function activityDays(tokensByDate: Map<string, number>, now: Date): TokenActivityDay[] {
  const today = startOfLocalDay(now);
  const start = new Date(today);
  start.setDate(today.getDate() - (TOKEN_ACTIVITY_DAYS - 1));

  return [...tokensByDate.entries()]
    .filter(([date, tokens]) => tokens > 0 && date >= localDateKey(start) && date <= localDateKey(today))
    .map(([date, tokens]) => ({ date, tokens }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function currentStreakDays(activeDates: Set<string>, now: Date): number {
  const today = localDateKey(now);
  const yesterday = offsetDateKey(today, -1);
  let cursor = activeDates.has(today) ? today : activeDates.has(yesterday) ? yesterday : null;
  if (!cursor) return 0;

  let count = 0;
  while (cursor && activeDates.has(cursor)) {
    count += 1;
    cursor = offsetDateKey(cursor, -1);
  }
  return count;
}

function longestStreakDays(activeDates: Set<string>): number {
  let longest = 0;
  let current = 0;
  let previous: string | null = null;

  for (const date of [...activeDates].sort()) {
    current = previous && date === offsetDateKey(previous, 1) ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

function offsetDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDateOrNow(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function validDateOrNull(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTokenUsageLedger(value: unknown): TokenUsageLedger {
  if (!isRecord(value) || !Array.isArray(value.entries)) return emptyLedger();
  return {
    version: 1,
    entries: value.entries.flatMap((entry) => {
      const parsed = parseTokenUsageEntry(entry);
      return parsed ? [parsed] : [];
    }),
  };
}

function parseProfileMetricsLedger(value: unknown): ProfileMetricsLedger {
  if (!isRecord(value)) return emptyMetricsLedger();
  return {
    version: 1,
    completedTurns: Array.isArray(value.completedTurns)
      ? value.completedTurns.flatMap((entry) => {
          const parsed = parseCompletedTurnMetricEntry(entry);
          return parsed ? [parsed] : [];
        })
      : [],
    buildSessions: Array.isArray(value.buildSessions)
      ? value.buildSessions.flatMap((entry) => {
          const parsed = parseBuildSessionMetricEntry(entry);
          return parsed ? [parsed] : [];
        })
      : [],
  };
}

function parseCompletedTurnMetricEntry(value: unknown): CompletedTurnMetricEntry | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.turnId !== "string" ||
    typeof value.appId !== "string" ||
    typeof value.completedAt !== "string"
  ) {
    return null;
  }

  return {
    turnId: value.turnId,
    appId: value.appId,
    completedAt: value.completedAt,
  };
}

function parseBuildSessionMetricEntry(value: unknown): BuildSessionMetricEntry | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.buildId !== "string" ||
    typeof value.appId !== "string" ||
    typeof value.startedAt !== "string" ||
    typeof value.endedAt !== "string" ||
    typeof value.durationMs !== "number" ||
    !Number.isInteger(value.durationMs) ||
    value.durationMs < 0
  ) {
    return null;
  }

  return {
    buildId: value.buildId,
    appId: value.appId,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    durationMs: value.durationMs,
  };
}

function parseTokenUsageEntry(value: unknown): TokenUsageEntry | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.usageId !== "string" ||
    typeof value.appId !== "string" ||
    typeof value.date !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  try {
    return {
      usageId: value.usageId,
      appId: value.appId,
      date: value.date,
      createdAt: value.createdAt,
      usage: TokenUsage.parse(value.usage),
    };
  } catch {
    return null;
  }
}

function emptyLedger(): TokenUsageLedger {
  return { version: 1, entries: [] };
}

function emptyMetricsLedger(): ProfileMetricsLedger {
  return { version: 1, completedTurns: [], buildSessions: [] };
}

async function writeJsonFileAtomically(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
