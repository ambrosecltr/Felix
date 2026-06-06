import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import {
  type AgentEvent,
  type ChatAttachment,
  type ChatAttachmentInput,
  type ChatTurn,
  type Checkpoint,
  MAX_CHAT_ATTACHMENT_BYTES,
  type MiniAppManifest,
  type MiniAppStatus,
  type MiniAppSummary,
  type ProviderModelsRequest,
  type PushEvent,
} from "@felix/contracts";
import * as git from "@felix/shared/git";
import { newId, slugify } from "@felix/shared/ids";
import { felixPaths, miniAppPaths } from "@felix/shared/paths";
import { templateFiles } from "@felix/mini-app-template/files";
import { AgentManager } from "./agentManager.ts";
import { bundledBunPath, resolveBun } from "./bunRuntime.ts";
import { ChatStore } from "./chatStore.ts";
import { bundledNodePath, resolveMiniAppNode } from "./nodeRuntime.ts";
import { listProviderModels } from "./providerModels.ts";
import { resolvePiPackageDir } from "./resolvePi.ts";
import { SettingsStore } from "./settingsStore.ts";
import { ViteManager } from "./viteManager.ts";

export interface MiniAppManagerOptions {
  /** Directory containing bundled resources (e.g. a standalone Node runtime). */
  resourcesDir?: string;
}

type Emit = (event: PushEvent) => void;
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const DELETE_MAX_RETRIES = 10;
const DELETE_RETRY_DELAY_MS = 100;

export class MiniAppManager {
  private readonly paths = felixPaths();
  private readonly settings = new SettingsStore();
  private readonly vite: ViteManager;
  private readonly agent: AgentManager;
  private statuses = new Map<string, MiniAppStatus>();
  private chatStores = new Map<string, ChatStore>();
  private persistQueues = new Map<string, Promise<void>>();
  private aboutWatchers = new Map<string, FSWatcher>();
  private aboutDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly bunBin: string;

  constructor(
    private readonly piBinPath: string,
    private readonly emit: Emit,
    options: MiniAppManagerOptions = {},
  ) {
    const nodeBin = resolveMiniAppNode({
      bundledNodePath: options.resourcesDir
        ? bundledNodePath(options.resourcesDir)
        : undefined,
    });
    this.bunBin = resolveBun({
      bundledBunPath: options.resourcesDir
        ? bundledBunPath(options.resourcesDir)
        : undefined,
    });
    this.vite = new ViteManager(nodeBin);
    const piExtensionPaths = ["pi-nvidia-nim", "pi-opencode-bridge"]
      .map((packageName) => resolvePiPackageDir(packageName, options.resourcesDir))
      .filter((extensionPath): extensionPath is string => extensionPath !== null);
    this.agent = new AgentManager(
      this.paths.root,
      this.piBinPath,
      nodeBin,
      (appId, event) => this.handleAgentEvent(appId, event),
      () => this.settings.get(),
      piExtensionPaths,
    );
  }

  // --- status helpers ---

  private setStatus(appId: string, status: MiniAppStatus): void {
    this.statuses.set(appId, status);
    this.emit({ kind: "status", appId, status, devUrl: this.vite.getUrl(appId) });
  }

  private getStatus(appId: string): MiniAppStatus {
    return this.statuses.get(appId) ?? (this.vite.isRunning(appId) ? "running" : "idle");
  }

  private appDir(appId: string): string {
    return miniAppPaths(this.paths.apps, appId).root;
  }

  // --- manifests ---

  private async readManifest(appId: string): Promise<MiniAppManifest | null> {
    try {
      const raw = await fs.readFile(miniAppPaths(this.paths.apps, appId).manifestFile, "utf8");
      return JSON.parse(raw) as MiniAppManifest;
    } catch {
      return null;
    }
  }

  private async writeManifest(manifest: MiniAppManifest): Promise<void> {
    await fs.writeFile(
      miniAppPaths(this.paths.apps, manifest.id).manifestFile,
      JSON.stringify(manifest, null, 2),
      "utf8",
    );
  }

