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
  FelixSettings,
  MAX_CHAT_ATTACHMENT_BYTES,
  MiniAppManifest,
  PROVIDER_CATALOG_BY_ID,
  type MiniAppStatus,
  type MiniAppSummary,
  type MiniAppIconDataResponse,
  type ProviderInputModality,
  type ProviderModelsRequest,
  type PushEvent,
  type SettingsLockdownSetRequest,
  type SettingsLockdownVerifyRequest,
  type SetProfileNameRequest,
} from "@felix/contracts";
import * as git from "@felix/shared/git";
import { newId, slugify } from "@felix/shared/ids";
import { felixPaths, miniAppPaths } from "@felix/shared/paths";
import { templateFiles } from "@felix/mini-app-template/files";
import { AgentManager, readAgentTokenUsageEvent } from "./agentManager.ts";
import { bundledBunPath, resolveBun } from "./bunRuntime.ts";
import {
  type AttachmentImagePromptNote,
  prepareAttachmentImages,
  type ResizeImage,
  supportsNativeImageInput,
} from "./chatAttachmentImages.ts";
import { ChatStore } from "./chatStore.ts";
import {
  checkIconGenerationSetup,
  generateMiniAppIcon,
  iconGenerationApiKey,
} from "./iconGeneration.ts";
import { bundledNodePath, resolveMiniAppNode } from "./nodeRuntime.ts";
import { listProviderModels } from "./providerModels.ts";
import { ProfileStore } from "./profileStore.ts";
import { resolvePiPackageDir } from "./resolvePi.ts";
import { SettingsStore } from "./settingsStore.ts";
import { ViteManager } from "./viteManager.ts";
import {
  hashLockdownPin,
  hasConfiguredLockdownPin,
  verifyLockdownPin,
} from "./lockdown.ts";
import { normalizeWebSearchSettings } from "./webSearchConfig.ts";
import { miniAppBunfig, miniAppBunInstallArgs } from "./packageInstallPolicy.ts";

export interface MiniAppManagerOptions {
  /** Directory containing bundled resources (e.g. a standalone Node runtime). */
  resourcesDir?: string;
  /** Optional platform image resizer for model-native image attachments. */
  resizeImage?: ResizeImage;
}

