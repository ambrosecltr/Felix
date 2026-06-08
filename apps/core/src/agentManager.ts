import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  TokenUsage,
  type AgentEvent,
  type ExtensionUiResponse,
  type FelixSettings,
  type TokenUsage as TokenUsageData,
} from "@felix/contracts";
import { felixSystemPrompt, felixWorkspaceFiles } from "./agentPrompt.ts";
import type { AgentImageContent } from "./chatAttachmentImages.ts";
import { providerEnv, writeProviderConfig } from "./providerConfig.ts";
import { buildSeatbeltProfile, isSandboxAvailable, wrapWithSandbox } from "./sandbox.ts";
import {
  isWebSearchExtensionPath,
  webSearchEnv,
  writeWebSearchConfig,
} from "./webSearchConfig.ts";
import {
  BrowserPreviewBridgeServer,
  type BrowserPreviewController,
} from "./browserPreview.ts";
import {
  miniAppBunWrapperDir,
  miniAppBunWrapperPath,
  miniAppBunWrapperScript,
} from "./packageInstallPolicy.ts";

type EventSink = (appId: string, event: AgentEvent) => void;
const MAX_JSONL_BUFFER_CHARS = 1024 * 1024;
const STOP_TIMEOUT_MS = 2_000;
interface PendingToolDetail {
  toolName: string;
  detail: string | undefined;
}
interface PromptCommand {
  type: "prompt";
  message: string;
  images?: AgentImageContent[];
  streamingBehavior?: "steer";
}

/** Maps raw PI tool names to friendly labels kids can understand. */
function kidToolLabel(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes("set_app_metadata")) return "Naming your app";
  if (name.startsWith("browser_")) return "Checking the app";
  if (name.includes("read") || name === "cat") return "Reading your code";
  if (name.includes("write") || name.includes("edit") || name.includes("patch")) {
    return "Writing your code";
  }
  if (name.includes("bash") || name.includes("shell") || name.includes("run") || name.includes("exec")) {
    return "Running it";
  }
  if (name.includes("list") || name.includes("glob") || name.includes("grep") || name.includes("search") || name.includes("find")) {
    return "Looking around";
  }
  return "Working";
}

interface RunningAgent {
  process: ChildProcess;
  send: (cmd: object) => void;
  streaming: boolean;
  cleanup: () => void;
}

/**
 * Splits a stream into JSONL records using LF as the only delimiter,
 * stripping a trailing CR (per PI RPC framing rules).
 */
function attachJsonlReader(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): void {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  stream.on("data", (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    if (buffer.length > MAX_JSONL_BUFFER_CHARS) {
      buffer = buffer.slice(-MAX_JSONL_BUFFER_CHARS);
      console.warn("[felix] agent JSONL buffer exceeded limit; discarded oldest buffered data");
    }
    for (;;) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) break;
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.trim().length > 0) onLine(line);
    }
  });
}

export class AgentManager {
  private agents = new Map<string, RunningAgent>();
  private pendingToolDetails = new Map<string, PendingToolDetail[]>();

  constructor(
    private readonly rootDir: string,
    private readonly piBinPath: string,
    private readonly nodeBin: string,
    private readonly bunBin: string,
    private readonly onEvent: EventSink,
    private readonly getSettings: () => Promise<FelixSettings>,
    private readonly piExtensionPaths: readonly string[] = [],
    private readonly browserPreview: BrowserPreviewController | null = null,
  ) {}

