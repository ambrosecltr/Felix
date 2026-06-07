import { createRequire } from "node:module";
import { app } from "electron";
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import type { UpdateDownloadProgress, UpdateStatus } from "@felix/contracts";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const SIMULATED_UPDATE_VERSION = "99.0.0";
const { autoUpdater } = createRequire(import.meta.url)("electron-updater") as typeof import("electron-updater");

export class UpdateController {
  private status: UpdateStatus = {
    state: "idle",
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: null,
    error: null,
    checkedAt: null,
  };
  private started = false;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private checkPromise: Promise<UpdateStatus> | null = null;
  private downloadPromise: Promise<UpdateStatus> | null = null;
  private installTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly emitStatus: (status: UpdateStatus) => void) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = {
      info: (message?: unknown) => console.info("[felix:update]", message),
      warn: (message?: unknown) => console.warn("[felix:update]", message),
      error: (message?: unknown) => console.error("[felix:update]", message),
    };

    autoUpdater.on("checking-for-update", () => {
      this.setStatus({ state: "checking", progress: null, error: null });
    });
    autoUpdater.on("update-available", (info) => this.handleUpdateAvailable(info));
    autoUpdater.on("update-not-available", (info) => this.handleUpdateNotAvailable(info));
    autoUpdater.on("download-progress", (info) => this.handleDownloadProgress(info));
    autoUpdater.on("update-downloaded", (event) => this.handleUpdateDownloaded(event));
    autoUpdater.on("update-cancelled", (info) => this.handleUpdateAvailable(info));
    autoUpdater.on("error", (error) => this.handleError(error));
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.isSimulatingUpdate()) {
      this.showSimulatedUpdate();
      return;
    }
    if (!app.isPackaged) return;

    void this.checkForUpdates();
    this.checkTimer = setInterval(() => {
      void this.checkForUpdates();
    }, CHECK_INTERVAL_MS);
    this.checkTimer.unref?.();
  }

  stop(): void {
    if (this.checkTimer) clearInterval(this.checkTimer);
    if (this.installTimer) clearTimeout(this.installTimer);
    this.checkTimer = null;
    this.installTimer = null;
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (this.isSimulatingUpdate()) {
      this.showSimulatedUpdate();
      return this.status;
    }
    if (!app.isPackaged) return this.status;
    if (this.isBusy()) return this.status;
    if (this.checkPromise) return this.checkPromise;

    this.checkPromise = this.runUpdateCheck();
    try {
      return await this.checkPromise;
    } finally {
      this.checkPromise = null;
    }
  }

  async downloadAndInstall(): Promise<UpdateStatus> {
    if (this.isSimulatingUpdate()) {
      if (this.downloadPromise) return this.downloadPromise;
      this.downloadPromise = this.runSimulatedDownload();
      try {
        return await this.downloadPromise;
      } finally {
        this.downloadPromise = null;
      }
    }
    if (!app.isPackaged) return this.status;
    if (this.status.state === "installing") return this.status;
    if (this.status.state === "downloaded") {
      this.scheduleInstall();
      return this.status;
    }
    if (this.downloadPromise) return this.downloadPromise;

    if (this.status.state !== "available") {
      const status = await this.checkForUpdates();
      if (status.state !== "available") return status;
    }

    this.setStatus({
      state: "downloading",
      progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 },
      error: null,
    });

    this.downloadPromise = this.runDownload();
    try {
      return await this.downloadPromise;
    } finally {
      this.downloadPromise = null;
    }
  }

  private async runUpdateCheck(): Promise<UpdateStatus> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.handleError(error);
    }
    return this.status;
  }

  private async runDownload(): Promise<UpdateStatus> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.handleError(error);
    }
    return this.status;
  }

  private handleUpdateAvailable(info: UpdateInfo): void {
    this.setStatus({
      state: "available",
      availableVersion: info.version,
      progress: null,
      error: null,
      checkedAt: new Date().toISOString(),
    });
  }

  private handleUpdateNotAvailable(info: UpdateInfo): void {
    this.setStatus({
      state: "not-available",
      availableVersion: info.version ?? null,
      progress: null,
      error: null,
      checkedAt: new Date().toISOString(),
    });
  }

  private handleDownloadProgress(info: ProgressInfo): void {
    this.setStatus({
      state: "downloading",
      progress: normalizeProgress(info),
      error: null,
    });
  }

  private handleUpdateDownloaded(event: UpdateDownloadedEvent): void {
    this.setStatus({
      state: "downloaded",
      availableVersion: event.version,
      progress: { percent: 100, bytesPerSecond: 0, transferred: 0, total: 0 },
      error: null,
    });
    this.scheduleInstall();
  }

  private handleError(error: unknown): void {
    this.setStatus({
      state: "error",
      progress: null,
      error: errorMessage(error),
      checkedAt: new Date().toISOString(),
    });
  }

  private showSimulatedUpdate(): void {
    if (this.isBusy()) return;
    this.setStatus({
      state: "available",
      availableVersion: process.env.FELIX_SIMULATE_UPDATE_VERSION ?? SIMULATED_UPDATE_VERSION,
      progress: null,
      error: null,
      checkedAt: new Date().toISOString(),
    });
  }

  private async runSimulatedDownload(): Promise<UpdateStatus> {
    const total = 100_000_000;
    const availableVersion =
      this.status.availableVersion ?? process.env.FELIX_SIMULATE_UPDATE_VERSION ?? SIMULATED_UPDATE_VERSION;
    this.setStatus({
      state: "downloading",
      availableVersion,
      progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total },
      error: null,
    });

    for (const percent of [8, 21, 42, 68, 87, 100]) {
      await delay(350);
      this.setStatus({
        state: "downloading",
        progress: {
          percent,
          bytesPerSecond: 4_800_000,
          transferred: Math.round((total * percent) / 100),
          total,
        },
      });
    }

    this.setStatus({
      state: "downloaded",
      availableVersion,
      progress: {
        percent: 100,
        bytesPerSecond: 0,
        transferred: total,
        total,
      },
    });
    await delay(700);
    this.setStatus({
      state: "installing",
      progress: {
        percent: 100,
        bytesPerSecond: 0,
        transferred: total,
        total,
      },
    });
    return this.status;
  }

  private scheduleInstall(): void {
    if (this.installTimer) return;
    this.installTimer = setTimeout(() => {
      this.installTimer = null;
      const progress = this.status.progress ?? {
        percent: 100,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
      };
      this.setStatus({ state: "installing", progress: { ...progress, percent: 100 } });
      autoUpdater.quitAndInstall(false, true);
    }, 600);
  }

  private isBusy(): boolean {
    return (
      this.status.state === "downloading" ||
      this.status.state === "downloaded" ||
      this.status.state === "installing"
    );
  }

  private isSimulatingUpdate(): boolean {
    return !app.isPackaged && process.env.FELIX_SIMULATE_UPDATE === "1";
  }

  private setStatus(next: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...next };
    this.emitStatus(this.status);
  }
}

function normalizeProgress(info: ProgressInfo): UpdateDownloadProgress {
  return {
    percent: clampPercent(info.percent),
    bytesPerSecond: Math.max(0, info.bytesPerSecond),
    transferred: Math.max(0, info.transferred),
    total: Math.max(0, info.total),
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