type Emit = (event: PushEvent) => void;
type AgentTokenUsageEvent = NonNullable<ReturnType<typeof readAgentTokenUsageEvent>>;
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const DELETE_MAX_RETRIES = 10;
const DELETE_RETRY_DELAY_MS = 100;
const ICON_FILE_BASE_NAME = "icon";
const ICON_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class MiniAppManager {
  private readonly paths = felixPaths();
  private readonly settings = new SettingsStore();
  private readonly profile = new ProfileStore(this.paths.profileFile, this.paths.tokenUsageFile);
  private readonly vite: ViteManager;
  private readonly agent: AgentManager;
  private statuses = new Map<string, MiniAppStatus>();
  private chatStores = new Map<string, ChatStore>();
  private persistQueues = new Map<string, Promise<void>>();
  private aboutWatchers = new Map<string, FSWatcher>();
  private aboutDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  private iconGenerationRequests = new Map<string, string>();
  private iconGenerationRunning = new Set<string>();
  private readonly bunBin: string;
  private readonly resizeImage: ResizeImage | undefined;

  constructor(
    private readonly piBinPath: string,
    private readonly emit: Emit,
    options: MiniAppManagerOptions = {},
  ) {
    this.resizeImage = options.resizeImage;
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
    const piExtensionPaths = [
      "@juicesharp/rpiv-web-tools",
      "pi-nvidia-nim",
      "pi-opencode-bridge",
    ]
      .map((packageName) => resolvePiPackageDir(packageName, options.resourcesDir))
      .filter((extensionPath): extensionPath is string => extensionPath !== null);
    this.agent = new AgentManager(
      this.paths.root,
      this.piBinPath,
      nodeBin,
      this.bunBin,
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
      return MiniAppManifest.parse(JSON.parse(raw));
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
      appDescription: "",
      icon: null,
      iconError: null,
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
      await this.writeInstallPolicy(dir);

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
    await this.writeInstallPolicy(this.appDir(appId));
    if (!this.vite.isRunning(appId)) {
      this.setStatus(appId, "starting");
      manifest.devPort = await this.startVite(appId, this.appDir(appId));
    }
    await this.agent.start(appId, this.appDir(appId), manifest.name);
    this.watchAbout(appId);
    return this.toSummary(manifest);
  }

  async iconData(appId: string): Promise<MiniAppIconDataResponse> {
    const manifest = await this.readManifest(appId);
    if (!manifest?.icon) return { dataUrl: null, generatedAt: null };

    const iconPath = safeAppRelativePath(this.appDir(appId), manifest.icon.relativePath);
    try {
      const bytes = await fs.readFile(iconPath);
      return {
        dataUrl: `data:${manifest.icon.mimeType};base64,${bytes.toString("base64")}`,
        generatedAt: manifest.icon.generatedAt,
      };
    } catch {
      return { dataUrl: null, generatedAt: null };
    }
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
    this.iconGenerationRequests.delete(appId);
    this.iconGenerationRunning.delete(appId);
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: DELETE_MAX_RETRIES,
      retryDelay: DELETE_RETRY_DELAY_MS,
    });
    this.statuses.delete(appId);
  }

  // --- app metadata (agent-controlled via .felix/about.json) ---

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
    let about: { name?: unknown; emoji?: unknown; app_description?: unknown; appDescription?: unknown };
    try {
      about = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return;
    }
    const manifest = await this.readManifest(appId);
    if (!manifest) return;

    let changed = false;
    let descriptionChanged = false;
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
    const rawDescription =
      typeof about.app_description === "string"
        ? about.app_description
        : typeof about.appDescription === "string"
          ? about.appDescription
          : null;
    if (rawDescription !== null) {
      const appDescription = rawDescription.trim().slice(0, 600);
      if (appDescription !== manifest.appDescription) {
        manifest.appDescription = appDescription;
        manifest.iconError = null;
        descriptionChanged = true;
        changed = true;
      }
    }
    if (!changed) return;

    manifest.updatedAt = new Date().toISOString();
    await this.writeManifest(manifest);
    this.emit({ kind: "miniAppUpdated", appId, summary: this.toSummary(manifest) });
    if (descriptionChanged) this.requestIconGeneration(appId, manifest.appDescription);
  }

  private requestIconGeneration(appId: string, description: string): void {
    const trimmedDescription = description.trim();
    if (trimmedDescription.length === 0) return;
    this.iconGenerationRequests.set(appId, trimmedDescription);
    if (!this.iconGenerationRunning.has(appId)) {
      void this.runIconGenerationQueue(appId);
    }
  }

  private async runIconGenerationQueue(appId: string): Promise<void> {
    this.iconGenerationRunning.add(appId);
    try {
      for (;;) {
        const description = this.iconGenerationRequests.get(appId);
        if (!description) return;
        this.iconGenerationRequests.delete(appId);
        await this.generateIconForDescription(appId, description).catch((error: unknown) =>
          this.persistIconError(appId, description, error),
        );
      }
    } finally {
      this.iconGenerationRunning.delete(appId);
      if (this.iconGenerationRequests.has(appId)) void this.runIconGenerationQueue(appId);
    }
  }

  private async generateIconForDescription(appId: string, description: string): Promise<void> {
    const settings = await this.settings.get();
    const apiKey = iconGenerationApiKey(settings);
    if (!apiKey) return;

    const generated = await generateMiniAppIcon(apiKey, description);
    const manifest = await this.readManifest(appId);
    if (!manifest || manifest.appDescription !== description) return;

    const extension = ICON_MIME_EXTENSIONS[generated.mimeType] ?? "jpg";
    const relativePath = `.felix/${ICON_FILE_BASE_NAME}.${extension}`;
    const iconPath = path.join(this.appDir(appId), relativePath);
    await fs.mkdir(path.dirname(iconPath), { recursive: true });
    await fs.writeFile(iconPath, generated.bytes);

    manifest.icon = {
      relativePath: toPosixPath(relativePath),
      mimeType: generated.mimeType,
      generatedAt: new Date().toISOString(),
      description,
    };
    manifest.iconError = null;
    await this.writeManifest(manifest);
    this.emit({ kind: "miniAppUpdated", appId, summary: this.toSummary(manifest) });
  }

  private async persistIconError(appId: string, description: string, error: unknown): Promise<void> {
    const manifest = await this.readManifest(appId);
    if (!manifest || manifest.appDescription !== description) return;
    manifest.iconError = error instanceof Error ? error.message : String(error);
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

  async clearChat(appId: string): Promise<void> {
    const dir = this.appDir(appId);
    const manifest = await this.readManifest(appId);
    if (!manifest) throw new Error(`Mini app not found: ${appId}`);

    await this.agent.clearSession(appId, dir);
    await this.persistQueues.get(appId)?.catch(() => {});
    this.persistQueues.delete(appId);
    await this.chatStore(appId).clear();
    await fs.rm(path.join(dir, ".felix", "attachments"), { recursive: true, force: true });
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
    const settings = await this.settings.get();
    const activeModelInputModalities = await this.resolveActiveModelInputModalities(
      settings,
      attachments,
    );
    if (settings.activeModelInputModalities === null && activeModelInputModalities !== null) {
      await this.restartIdleAgent(appId);
    }
    const preparedImages = await prepareAttachmentImages(
      dir,
      attachments,
      supportsNativeImageInput(activeModelInputModalities),
      this.resizeImage,
    );
    await this.agent.start(appId, dir, manifest.name);

    const store = this.chatStore(appId);
    const kidTurn = await store.appendKidTurn(text, attachments);
    this.emit({ kind: "chatTurn", appId, turn: kidTurn });

    await git.checkpoint(dir, checkpointMessage(text, attachments), "kid");

    manifest.updatedAt = new Date().toISOString();
    await this.writeManifest(manifest);

    this.agent.prompt(
      appId,
      promptWithAttachments(text, attachments, preparedImages.notes),
      preparedImages.images,
    );
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

  private async resolveActiveModelInputModalities(
    settings: FelixSettings,
    attachments: ChatAttachment[],
  ): Promise<ProviderInputModality[] | null> {
    if (!attachments.some((attachment) => attachment.mimeType.startsWith("image/"))) {
      return settings.activeModelInputModalities;
    }
    if (settings.activeModelInputModalities) return settings.activeModelInputModalities;

    const catalogModel = PROVIDER_CATALOG_BY_ID[settings.activeProvider].fallbackModels.find(
      (model) => model.id === settings.activeModel,
    );
    if (catalogModel?.inputModalities) {
      const inputModalities = [...catalogModel.inputModalities];
      await this.rememberActiveModelInputModalities(settings, inputModalities);
      return inputModalities;
    }

    const provider = settings.providers.find((candidate) => candidate.id === settings.activeProvider);
    const response = await listProviderModels({
      providerId: settings.activeProvider,
      apiKey: provider?.apiKey,
      oauthAccessToken: provider?.oauth?.accessToken,
    });
    const activeModel = response.models.find((model) => model.id === settings.activeModel);
    const inputModalities = activeModel?.inputModalities ?? null;
    if (!inputModalities) return null;

    await this.rememberActiveModelInputModalities(settings, inputModalities);
    return inputModalities;
  }

  private async rememberActiveModelInputModalities(
    settings: FelixSettings,
    inputModalities: ProviderInputModality[],
  ): Promise<void> {
    const latest = await this.settings.get();
    if (
      latest.activeProvider === settings.activeProvider &&
      latest.activeModel === settings.activeModel &&
      latest.activeModelInputModalities === null
    ) {
      await this.settings.set({ ...latest, activeModelInputModalities: inputModalities });
    }
  }

  private async restartIdleAgent(appId: string): Promise<void> {
    if (this.agent.isStreaming(appId)) return;
    await this.agent.stop(appId);
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
    if (this.agent.isStreaming(appId)) {
      throw new Error("Wait for Felix to finish before going back to a saved version.");
    }
    await this.persistQueues.get(appId)?.catch(() => {});
    await git.restoreCheckpoint(this.appDir(appId), checkpointId);
    this.chatStores.delete(appId);
    this.persistQueues.delete(appId);
  }

  // --- settings ---

  async getSettings() {
    return redactLockdownSettings(await this.settings.get());
  }

  async setSettings(next: Parameters<SettingsStore["set"]>[0]) {
    const current = await this.settings.get();
    const parsed = FelixSettings.parse(next);
    const normalized = {
      ...parsed,
      iconGeneration: {
        ...parsed.iconGeneration,
        xaiApiKey: parsed.iconGeneration.xaiApiKey.trim(),
      },
      webSearch: normalizeWebSearchSettings(parsed.webSearch),
      lockdown: current.lockdown,
    };
    await checkIconGenerationSetup(normalized);
    return redactLockdownSettings(await this.settings.set(normalized));
  }

  async getLockdownStatus() {
    const settings = await this.settings.get();
    return { enabled: hasConfiguredLockdownPin(settings.lockdown) };
  }

  async setLockdown(request: SettingsLockdownSetRequest) {
    const current = await this.settings.get();
    if (!request.enabled) {
      return redactLockdownSettings(
        await this.settings.set({
          ...current,
          lockdown: { enabled: false, pinHash: "", pinSalt: "" },
        }),
      );
    }

    const pin = request.pin?.trim();
    if (pin) {
      return redactLockdownSettings(
        await this.settings.set({
          ...current,
          lockdown: await hashLockdownPin(pin),
        }),
      );
    }

    if (hasConfiguredLockdownPin(current.lockdown)) {
      return redactLockdownSettings(
        await this.settings.set({
          ...current,
          lockdown: { ...current.lockdown, enabled: true },
        }),
      );
    }

    throw new Error("Enter a 4 digit PIN.");
  }

  async verifyLockdown(request: SettingsLockdownVerifyRequest) {
    const settings = await this.settings.get();
    return { ok: await verifyLockdownPin(request.pin.trim(), settings.lockdown) };
  }

  async getProfileOverview() {
    await this.backfillTokenUsageFromSessions();
    return this.profileOverview();
  }

  async setProfileName(request: SetProfileNameRequest) {
    await this.profile.setName(request.name);
    return this.getProfileOverview();
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
      const child: ChildProcess = spawn(this.bunBin, miniAppBunInstallArgs(), {
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

  private async writeInstallPolicy(dir: string): Promise<void> {
    await fs.writeFile(path.join(dir, "bunfig.toml"), miniAppBunfig(), "utf8");
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
    if (event.type === "token_usage") {
      void this.recordTokenUsage(appId, event);
      return;
    }

    this.emit({ kind: "agent", appId, event });
    if (event.type !== "extension_ui_request") this.enqueuePersist(appId, event);
  }

  private async recordTokenUsage(
    appId: string,
    event: Extract<AgentEvent, { type: "token_usage" }>,
  ): Promise<void> {
    try {
      const didRecord = await this.profile.recordTokenUsage(
        appId,
        event.usageId,
        event.createdAt,
        event.usage,
      );
      if (didRecord) {
        this.emit({ kind: "profileUpdated", profile: await this.profileOverview() });
      }
    } catch (error) {
      console.warn(
        "[felix] failed to record token usage",
        error instanceof Error ? error.message : error,
      );
    }
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
        if (await this.backfillTokenUsageFromSessions([appId])) {
          this.emit({ kind: "profileUpdated", profile: await this.profileOverview() });
        }
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

  private async profileOverview() {
    return this.profile.overview(await this.list());
  }

  private async backfillTokenUsageFromSessions(appIds?: string[]): Promise<boolean> {
    const ids = appIds ?? (await this.listAppIds());
    let didRecord = false;

    for (const appId of ids) {
      const sessionDir = path.join(this.appDir(appId), ".pi", "sessions");
      let files: string[];
      try {
        files = await fs.readdir(sessionDir);
      } catch (error) {
        if (isNotFound(error)) continue;
        throw error;
      }

      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const events = await readSessionTokenUsageEvents(path.join(sessionDir, file));
        for (const event of events) {
          const recorded = await this.profile.recordTokenUsage(
            appId,
            event.usageId,
            event.createdAt,
            event.usage,
          );
          didRecord = didRecord || recorded;
        }
      }
    }

    return didRecord;
  }

  private async listAppIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.paths.apps, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
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

async function readSessionTokenUsageEvents(filePath: string): Promise<AgentTokenUsageEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }

  const events: AgentTokenUsageEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
    const usage = readAgentTokenUsageEvent(parsed as Record<string, unknown>);
    if (usage) events.push(usage);
  }
  return events;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function safeAppRelativePath(appDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error("Mini app icon path must be relative");
  const root = path.resolve(appDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Mini app icon path is outside the app directory");
  }
  return resolved;
}

function redactLockdownSettings(settings: FelixSettings): FelixSettings {
  return {
    ...settings,
    lockdown: {
      ...settings.lockdown,
      pinHash: "",
      pinSalt: "",
    },
  };
}

export function promptWithAttachments(
  text: string,
  attachments: ChatAttachment[],
  imageNotes: AttachmentImagePromptNote[] = [],
): string {
  const trimmed = text.trim();
  if (attachments.length === 0) return trimmed;
  const notesByAttachmentId = groupAttachmentNotes(imageNotes);

  const attachmentLines = attachments
    .map((attachment) => {
      const base = `- ${attachment.name} (${attachment.mimeType}, ${formatBytes(attachment.size)}): ${attachment.relativePath}`;
      const notes = notesByAttachmentId.get(attachment.id);
      return notes ? `${base}\n  ${notes.join("\n  ")}` : base;
    })
    .join("\n");

  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
  return `${prefix}Attached files are saved in this app workspace:\n${attachmentLines}\n\nRead those files as needed before making changes.`;
}

function groupAttachmentNotes(notes: AttachmentImagePromptNote[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const { attachmentId, note } of notes) {
    const current = grouped.get(attachmentId) ?? [];
    current.push(note);
    grouped.set(attachmentId, current);
  }
  return grouped;
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
