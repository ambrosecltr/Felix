import { watch, type FSWatcher } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const browserPreviewToolNames = [
  "browser_snapshot",
  "browser_screenshot",
  "browser_logs",
  "browser_reload",
  "browser_click",
  "browser_type",
  "browser_key",
  "browser_scroll",
  "browser_move_cursor",
] as const;

export type BrowserPreviewToolName = (typeof browserPreviewToolNames)[number];

export interface BrowserPreviewToolRequest {
  toolName: BrowserPreviewToolName;
  params: Record<string, unknown>;
}

export type BrowserPreviewToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface BrowserPreviewToolResponse {
  content: BrowserPreviewToolContent[];
  details?: unknown;
  isError?: boolean;
}

export interface BrowserPreviewController {
  execute(appId: string, request: BrowserPreviewToolRequest): Promise<BrowserPreviewToolResponse>;
  setAgentActive?(appId: string, active: boolean): void;
}

interface BrowserBridgeRequestFile {
  id: string;
  toolName: BrowserPreviewToolName;
  params: Record<string, unknown>;
}

interface BrowserBridgeResponseFile {
  id: string;
  result?: BrowserPreviewToolResponse;
  error?: string;
}

const REQUEST_SUFFIX = ".request.json";
const RESPONSE_SUFFIX = ".response.json";
const SCAN_INTERVAL_MS = 100;

export class BrowserPreviewBridgeServer {
  private watcher: FSWatcher | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private readonly processing = new Set<string>();

  constructor(
    private readonly appId: string,
    readonly dir: string,
    private readonly controller: BrowserPreviewController,
  ) {}

  async start(): Promise<void> {
    await fs.rm(this.dir, { recursive: true, force: true });
    await fs.mkdir(this.dir, { recursive: true });

    this.watcher = watch(this.dir, () => {
      void this.scanRequests();
    });
    this.watcher.on("error", () => {
      this.watcher?.close();
      this.watcher = null;
    });
    this.interval = setInterval(() => {
      void this.scanRequests();
    }, SCAN_INTERVAL_MS);
    await this.scanRequests();
  }

  dispose(): void {
    this.disposed = true;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.watcher?.close();
    this.watcher = null;
    this.controller.setAgentActive?.(this.appId, false);
    void fs.rm(this.dir, { recursive: true, force: true }).catch(() => {});
  }

  private async scanRequests(): Promise<void> {
    if (this.disposed) return;
    let entries: string[];
    try {
      entries = await fs.readdir(this.dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith(REQUEST_SUFFIX)) continue;
      const requestPath = path.join(this.dir, entry);
      if (this.processing.has(requestPath)) continue;
      this.processing.add(requestPath);
      void this.processRequest(entry, requestPath)
        .catch(() => {})
        .finally(() => {
          this.processing.delete(requestPath);
        });
    }
  }

  private async processRequest(entry: string, requestPath: string): Promise<void> {
    const fallbackId = entry.slice(0, -REQUEST_SUFFIX.length);
    let response: BrowserBridgeResponseFile;
    try {
      const request = parseBridgeRequest(await fs.readFile(requestPath, "utf8"), fallbackId);
      if (!(await fileExists(requestPath))) return;
      const result = await this.controller.execute(this.appId, {
        toolName: request.toolName,
        params: request.params,
      });
      if (!(await fileExists(requestPath))) return;
      response = { id: request.id, result };
    } catch (err) {
      response = { id: fallbackId, error: errorMessage(err) };
    }

    try {
      if (!this.disposed) {
        await writeJsonAtomic(path.join(this.dir, `${response.id}${RESPONSE_SUFFIX}`), response);
      }
    } finally {
      await fs.rm(requestPath, { force: true }).catch(() => {});
    }
  }
}

function parseBridgeRequest(raw: string, expectedId: string): BrowserBridgeRequestFile {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error("Invalid browser preview request");
  if (parsed.id !== expectedId) throw new Error("Browser preview request id mismatch");
  if (!isBrowserPreviewToolName(parsed.toolName)) {
    throw new Error("Unknown browser preview tool");
  }
  return {
    id: parsed.id,
    toolName: parsed.toolName,
    params: isRecord(parsed.params) ? parsed.params : {},
  };
}

function isBrowserPreviewToolName(value: unknown): value is BrowserPreviewToolName {
  return typeof value === "string" && browserPreviewToolNames.includes(value as BrowserPreviewToolName);
}

async function writeJsonAtomic(filePath: string, value: BrowserBridgeResponseFile): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(value), "utf8");
  await fs.rename(tmpPath, filePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