  private async ensureWorkspaceFiles(
    appDir: string,
    appName: string,
    level: FelixSettings["learningLevel"],
  ): Promise<string> {
    const piDir = path.join(appDir, ".pi");
    await fs.mkdir(piDir, { recursive: true });
    for (const file of felixWorkspaceFiles(appName, level)) {
      const filePath = path.join(appDir, file.path);
      if (file.overwrite === false && (await fileExists(filePath))) continue;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, "utf8");
    }
    await this.writeBunWrapper(appDir);
    return piDir;
  }

  private async writeBunWrapper(appDir: string): Promise<void> {
    const wrapperDir = miniAppBunWrapperDir(appDir);
    const wrapperPath = miniAppBunWrapperPath(appDir);
    await fs.mkdir(wrapperDir, { recursive: true });
    await fs.writeFile(wrapperPath, miniAppBunWrapperScript(this.bunBin), {
      encoding: "utf8",
      mode: 0o755,
    });
    await fs.chmod(wrapperPath, 0o755);
  }

  private async writeSandboxProfile(
    appDir: string,
    agentDir: string,
    allowNetwork: boolean,
  ): Promise<string> {
    const profile = buildSeatbeltProfile({ appDir, agentDir, allowNetwork });
    const profilePath = path.join(appDir, ".pi", `sandbox-${process.pid}.sb`);
    await fs.writeFile(profilePath, profile, { encoding: "utf8", mode: 0o600 });
    return profilePath;
  }

  async start(appId: string, appDir: string, appName: string): Promise<void> {
    if (this.agents.has(appId)) return;
    this.pendingToolDetails.delete(appId);

    const settings = await this.getSettings();
    await this.ensureWorkspaceFiles(appDir, appName, settings.learningLevel);

    const agentDir = path.join(this.rootDir, "agent");
    const sessionDir = path.join(appDir, ".pi", "sessions");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(sessionDir, { recursive: true });
    await writeProviderConfig(agentDir, settings);
    await writeWebSearchConfig(settings);
    const browserBridge = this.browserPreview
      ? new BrowserPreviewBridgeServer(
          appId,
          path.join(appDir, ".pi", "browser-preview"),
          this.browserPreview,
        )
      : null;
    try {
      await browserBridge?.start();
    } catch (err) {
      browserBridge?.dispose();
      throw err;
    }

    const piArgs = [
      "--mode",
      "rpc",
      "--provider",
      settings.activeProvider,
      "--model",
      settings.activeModel,
      "--session-dir",
      sessionDir,
      // Stable per-app session id so PI resumes the same conversation across
      // app restarts (created on first use). Without this PI starts fresh and
      // the model loses all prior context even though we show the kid's chat.
      "--session-id",
      sessionIdFor(appId),
    ];
    for (const extensionPath of this.piExtensionPaths) {
      if (!settings.webSearch.enabled && isWebSearchExtensionPath(extensionPath)) continue;
      piArgs.push("--extension", extensionPath);
    }

    // Run pi with a real Node runtime (never process.execPath, which is the
    // Electron binary in production and would relaunch the GUI).
    let command = this.nodeBin;
    let args = [this.piBinPath, ...piArgs];
    let sandboxProfilePath: string | null = null;
    let child: ChildProcess;

    try {
      if (isSandboxAvailable()) {
        sandboxProfilePath = await this.writeSandboxProfile(
          appDir,
          agentDir,
          settings.sandboxAllowNetwork,
        );
        ({ command, args } = wrapWithSandbox(sandboxProfilePath, command, args));
      }

      const agentEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...providerEnv(settings),
        ...webSearchEnv(settings),
        PATH: buildAgentPath({
          appDir,
          nodeBin: this.nodeBin,
          bunBin: this.bunBin,
          inheritedPath: process.env.PATH,
        }),
        PI_AGENT_DIR: agentDir,
        IMPECCABLE_NO_UPDATE_CHECK: "1",
        FELIX_SYSTEM_PROMPT: felixSystemPrompt(settings.learningLevel),
      };
      if (browserBridge) agentEnv.FELIX_BROWSER_BRIDGE_DIR = browserBridge.dir;
      delete agentEnv.XAI_API_KEY;

      child = spawn(command, args, {
        cwd: appDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: agentEnv,
      });
    } catch (err) {
      if (sandboxProfilePath) await fs.rm(sandboxProfilePath, { force: true }).catch(() => {});
      browserBridge?.dispose();
      throw err;
    }

    const send = (cmd: object) => {
      if (!child.stdin || child.stdin.destroyed) return;
      child.stdin.write(`${JSON.stringify(cmd)}\n`);
    };
    const cleanup = () => {
      if (sandboxProfilePath) void fs.rm(sandboxProfilePath, { force: true }).catch(() => {});
      browserBridge?.dispose();
    };
    const running: RunningAgent = {
      process: child,
      send,
      streaming: false,
      cleanup,
    };
    this.agents.set(appId, running);

    // Keep the conversation going as it grows: PI compacts old context
    // automatically instead of failing once the window fills.
    send({ type: "set_auto_compaction", enabled: true });

    if (child.stdout) attachJsonlReader(child.stdout, (line) => this.handleLine(appId, line));

    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    // Without these handlers, a spawn failure or broken stdin pipe emits an
    // unhandled "error" event that crashes the whole Electron main process.
    child.on("error", (err) => {
      this.onEvent(appId, { type: "error", message: `Felix couldn't start: ${err.message}` });
      cleanup();
      this.agents.delete(appId);
      this.pendingToolDetails.delete(appId);
    });
    child.stdin?.on("error", () => {
      /* swallow EPIPE when the agent exits mid-write */
    });

    child.once("exit", (code) => {
      // Report any unexpected exit, including a startup crash (e.g. a missing
      // dependency) that happens before streaming begins — otherwise the chat
      // would just sit silent with no Felix response.
      if (code !== null && code !== 0) {
        this.onEvent(appId, {
          type: "error",
          message: `Felix stopped unexpectedly.${stderr ? ` (${stderr.slice(-200)})` : ""}`,
        });
      }
      cleanup();
      this.agents.delete(appId);
      this.pendingToolDetails.delete(appId);
    });
  }

  private handleLine(appId: string, line: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    const event = msg as Record<string, unknown>;
    const running = this.agents.get(appId);

    switch (event.type) {
      case "agent_start":
        if (running) running.streaming = true;
        this.browserPreview?.setAgentActive?.(appId, true);
        this.onEvent(appId, { type: "agent_start" });
        break;
      case "agent_end":
        if (running) running.streaming = false;
        this.browserPreview?.setAgentActive?.(appId, false);
        this.onEvent(appId, { type: "agent_end" });
        break;
      case "message_start":
        this.onEvent(appId, { type: "message_start" });
        break;
      case "message_end":
        this.onEvent(appId, { type: "message_end" });
        break;
      case "message_update": {
        const delta = event.assistantMessageEvent as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.delta === "string") {
          this.onEvent(appId, { type: "text_delta", delta: delta.delta });
        }
        break;
      }
      case "message": {
        const message = event.message;
        if (isRecord(message) && message.role === "assistant") {
          const errorMessage = readString(message.errorMessage);
          if (errorMessage) this.onEvent(appId, { type: "error", message: errorMessage });
          this.enqueueToolDetails(appId, message);
          const tokenUsage = readAgentTokenUsageEvent(event);
          if (tokenUsage) {
            this.onEvent(appId, {
              type: "token_usage",
              usageId: tokenUsage.usageId,
              createdAt: tokenUsage.createdAt,
              usage: tokenUsage.usage,
            });
          }
        }
        break;
      }
      case "tool_execution_start": {
        const toolName = String(event.toolName ?? "tool");
        this.onEvent(appId, {
          type: "tool_start",
          toolName,
          label: kidToolLabel(toolName),
          detail: this.shiftToolDetail(appId, toolName),
        });
        break;
      }
      case "tool_execution_end":
        this.onEvent(appId, {
          type: "tool_end",
          toolName: String(event.toolName ?? "tool"),
          isError: Boolean(event.isError),
        });
        break;
      case "extension_ui_request": {
        const request = normalizeExtensionUiRequest(event);
        if (request) this.onEvent(appId, { type: "extension_ui_request", request });
        break;
      }
      default:
        break;
    }
  }

  private enqueueToolDetails(appId: string, message: Record<string, unknown>): void {
    const content = message.content;
    if (!Array.isArray(content)) return;

    const details = content
      .filter(isRecord)
      .filter((item) => item.type === "toolCall" && typeof item.name === "string")
      .map((item): PendingToolDetail => ({
        toolName: item.name as string,
        detail: toolCallDetail(item.name as string, item.arguments),
      }));
    if (details.length === 0) return;

    const current = this.pendingToolDetails.get(appId) ?? [];
    this.pendingToolDetails.set(appId, [...current, ...details]);
  }

  private shiftToolDetail(appId: string, toolName: string): string | undefined {
    const details = this.pendingToolDetails.get(appId);
    if (!details || details.length === 0) return undefined;

    const index = details.findIndex((detail) => detail.toolName === toolName);
    if (index === -1) return undefined;

    const [detail] = details.splice(index, 1);
    if (details.length === 0) {
      this.pendingToolDetails.delete(appId);
    } else {
      this.pendingToolDetails.set(appId, details);
    }
    return detail?.detail;
  }

  isStreaming(appId: string): boolean {
    return this.agents.get(appId)?.streaming ?? false;
  }

  prompt(appId: string, text: string, images: AgentImageContent[] = []): void {
    const running = this.agents.get(appId);
    if (!running) return;
    running.send(buildPromptCommand(text, images, running.streaming));
  }

  abort(appId: string): void {
    this.browserPreview?.setAgentActive?.(appId, false);
    this.agents.get(appId)?.send({ type: "abort" });
  }

  async clearSession(appId: string, appDir: string): Promise<void> {
    await this.stop(appId);

    const sessionsDir = path.join(appDir, ".pi", "sessions");
    let entries: string[];
    try {
      entries = await fs.readdir(sessionsDir);
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }

    const sessionId = sessionIdFor(appId);
    await Promise.all(
      entries
        .filter((entry) => isSessionEntry(entry, sessionId))
        .map((entry) => fs.rm(path.join(sessionsDir, entry), { recursive: true, force: true })),
    );
  }

  respondToExtensionUi(appId: string, response: ExtensionUiResponse): void {
    this.agents.get(appId)?.send({ type: "extension_ui_response", ...response });
  }

  async stop(appId: string): Promise<void> {
    const running = this.agents.get(appId);
    if (!running) return;
    this.browserPreview?.setAgentActive?.(appId, false);
    const stopped = waitForExit(running.process, STOP_TIMEOUT_MS);
    running.process.kill("SIGTERM");
    running.cleanup();
    this.agents.delete(appId);
    this.pendingToolDetails.delete(appId);
    await stopped;
  }

  stopAll(): void {
    for (const id of [...this.agents.keys()]) void this.stop(id);
  }
}