  private toSummary(manifest: MiniAppManifest): MiniAppSummary {
    return {
      ...manifest,
      status: this.getStatus(manifest.id),
      devUrl: this.vite.getUrl(manifest.id),
    };
  }

  // --- public API ---

  async list(): Promise<MiniAppSummary[]> {
    await fs.mkdir(this.paths.apps, { recursive: true });
    const entries = await fs.readdir(this.paths.apps, { withFileTypes: true });
    const summaries: MiniAppSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await this.readManifest(entry.name);
      if (manifest) summaries.push(this.toSummary(manifest));
    }
    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return summaries;
  }

  async create(prompt: string): Promise<MiniAppSummary> {
    const id = `${slugify(prompt)}-${newId("").slice(1, 7)}`;
    const dir = this.appDir(id);
    await fs.mkdir(dir, { recursive: true });

    const name = this.deriveName(prompt);
    const now = new Date().toISOString();
    const manifest: MiniAppManifest = {
      id,
      name,
      emoji: "🚀",
      createdAt: now,
      updatedAt: now,
      devPort: null,
    };

    try {
      this.setStatus(id, "scaffolding");
      for (const file of templateFiles({ name })) {
        const filePath = path.join(dir, file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, "utf8");
      }
      await this.writeManifest(manifest);

      await git.initRepo(dir);
      await git.checkpoint(dir, "First version of your app", "system");

      this.setStatus(id, "installing");
      await this.installDeps(dir);

      this.setStatus(id, "starting");
      manifest.devPort = await this.startVite(id, dir);

      return this.toSummary(manifest);
    } catch (err) {
      this.statuses.delete(id);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  async open(appId: string): Promise<MiniAppSummary> {
    const manifest = await this.readManifest(appId);
    if (!manifest) throw new Error(`Mini app not found: ${appId}`);
    if (!this.vite.isRunning(appId)) {
      this.setStatus(appId, "starting");
      manifest.devPort = await this.startVite(appId, this.appDir(appId));
    }
    await this.agent.start(appId, this.appDir(appId), manifest.name);
    this.watchAbout(appId);
    return this.toSummary(manifest);
  }

  async stop(appId: string): Promise<void> {
    await Promise.all([this.agent.stop(appId), this.vite.stop(appId)]);
    this.unwatchAbout(appId);
    this.setStatus(appId, "stopped");
  }

  async delete(appId: string): Promise<void> {
    const dir = this.appDir(appId);
    await this.stop(appId);
    await this.persistQueues.get(appId)?.catch(() => {});
    this.chatStores.delete(appId);
    this.persistQueues.delete(appId);
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: DELETE_MAX_RETRIES,
      retryDelay: DELETE_RETRY_DELAY_MS,
    });
    this.statuses.delete(appId);
  }

  // --- name & emoji (agent-controlled via .felix/about.json) ---

  private watchAbout(appId: string): void {
    if (this.aboutWatchers.has(appId)) return;
    const file = miniAppPaths(this.paths.apps, appId).aboutFile;
    try {
      const watcher = watch(file, () => {
        const existing = this.aboutDebounce.get(appId);
        if (existing) clearTimeout(existing);
        this.aboutDebounce.set(
          appId,
          setTimeout(() => void this.syncAboutFile(appId), 150),
        );
      });
      watcher.on("error", () => this.unwatchAbout(appId));
      this.aboutWatchers.set(appId, watcher);
    } catch {
      /* file may not exist yet; agent_end fallback will still sync */
    }
  }

  private unwatchAbout(appId: string): void {
    this.aboutWatchers.get(appId)?.close();
    this.aboutWatchers.delete(appId);
    const debounce = this.aboutDebounce.get(appId);
    if (debounce) clearTimeout(debounce);
    this.aboutDebounce.delete(appId);
  }

  private async syncAboutFile(appId: string): Promise<void> {
    const file = miniAppPaths(this.paths.apps, appId).aboutFile;
    let about: { name?: unknown; emoji?: unknown };
    try {
      about = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return;
    }
    const manifest = await this.readManifest(appId);
    if (!manifest) return;

    let changed = false;
    if (typeof about.name === "string") {
      const name = about.name.trim().slice(0, 40);
      if (name.length > 0 && name !== manifest.name) {
        manifest.name = name;
        changed = true;
      }
    }
    if (typeof about.emoji === "string") {
      const emoji = firstGrapheme(about.emoji.trim());
      if (emoji.length > 0 && emoji !== manifest.emoji) {
        manifest.emoji = emoji;
        changed = true;
      }
    }
    if (!changed) return;

    manifest.updatedAt = new Date().toISOString();
    await this.writeManifest(manifest);
    this.emit({ kind: "miniAppUpdated", appId, summary: this.toSummary(manifest) });
  }

  // --- chat ---

  private chatStore(appId: string): ChatStore {
    const existing = this.chatStores.get(appId);
    if (existing) return existing;
    const store = new ChatStore(miniAppPaths(this.paths.apps, appId).chatFile);
    this.chatStores.set(appId, store);
    return store;
  }

  async chatHistory(appId: string): Promise<ChatTurn[]> {
    return this.chatStore(appId).list();
  }

  async sendChat(
    appId: string,
    text: string,
    attachmentInputs: ChatAttachmentInput[] = [],
  ): Promise<void> {
    const dir = this.appDir(appId);
    const manifest = await this.readManifest(appId);
    if (!manifest) throw new Error(`Mini app not found: ${appId}`);

    const attachments = await this.persistChatAttachments(dir, attachmentInputs);
    await this.agent.start(appId, dir, manifest.name);

    const store = this.chatStore(appId);
    const kidTurn = await store.appendKidTurn(text, attachments);
    this.emit({ kind: "chatTurn", appId, turn: kidTurn });

    await git.checkpoint(dir, checkpointMessage(text, attachments), "kid");

    manifest.updatedAt = new Date().toISOString();
    await this.writeManifest(manifest);

    this.agent.prompt(appId, promptWithAttachments(text, attachments));
  }

  private async persistChatAttachments(
    appDir: string,
    inputs: ChatAttachmentInput[],
  ): Promise<ChatAttachment[]> {
    if (inputs.length === 0) return [];

    const attachments: ChatAttachment[] = [];
    const attachmentsDir = path.join(appDir, ".felix", "attachments");
    await fs.mkdir(attachmentsDir, { recursive: true });

    for (const input of inputs) {
      const bytes = Buffer.from(input.dataBase64, "base64");
      if (bytes.byteLength !== input.size) {
        throw new Error(`Attachment size mismatch for ${input.name}`);
      }
      if (bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
        throw new Error(`Attachment is too large: ${input.name}`);
      }

      const id = newId("attachment");
      const safeName = safeAttachmentName(input.name);
      const attachmentDir = path.join(attachmentsDir, id);
      const filePath = path.join(attachmentDir, safeName);
      await fs.mkdir(attachmentDir, { recursive: true });
      await fs.writeFile(filePath, bytes);

      attachments.push({
        id,
        name: input.name,
        mimeType: input.mimeType || "application/octet-stream",
        size: input.size,
        relativePath: toPosixPath(path.relative(appDir, filePath)),
      });
    }

    return attachments;
  }

  abortChat(appId: string): void {
    this.agent.abort(appId);
  }

  respondToAgentUi(appId: string, response: Parameters<AgentManager["respondToExtensionUi"]>[1]): void {
    this.agent.respondToExtensionUi(appId, response);
  }

  // --- checkpoints ---

  async listCheckpoints(appId: string): Promise<Checkpoint[]> {
    return git.listCheckpoints(this.appDir(appId));
  }

  async restoreCheckpoint(appId: string, checkpointId: string): Promise<void> {
    await git.restoreCheckpoint(this.appDir(appId), checkpointId);
  }

  // --- settings ---

  getSettings() {
    return this.settings.get();
  }

  setSettings(next: Parameters<SettingsStore["set"]>[0]) {
    return this.settings.set(next);
  }

  listProviderModels(request: ProviderModelsRequest) {
    return listProviderModels(request);
  }

  // --- internals ---

  private deriveName(prompt: string): string {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return "My App";
    const words = trimmed.split(/\s+/).slice(0, 4).join(" ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  private async installDeps(dir: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child: ChildProcess = spawn(this.bunBin, ["install"], {
        cwd: dir,
        stdio: "ignore",
        env: { ...process.env },
      });
      let finished = false;
      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        child.kill("SIGTERM");
        reject(new Error(`bun install timed out after ${INSTALL_TIMEOUT_MS / 1000}s`));
      }, INSTALL_TIMEOUT_MS);
      const finish = (fn: () => void) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        child.removeAllListeners("exit");
        child.removeAllListeners("error");
        fn();
      };
      child.once("exit", (code) => {
        finish(() => {
          if (code === 0) resolve();
          else reject(new Error(`Install failed with code ${code}`));
        });
      });
      child.once("error", (err) => finish(() => reject(err)));
    });
  }

  private async startVite(appId: string, dir: string): Promise<number> {
    try {
      const { port } = await this.vite.start(appId, dir);
      const manifest = await this.readManifest(appId);
      if (manifest) {
        manifest.devPort = port;
        await this.writeManifest(manifest);
      }
      this.setStatus(appId, "running");
      return port;
    } catch (err) {
      this.setStatus(appId, "error");
      throw err;
    }
  }

  private handleAgentEvent(appId: string, event: AgentEvent): void {
    this.emit({ kind: "agent", appId, event });
    if (event.type !== "extension_ui_request") this.enqueuePersist(appId, event);
  }

  /**
   * Persists turn updates one at a time per app so the on-disk turn assembled
   * from the live stream stays consistent (events fire faster than awaits).
   */
  private enqueuePersist(appId: string, event: AgentEvent): void {
    const prev = this.persistQueues.get(appId) ?? Promise.resolve();
    const next = prev.then(() => this.persistTurn(appId, event)).catch(() => {});
    this.persistQueues.set(appId, next);
  }

  private async persistTurn(appId: string, event: AgentEvent): Promise<void> {
    const store = this.chatStore(appId);
    switch (event.type) {
      case "agent_start":
        await store.startFelixTurn();
        return;
      case "text_delta":
        await store.appendText(event.delta);
        return;
      case "tool_start":
        await store.addStep({
          type: "tool",
          toolName: event.toolName,
          label: event.label ?? event.toolName,
          detail: event.detail,
        });
        return;
      case "tool_end":
        await store.markToolEnd(event.toolName, event.isError);
        return;
      case "agent_end":
        await store.finishTurn("done");
        await this.syncAboutFile(appId);
        return;
      case "error":
        await store.failFelixTurn(`Oops, something went wrong. ${event.message}`);
        return;
      default:
        return;
    }
  }

  shutdown(): void {
    this.agent.stopAll();
    this.vite.stopAll();
    for (const appId of [...this.aboutWatchers.keys()]) this.unwatchAbout(appId);
  }
}

