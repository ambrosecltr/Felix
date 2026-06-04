import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { AgentEvent, ExtensionUiResponse, FelixSettings } from "@felix/contracts";
import { FELIX_SYSTEM_PROMPT, felixWorkspaceFiles } from "./agentPrompt.ts";
import { providerEnv, writeProviderConfig } from "./providerConfig.ts";
import { buildSeatbeltProfile, isSandboxAvailable, wrapWithSandbox } from "./sandbox.ts";

type EventSink = (appId: string, event: AgentEvent) => void;
const MAX_JSONL_BUFFER_CHARS = 1024 * 1024;
const STOP_TIMEOUT_MS = 2_000;

/** Maps raw PI tool names to friendly labels kids can understand. */
function kidToolLabel(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes("read") || name === "cat") return "Reading your code…";
  if (name.includes("write") || name.includes("edit") || name.includes("patch")) {
    return "Writing your code…";
  }
  if (name.includes("bash") || name.includes("shell") || name.includes("run") || name.includes("exec")) {
    return "Running it…";
  }
  if (name.includes("list") || name.includes("glob") || name.includes("grep") || name.includes("search") || name.includes("find")) {
    return "Looking around…";
  }
  return "Working…";
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

  constructor(
    private readonly rootDir: string,
    private readonly piBinPath: string,
    private readonly nodeBin: string,
    private readonly onEvent: EventSink,
    private readonly getSettings: () => Promise<FelixSettings>,
  ) {}

  private async ensureWorkspaceFiles(appDir: string, appName: string): Promise<string> {
    const piDir = path.join(appDir, ".pi");
    await fs.mkdir(piDir, { recursive: true });
    for (const file of felixWorkspaceFiles(appName)) {
      const filePath = path.join(appDir, file.path);
      if (file.overwrite === false && (await fileExists(filePath))) continue;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, "utf8");
    }
    return piDir;
  }

  private async writeSandboxProfile(appDir: string, allowNetwork: boolean): Promise<string> {
    const profile = buildSeatbeltProfile({ appDir, allowNetwork });
    const profilePath = path.join(appDir, ".pi", `sandbox-${process.pid}.sb`);
    await fs.writeFile(profilePath, profile, { encoding: "utf8", mode: 0o600 });
    return profilePath;
  }

  async start(appId: string, appDir: string, appName: string): Promise<void> {
    if (this.agents.has(appId)) return;

    const settings = await this.getSettings();
    await this.ensureWorkspaceFiles(appDir, appName);

    const agentDir = path.join(this.rootDir, "agent");
    const sessionDir = path.join(appDir, ".pi", "sessions");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(sessionDir, { recursive: true });
    await writeProviderConfig(agentDir, settings);

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
      `felix-${appId}`,
    ];

    // Run pi with a real Node runtime (never process.execPath, which is the
    // Electron binary in production and would relaunch the GUI).
    let command = this.nodeBin;
    let args = [this.piBinPath, ...piArgs];
    let sandboxProfilePath: string | null = null;

    if (isSandboxAvailable()) {
      sandboxProfilePath = await this.writeSandboxProfile(appDir, settings.sandboxAllowNetwork);
      ({ command, args } = wrapWithSandbox(sandboxProfilePath, command, args));
    }

    const child = spawn(command, args, {
      cwd: appDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...providerEnv(settings),
        PI_AGENT_DIR: agentDir,
        IMPECCABLE_NO_UPDATE_CHECK: "1",
        FELIX_SYSTEM_PROMPT,
      },
    });

    const send = (cmd: object) => {
      if (!child.stdin || child.stdin.destroyed) return;
      child.stdin.write(`${JSON.stringify(cmd)}\n`);
    };
    const cleanup = () => {
      if (sandboxProfilePath) void fs.rm(sandboxProfilePath, { force: true }).catch(() => {});
    };
    const running: RunningAgent = { process: child, send, streaming: false, cleanup };
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
        this.onEvent(appId, { type: "agent_start" });
        break;
      case "agent_end":
        if (running) running.streaming = false;
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
      case "tool_execution_start": {
        const toolName = String(event.toolName ?? "tool");
        this.onEvent(appId, {
          type: "tool_start",
          toolName,
          label: kidToolLabel(toolName),
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

  isStreaming(appId: string): boolean {
    return this.agents.get(appId)?.streaming ?? false;
  }

  prompt(appId: string, text: string): void {
    const running = this.agents.get(appId);
    if (!running) return;
    if (running.streaming) {
      running.send({ type: "prompt", message: text, streamingBehavior: "steer" });
    } else {
      running.send({ type: "prompt", message: text });
    }
  }

  abort(appId: string): void {
    this.agents.get(appId)?.send({ type: "abort" });
  }

  respondToExtensionUi(appId: string, response: ExtensionUiResponse): void {
    this.agents.get(appId)?.send({ type: "extension_ui_response", ...response });
  }

  async stop(appId: string): Promise<void> {
    const running = this.agents.get(appId);
    if (!running) return;
    const stopped = waitForExit(running.process, STOP_TIMEOUT_MS);
    running.process.kill("SIGTERM");
    running.cleanup();
    this.agents.delete(appId);
    await stopped;
  }

  stopAll(): void {
    for (const id of [...this.agents.keys()]) void this.stop(id);
  }
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