export function buildPromptCommand(
  text: string,
  images: AgentImageContent[] = [],
  streaming: boolean = false,
): PromptCommand {
  const command: PromptCommand = { type: "prompt", message: text };
  if (images.length > 0) command.images = images;
  if (streaming) command.streamingBehavior = "steer";
  return command;
}

export function buildAgentPath(options: {
  appDir: string;
  nodeBin: string;
  bunBin: string;
  inheritedPath?: string;
}): string {
  const entries = [
    path.dirname(options.nodeBin),
    miniAppBunWrapperDir(options.appDir),
    path.dirname(options.bunBin),
    path.join(options.appDir, "node_modules", ".bin"),
    ...(options.inheritedPath?.split(path.delimiter) ?? []),
  ];
  return [...new Set(entries.filter((entry) => entry.length > 0))].join(path.delimiter);
}

function sessionIdFor(appId: string): string {
  return `felix-${appId}`;
}

function isSessionEntry(entry: string, sessionId: string): boolean {
  return (
    entry === sessionId ||
    entry.startsWith(`${sessionId}.`) ||
    entry.endsWith(`_${sessionId}`) ||
    entry.endsWith(`_${sessionId}.json`) ||
    entry.endsWith(`_${sessionId}.jsonl`)
  );
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
}

function toolCallDetail(toolName: string, args: unknown): string | undefined {
  const normalizedName = toolName.toLowerCase();
  const record = isRecord(args) ? args : {};
  const appName = readString(record.name);
  const targetPath = readString(record.path) ?? readString(record.filePath) ?? readString(record.file);
  const command = readString(record.command) ?? readString(record.cmd);
  const query = readString(record.query) ?? readString(record.pattern);
  const x = readNumber(record.x);
  const y = readNumber(record.y);

  if (normalizedName.includes("set_app_metadata")) {
    return appName ? `Saved ${shortenToolText(appName)}` : "Saved app details";
  }
  if (normalizedName === "browser_screenshot") return "Looked at the preview";
  if (normalizedName === "browser_snapshot") return "Read the preview";
  if (normalizedName === "browser_logs") return "Checked preview errors";
  if (normalizedName === "browser_reload") return "Reloaded the preview";
  if (normalizedName === "browser_click") {
    return x !== undefined && y !== undefined ? `Clicked ${Math.round(x)}, ${Math.round(y)}` : "Clicked the preview";
  }
  if (normalizedName === "browser_move_cursor") {
    return x !== undefined && y !== undefined ? `Moved to ${Math.round(x)}, ${Math.round(y)}` : "Moved around";
  }
  if (normalizedName === "browser_type") return "Typed in the preview";
  if (normalizedName === "browser_key") return "Pressed a key";
  if (normalizedName === "browser_scroll") return "Scrolled the preview";
  if (normalizedName.includes("read") || normalizedName === "cat") {
    return targetPath ? `Read ${shortenToolText(targetPath)}` : "Read a file";
  }
  if (normalizedName.includes("write")) {
    return targetPath ? `Wrote ${shortenToolText(targetPath)}` : "Wrote a file";
  }
  if (normalizedName.includes("edit") || normalizedName.includes("patch")) {
    return targetPath ? `Edited ${shortenToolText(targetPath)}` : "Edited a file";
  }
  if (normalizedName.includes("bash") || normalizedName.includes("shell") || normalizedName.includes("run") || normalizedName.includes("exec")) {
    return command ? `Ran ${shortenToolText(command)}` : "Ran a command";
  }
  if (normalizedName.includes("grep") || normalizedName.includes("search") || normalizedName.includes("find")) {
    if (query && targetPath) return `Searched ${shortenToolText(targetPath)} for ${shortenToolText(query)}`;
    if (query) return `Searched for ${shortenToolText(query)}`;
    if (targetPath) return `Searched ${shortenToolText(targetPath)}`;
    return "Searched the workspace";
  }
  if (normalizedName.includes("list") || normalizedName.includes("glob")) {
    return targetPath ? `Explored ${shortenToolText(targetPath)}` : "Explored the workspace";
  }
  return undefined;
}