/** Returns the first user-perceived character (emoji), handling surrogates/ZWJ. */
function firstGrapheme(input: string): string {
  if (input.length === 0) return "";
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const segmenter = new Seg();
    for (const { segment } of segmenter.segment(input)) return segment;
  }
  return [...input][0] ?? "";
}

function safeAttachmentName(name: string): string {
  const baseName = path.basename(name).trim();
  const sanitized = baseName
    .replace(/[/\\]/g, "_")
    .replace(/[^\w .()@+-]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 160)
    .trim();
  return sanitized.length > 0 ? sanitized : "attachment";
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function promptWithAttachments(text: string, attachments: ChatAttachment[]): string {
  const trimmed = text.trim();
  if (attachments.length === 0) return trimmed;

  const attachmentLines = attachments
    .map(
      (attachment) =>
        `- ${attachment.name} (${attachment.mimeType}, ${formatBytes(attachment.size)}): ${attachment.relativePath}`,
    )
    .join("\n");

  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
  return `${prefix}Attached files are saved in this app workspace:\n${attachmentLines}\n\nRead those files as needed before making changes.`;
}

function checkpointMessage(text: string, attachments: ChatAttachment[]): string {
  const trimmed = text.trim();
  const label = trimmed.length > 0 ? trimmed : `${attachments.length} attached file(s)`;
  return `Before: ${label.slice(0, 60)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