function shortenToolText(value: string): string {
  const normalized = value.replaceAll("\\", "/").trim();
  if (normalized.length <= 80) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length >= 3) return `.../${parts.slice(-3).join("/")}`;
  return `${normalized.slice(0, 77)}...`;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeExtensionUiRequest(
  event: Record<string, unknown>,
): Extract<AgentEvent, { type: "extension_ui_request" }>["request"] | null {
  if (typeof event.id !== "string" || typeof event.method !== "string") return null;
  const request: Extract<AgentEvent, { type: "extension_ui_request" }>["request"] = {
    id: event.id,
    method: event.method,
  };
  for (const key of [
    "title",
    "message",
    "placeholder",
    "prefill",
    "notifyType",
    "statusKey",
    "statusText",
    "widgetKey",
    "text",
  ] as const) {
    const value = event[key];
    if (typeof value === "string") request[key] = value as never;
  }
  if (Array.isArray(event.options)) {
    request.options = event.options.filter((v): v is string => typeof v === "string");
  }
  if (Array.isArray(event.widgetLines)) {
    request.widgetLines = event.widgetLines.filter((v): v is string => typeof v === "string");
  }
  if (typeof event.timeout === "number" && Number.isFinite(event.timeout)) {
    request.timeout = event.timeout;
  }
  return request;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readAgentTokenUsageEvent(
  event: Record<string, unknown>,
): { usageId: string; createdAt: string; usage: TokenUsageData } | null {
  if (event.type !== "message" || !isRecord(event.message)) return null;

  const message = event.message;
  if (message.role !== "assistant") return null;

  const usage =
    readTokenUsage(message.usage) ??
    readTokenUsage(message.tokenUsage) ??
    readTokenUsage(event.usage) ??
    readTokenUsage(event.tokenUsage);
  if (!usage) return null;

  const usageId =
    readString(event.id) ??
    readString(message.responseId) ??
    readString(event.responseId) ??
    readString(message.id);
  if (!usageId) return null;

  return {
    usageId,
    createdAt: readTimestamp(event.timestamp) ?? readTimestamp(message.timestamp) ?? new Date().toISOString(),
    usage,
  };
}

function readTokenUsage(value: unknown): TokenUsageData | null {
  if (!isRecord(value)) return null;

  const input = readUsageInteger(value, ["input", "inputTokens", "input_tokens", "prompt_tokens"]);
  const output = readUsageInteger(value, [
    "output",
    "outputTokens",
    "output_tokens",
    "completion_tokens",
  ]);
  const cacheRead = readUsageInteger(value, [
    "cacheRead",
    "cache_read",
    "cachedTokens",
    "cached_tokens",
    "cache_read_input_tokens",
  ]);
  const cacheWrite = readUsageInteger(value, [
    "cacheWrite",
    "cache_write",
    "cache_write_input_tokens",
  ]);
  const totalTokens =
    readUsageInteger(value, ["totalTokens", "total_tokens"]) ??
    (input ?? 0) + (output ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0);

  if (totalTokens <= 0) return null;

  return TokenUsage.parse({
    input: input ?? 0,
    output: output ?? 0,
    cacheRead: cacheRead ?? 0,
    cacheWrite: cacheWrite ?? 0,
    totalTokens,
  });
}

function readUsageInteger(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.trunc(value);
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }
  }
  return null;
}

function readTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearTimeout(killTimeout);
      child.off("exit", finish);
      resolve();
    };
    const killTimeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const timeout = setTimeout(finish, timeoutMs + 500);
    child.once("exit", finish);
    if (child.exitCode !== null || child.signalCode !== null) finish();
  });
}
