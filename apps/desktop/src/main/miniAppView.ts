import { webContents, type BrowserWindow, type WebContents } from "electron";
import type {
  BrowserPreviewToolRequest,
  BrowserPreviewToolResponse,
  ResizedImage,
  ResizeImage,
} from "@felix/core";

interface ViewportSize {
  width: number;
  height: number;
}

interface MiniAppViewOptions {
  resizeImage: ResizeImage;
  cursorImageDataUrl: string | null;
}

interface BrowserLogEntry {
  level: "debug" | "info" | "warning" | "error";
  message: string;
  sourceId: string;
  lineNumber: number;
  timestamp: string;
}

interface CursorPoint {
  x: number;
  y: number;
}

interface SnapshotControl {
  tag: string;
  role: string | null;
  label: string;
  value: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}

interface SnapshotData {
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  activeElement: string | null;
  text: string;
  controls: SnapshotControl[];
  gameState: string | null;
  gameStateError: string | null;
}

const MAX_LOGS = 100;
const DEFAULT_LOG_LIMIT = 30;
const MAX_SNAPSHOT_TEXT = 5000;
const MAX_GAME_STATE_TEXT = 4000;
const MAX_CONTROL_LABEL = 140;
const CURSOR_WIDTH = 68;
const CURSOR_HEIGHT = 84;
const CURSOR_HOTSPOT_X = 26;
const CURSOR_HOTSPOT_Y = 20;
const MIN_CURSOR_DURATION_MS = 180;
const MAX_CURSOR_DURATION_MS = 720;
const SNAPSHOT_SCRIPT = `
(async () => {
  const clean = (value, max) =>
    String(value ?? "").replace(/\\s+/g, " ").trim().slice(0, max);
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left <= window.innerWidth &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || "1") > 0.01
    );
  };
  const labelFor = (element) => {
    const aria = element.getAttribute("aria-label");
    if (aria) return aria;
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const label = labelledBy
        .split(/\\s+/)
        .map((id) => document.getElementById(id)?.innerText)
        .filter(Boolean)
        .join(" ");
      if (label) return label;
    }
    if ("labels" in element && element.labels?.length) {
      return Array.from(element.labels).map((label) => label.innerText).join(" ");
    }
    return element.innerText || element.textContent || element.getAttribute("title") || element.getAttribute("placeholder") || "";
  };
  const selector = [
    "button",
    "a[href]",
    "input",
    "textarea",
    "select",
    "summary",
    "[role='button']",
    "[role='link']",
    "[role='checkbox']",
    "[role='menuitem']",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  const controls = Array.from(document.querySelectorAll(selector))
    .filter(isVisible)
    .slice(0, 60)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role"),
        label: clean(labelFor(element), 140),
        value: "value" in element ? clean(element.value, 140) : "",
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          centerX: Math.round(rect.left + rect.width / 2),
          centerY: Math.round(rect.top + rect.height / 2),
        },
      };
    });
  const activeElement =
    document.activeElement && document.activeElement !== document.body
      ? clean(
          [
            document.activeElement.tagName?.toLowerCase(),
            document.activeElement.getAttribute?.("role"),
            document.activeElement.getAttribute?.("aria-label"),
            document.activeElement.id ? "#" + document.activeElement.id : "",
          ]
            .filter(Boolean)
            .join(" "),
          200,
        )
      : null;

  let gameState = null;
  let gameStateError = null;
  try {
    const hook = window.render_game_to_text;
    if (typeof hook === "function") {
      let value = hook();
      if (value && typeof value.then === "function") value = await value;
      gameState = clean(value, 4000);
    }
  } catch (err) {
    gameStateError = err instanceof Error ? err.message : String(err);
  }

  return {
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    activeElement,
    text: clean(document.body?.innerText || "", 5000),
    controls,
    gameState,
    gameStateError,
  };
})()
`;

type GameAction = "pause" | "resume" | "step" | "state";

interface GameResult {
  hooksFound: boolean;
  actionRan: boolean;
  paused: boolean | null;
  steppedFrames: number | null;
  gameState: string | null;
  gameStateError: string | null;
  message: string | null;
}

function buildGameScript(action: GameAction, frames: number): string {
  return `
(async () => {
  const clean = (value, max) =>
    String(value ?? "").replace(/\\s+/g, " ").trim().slice(0, max);
  const action = ${JSON.stringify(action)};
  const frames = ${JSON.stringify(frames)};
  const game =
    (window.felixGame && typeof window.felixGame === "object" ? window.felixGame : null);
  const hooks = {
    pause: game && typeof game.pause === "function" ? game.pause.bind(game) : null,
    resume: game && typeof game.resume === "function" ? game.resume.bind(game) : null,
    step:
      game && typeof game.step === "function"
        ? game.step.bind(game)
        : typeof window.advanceTime === "function"
          ? (n) => window.advanceTime(n)
          : null,
    state:
      typeof window.render_game_to_text === "function"
        ? window.render_game_to_text.bind(window)
        : null,
  };
  const hooksFound = Boolean(hooks.pause || hooks.resume || hooks.step || hooks.state);

  let actionRan = false;
  let message = null;
  try {
    if (action === "pause") {
      if (hooks.pause) { await hooks.pause(); actionRan = true; }
      else message = "No window.felixGame.pause() hook is available.";
    } else if (action === "resume") {
      if (hooks.resume) { await hooks.resume(); actionRan = true; }
      else message = "No window.felixGame.resume() hook is available.";
    } else if (action === "step") {
      if (hooks.step) { await hooks.step(frames); actionRan = true; }
      else message = "No window.felixGame.step() or window.advanceTime() hook is available.";
    } else {
      actionRan = true;
    }
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }

  let paused = null;
  if (game && typeof game.paused === "boolean") paused = game.paused;
  else if (game && typeof game.isPaused === "function") {
    try { paused = Boolean(game.isPaused()); } catch (err) { paused = null; }
  }

  let gameState = null;
  let gameStateError = null;
  if (hooks.state) {
    try {
      let value = hooks.state();
      if (value && typeof value.then === "function") value = await value;
      gameState = clean(value, ${MAX_GAME_STATE_TEXT});
    } catch (err) {
      gameStateError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    hooksFound,
    actionRan,
    paused,
    steppedFrames: action === "step" && actionRan ? frames : null,
    gameState,
    gameStateError,
    message,
  };
})()
`;
}

export function isAllowedMiniAppUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  return (
    url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1"
  );
}

/**
 * Locks down every <webview> the renderer creates: no preload, no node
 * integration, sandboxed, and only allowed to load/navigate to local mini
 * app dev servers. Popups from the guest are denied.
 */
export function hardenMiniAppWebviews(window: BrowserWindow): void {
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (typeof params.src === "string" && !isAllowedMiniAppUrl(params.src)) {
      event.preventDefault();
    }
  });
  window.webContents.on("did-attach-webview", (_event, guest) => {
    guest.setWindowOpenHandler(() => ({ action: "deny" }));
    guest.on("will-navigate", (event, url) => {
      if (!isAllowedMiniAppUrl(url)) event.preventDefault();
    });
  });
}

/**
 * Drives the renderer's <webview> guest that shows the currently open mini
 * app's dev server. The guest lives in the DOM (so the renderer can layer
 * chrome, tabs, and dialogs above it); this class only needs its WebContents
 * for Felix's browser tools, log capture, and the agent cursor overlay.
 */
export class MiniAppView {
  private guest: WebContents | null = null;
  private currentAppId: string | null = null;
  private agentActive = false;
  private cursorPosition: CursorPoint | null = null;
  private readonly logs: BrowserLogEntry[] = [];
  private detachGuestEvents: (() => void) | null = null;

  constructor(
    private readonly window: BrowserWindow,
    private readonly options: MiniAppViewOptions,
  ) {}

  attach(appId: string, webContentsId: number): void {
    const guest = webContents.fromId(webContentsId);
    if (!guest || guest.isDestroyed()) throw new Error("Mini app preview is not available.");
    if (guest.getType() !== "webview" || guest.hostWebContents !== this.window.webContents) {
      throw new Error("Refused to attach to a non-preview web contents.");
    }
    if (this.guest === guest && this.currentAppId === appId) return;
    this.detach();
    this.guest = guest;
    this.currentAppId = appId;
    this.agentActive = false;
    this.cursorPosition = null;
    this.logs.length = 0;
    this.attachGuestEvents(guest);
  }

  detach(): void {
    this.detachGuestEvents?.();
    this.detachGuestEvents = null;
    this.guest = null;
    this.currentAppId = null;
    this.agentActive = false;
    this.cursorPosition = null;
    this.logs.length = 0;
  }

  reload(): void {
    const guest = this.guest;
    if (!guest || guest.isDestroyed()) return;
    this.cursorPosition = null;
    guest.reload();
  }

  setAgentActive(appId: string, active: boolean): void {
    if (appId !== this.currentAppId) return;
    this.agentActive = active;
    if (!active) void this.hideCursor();
  }

  async executeBrowserTool(
    appId: string,
    request: BrowserPreviewToolRequest,
  ): Promise<BrowserPreviewToolResponse> {
    this.requireCurrentApp(appId);
    switch (request.toolName) {
      case "browser_snapshot":
        return this.snapshot();
      case "browser_screenshot":
        return this.screenshot();
      case "browser_logs":
        return this.logsResponse(request.params);
      case "browser_reload":
        return this.reloadResponse();
      case "browser_click":
        return this.click(request.params);
      case "browser_type":
        return this.typeText(request.params);
      case "browser_key":
        return this.key(request.params);
      case "browser_scroll":
        return this.scroll(request.params);
      case "browser_move_cursor":
        return this.moveCursor(request.params);
      case "browser_game":
        return this.game(request.params);
    }
  }

  destroy(): void {
    this.detach();
  }

  private attachGuestEvents(guest: WebContents): void {
    const onConsoleMessage = (event: {
      level: BrowserLogEntry["level"];
      message: string;
      sourceId: string;
      lineNumber: number;
    }) => {
      this.addLog({
        level: event.level,
        message: event.message,
        sourceId: event.sourceId,
        lineNumber: event.lineNumber,
        timestamp: new Date().toISOString(),
      });
    };
    const onDidStartNavigation = (
      _event: unknown,
      _url: string,
      isInPlace: boolean,
      isMainFrame: boolean,
    ) => {
      if (isMainFrame && !isInPlace) {
        this.cursorPosition = null;
        this.logs.length = 0;
      }
    };
    const onDidFailLoad = (
      _event: unknown,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean,
    ) => {
      if (!isMainFrame) return;
      this.addLog({
        level: "error",
        message: `Page failed to load (${errorCode}): ${errorDescription}`,
        sourceId: validatedURL,
        lineNumber: 0,
        timestamp: new Date().toISOString(),
      });
    };
    const onRenderProcessGone = (_event: unknown, details: { reason: string }) => {
      this.addLog({
        level: "error",
        message: `Preview renderer stopped: ${details.reason}`,
        sourceId: this.guest?.getURL() ?? "",
        lineNumber: 0,
        timestamp: new Date().toISOString(),
      });
    };
    const onDestroyed = () => {
      if (this.guest === guest) this.detach();
    };

    guest.on("console-message", onConsoleMessage);
    guest.on("did-start-navigation", onDidStartNavigation);
    guest.on("did-fail-load", onDidFailLoad);
    guest.on("render-process-gone", onRenderProcessGone);
    guest.once("destroyed", onDestroyed);

    this.detachGuestEvents = () => {
      guest.off("destroyed", onDestroyed);
      if (guest.isDestroyed()) return;
      guest.off("console-message", onConsoleMessage);
      guest.off("did-start-navigation", onDidStartNavigation);
      guest.off("did-fail-load", onDidFailLoad);
      guest.off("render-process-gone", onRenderProcessGone);
    };
  }

  private requireGuest(): WebContents {
    const guest = this.guest;
    if (!guest || guest.isDestroyed()) {
      throw new Error("Felix preview is not visible.");
    }
    return guest;
  }

  private requireCurrentApp(appId: string): void {
    if (appId !== this.currentAppId) {
      throw new Error("Felix preview is showing a different app.");
    }
  }

  private async snapshot(): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    await this.waitForLoad();
    const raw = (await guest.executeJavaScript(SNAPSHOT_SCRIPT, false)) as unknown;
    const snapshot = normalizeSnapshot(raw);
    return textResponse(formatSnapshot(snapshot, this.filteredLogs("warnings-and-errors", 12)));
  }

  private async game(params: Record<string, unknown>): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    await this.waitForLoad();
    const action = readGameAction(params.action);
    const frames = readGameFrames(params.frames);
    const raw = (await guest.executeJavaScript(buildGameScript(action, frames), false)) as unknown;
    const result = normalizeGameResult(raw);
    return textResponse(formatGameResult(action, frames, result));
  }

  private async screenshot(): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    await this.waitForLoad();
    const viewport = await this.readViewport();
    const image = await guest.capturePage();
    const captureSize = image.getSize();
    const resized = await this.options.resizeImage(image.toPNG(), "image/png");
    if (!resized) {
      return textResponse("Error: Screenshot was too large for Felix to inspect.", true);
    }

    return {
      content: [
        { type: "text", text: screenshotNote(viewport, captureSize, resized) },
        { type: "image", data: resized.data, mimeType: resized.mimeType },
      ],
      details: {
        viewport,
        captureSize,
        image: {
          width: resized.width,
          height: resized.height,
          mimeType: resized.mimeType,
          wasResized: resized.wasResized,
        },
      },
    };
  }

  private logsResponse(params: Record<string, unknown>): BrowserPreviewToolResponse {
    const level = readLogLevel(params.level);
    const limit = readLimit(params.limit, DEFAULT_LOG_LIMIT, MAX_LOGS);
    const logs = this.filteredLogs(level, limit);
    if (logs.length === 0) return textResponse("No recent preview logs matched.");
    return textResponse(logs.map(formatLog).join("\n"));
  }

  private async reloadResponse(): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    this.cursorPosition = null;
    guest.reload();
    await this.waitForLoad();
    return textResponse("Reloaded the live preview.");
  }

  private async click(params: Record<string, unknown>): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    const viewport = await this.readViewport();
    const point = readPoint(params, viewport);
    const button = readMouseButton(params.button);
    const clickCount = readClickCount(params.clickCount);
    this.focusPreview(guest);
    await this.animateCursorTo(point, viewport, true);
    const eventPoint = roundedPoint(point);
    guest.sendInputEvent({
      type: "mouseDown",
      ...eventPoint,
      button,
      clickCount,
    });
    await sleep(45 + Math.random() * 55);
    guest.sendInputEvent({
      type: "mouseUp",
      ...eventPoint,
      button,
      clickCount,
    });
    return textResponse(`Clicked the preview at ${eventPoint.x}, ${eventPoint.y}.`);
  }

  private async typeText(params: Record<string, unknown>): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    const text = readRequiredString(params.text, "text").slice(0, 5000);
    this.focusPreview(guest);
    await guest.insertText(text);
    return textResponse(`Typed ${text.length} character${text.length === 1 ? "" : "s"} into the preview.`);
  }

  private async key(params: Record<string, unknown>): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    const keyCode = readRequiredString(params.key, "key").slice(0, 40);
    this.focusPreview(guest);
    guest.sendInputEvent({ type: "rawKeyDown", keyCode });
    await sleep(20 + Math.random() * 35);
    guest.sendInputEvent({ type: "keyUp", keyCode });
    return textResponse(`Pressed ${keyCode}.`);
  }

  private async scroll(params: Record<string, unknown>): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    const viewport = await this.readViewport();
    const point = readOptionalPoint(params, viewport) ?? {
      x: Math.max(0, viewport.width / 2),
      y: Math.max(0, viewport.height / 2),
    };
    const deltaX = readOptionalNumber(params.deltaX, 0);
    const deltaY = readOptionalNumber(params.deltaY, 0);
    if (deltaX === 0 && deltaY === 0) throw new Error("Scroll requires deltaX or deltaY.");
    this.focusPreview(guest);
    await this.animateCursorTo(point, viewport, true);
    guest.sendInputEvent({
      type: "mouseWheel",
      ...roundedPoint(point),
      deltaX,
      deltaY,
      canScroll: true,
      hasPreciseScrollingDeltas: true,
    });
    return textResponse(`Scrolled the preview by ${Math.round(deltaX)}, ${Math.round(deltaY)}.`);
  }

  private async moveCursor(params: Record<string, unknown>): Promise<BrowserPreviewToolResponse> {
    const guest = this.requireGuest();
    const viewport = await this.readViewport();
    const point = readPoint(params, viewport);
    this.focusPreview(guest);
    await this.animateCursorTo(point, viewport, true);
    return textResponse(`Moved Felix's cursor to ${Math.round(point.x)}, ${Math.round(point.y)}.`);
  }

  private focusPreview(guest: WebContents): void {
    if (!this.window.isDestroyed()) this.window.focus();
    guest.focus();
  }

  private async waitForLoad(timeoutMs = 5000): Promise<void> {
    const guest = this.requireGuest();
    if (!guest.isLoadingMainFrame()) return;
    await new Promise<void>((resolve) => {
      let done = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timeout) clearTimeout(timeout);
        guest.off("did-finish-load", finish);
        guest.off("did-stop-loading", finish);
        guest.off("did-fail-load", finish);
        resolve();
      };
      timeout = setTimeout(finish, timeoutMs);
      guest.once("did-finish-load", finish);
      guest.once("did-stop-loading", finish);
      guest.once("did-fail-load", finish);
    });
  }

  private addLog(entry: BrowserLogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.splice(0, this.logs.length - MAX_LOGS);
    }
  }

  private filteredLogs(level: LogFilter, limit: number): BrowserLogEntry[] {
    const filtered = this.logs.filter((entry) => {
      if (level === "errors") return entry.level === "error";
      if (level === "warnings-and-errors") {
        return entry.level === "warning" || entry.level === "error";
      }
      return true;
    });
    return filtered.slice(-limit);
  }

  private async readViewport(): Promise<SnapshotData["viewport"]> {
    const guest = this.requireGuest();
    const raw = (await guest.executeJavaScript(
      "({ width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 })",
      false,
    )) as unknown;
    return normalizeViewport(raw);
  }

  private async animateCursorTo(
    point: CursorPoint,
    viewport: ViewportSize,
    dispatchMouseMove: boolean,
  ): Promise<void> {
    const guest = this.requireGuest();
    const start = this.cursorPosition ?? initialCursorPoint(point, viewport);
    const path = humanCursorPath(start, point);
    let previous = start;

    if (this.agentActive) {
      await this.ensureCursorOverlay(guest);
      await this.setCursorOverlayPosition(start, true);
    }

    const distance = Math.hypot(point.x - start.x, point.y - start.y);
    const duration = clampNumber(
      MIN_CURSOR_DURATION_MS + distance * 0.75 + Math.random() * 120,
      MIN_CURSOR_DURATION_MS,
      MAX_CURSOR_DURATION_MS,
    );
    const delay = Math.max(8, duration / Math.max(path.length, 1));

    for (const current of path) {
      if (this.agentActive) {
        await this.setCursorOverlayPosition(current, true);
      }
      if (dispatchMouseMove) {
        guest.sendInputEvent({
          type: "mouseMove",
          ...roundedPoint(current),
          movementX: Math.round(current.x - previous.x),
          movementY: Math.round(current.y - previous.y),
        });
      }
      previous = current;
      await sleep(delay);
    }
    this.cursorPosition = point;
  }

  private async ensureCursorOverlay(guest: WebContents): Promise<void> {
    const imageDataUrl = this.options.cursorImageDataUrl;
    if (!imageDataUrl) return;
    await guest
      .executeJavaScript(
        `(() => {
          const id = "felix-agent-cursor";
          let root = document.getElementById(id);
          if (!root) {
            root = document.createElement("div");
            root.id = id;
            root.setAttribute("aria-hidden", "true");
            Object.assign(root.style, {
              position: "fixed",
              left: "0",
              top: "0",
              width: "${CURSOR_WIDTH}px",
              height: "${CURSOR_HEIGHT}px",
              pointerEvents: "none",
              zIndex: "2147483647",
              opacity: "0",
              transform: "translate3d(-9999px, -9999px, 0)",
              transition: "opacity 80ms linear",
              willChange: "transform, opacity",
            });
            const img = document.createElement("img");
            img.alt = "";
            img.src = ${JSON.stringify(imageDataUrl)};
            Object.assign(img.style, {
              display: "block",
              width: "${CURSOR_WIDTH}px",
              height: "auto",
              filter: "drop-shadow(0 3px 7px rgba(15, 23, 42, 0.22))",
              userSelect: "none",
            });
            root.append(img);
            document.documentElement.append(root);
          }
          return true;
        })()`,
        false,
      )
      .catch(() => {});
  }

  private async setCursorOverlayPosition(point: CursorPoint, visible: boolean): Promise<void> {
    if (!this.options.cursorImageDataUrl) return;
    const guest = this.guest;
    if (!guest || guest.isDestroyed()) return;
    const x = Math.round(point.x - CURSOR_HOTSPOT_X);
    const y = Math.round(point.y - CURSOR_HOTSPOT_Y);
    await guest
      .executeJavaScript(
        `(() => {
          const root = document.getElementById("felix-agent-cursor");
          if (!root) return false;
          root.style.transform = "translate3d(${x}px, ${y}px, 0)";
          root.style.opacity = "${visible ? "1" : "0"}";
          return true;
        })()`,
        false,
      )
      .catch(() => {});
  }

  private async hideCursor(): Promise<void> {
    this.cursorPosition = null;
    await this.setCursorOverlayPosition({ x: -9999, y: -9999 }, false);
  }
}

type LogFilter = "all" | "warnings-and-errors" | "errors";

function textResponse(text: string, isError = false): BrowserPreviewToolResponse {
  return { content: [{ type: "text", text }], isError };
}

function normalizeSnapshot(value: unknown): SnapshotData {
  if (!isRecord(value)) throw new Error("Preview snapshot returned invalid data.");
  const viewport = normalizeViewport(value.viewport);
  const controls = Array.isArray(value.controls)
    ? value.controls.map(normalizeControl).filter((control): control is SnapshotControl => control !== null)
    : [];
  return {
    url: readString(value.url, ""),
    title: readString(value.title, ""),
    viewport,
    activeElement: readNullableString(value.activeElement),
    text: readString(value.text, "").slice(0, MAX_SNAPSHOT_TEXT),
    controls,
    gameState: readNullableString(value.gameState)?.slice(0, MAX_GAME_STATE_TEXT) ?? null,
    gameStateError: readNullableString(value.gameStateError),
  };
}

function normalizeGameResult(value: unknown): GameResult {
  const record = isRecord(value) ? value : {};
  return {
    hooksFound: record.hooksFound === true,
    actionRan: record.actionRan === true,
    paused: typeof record.paused === "boolean" ? record.paused : null,
    steppedFrames: readFiniteNumber(record.steppedFrames, Number.NaN) || null,
    gameState: readNullableString(record.gameState)?.slice(0, MAX_GAME_STATE_TEXT) ?? null,
    gameStateError: readNullableString(record.gameStateError),
    message: readNullableString(record.message),
  };
}

function formatGameResult(action: GameAction, frames: number, result: GameResult): string {
  const lines: string[] = [];
  if (!result.hooksFound) {
    lines.push(
      "No game test hooks were found on this app.",
      "To make a fast game verifiable, expose window.felixGame.pause(), .resume(), .step(frames), and window.render_game_to_text().",
    );
    return lines.join("\n");
  }

  if (action === "step") {
    lines.push(result.actionRan ? `Stepped the game by ${frames} frame${frames === 1 ? "" : "s"}.` : "Could not step the game.");
  } else if (action === "pause") {
    lines.push(result.actionRan ? "Paused the game." : "Could not pause the game.");
  } else if (action === "resume") {
    lines.push(result.actionRan ? "Resumed the game." : "Could not resume the game.");
  } else {
    lines.push("Read the current game state.");
  }

  if (result.message && !result.actionRan) lines.push(result.message);
  if (result.paused !== null) lines.push(`Paused: ${result.paused ? "yes" : "no"}`);

  if (result.gameState) {
    lines.push("", "Game state:", result.gameState);
  } else if (result.gameStateError) {
    lines.push("", `Game state hook error: ${result.gameStateError}`);
  } else {
    lines.push("", "No window.render_game_to_text() output is available for this game.");
  }
  return lines.join("\n");
}

function readGameAction(value: unknown): GameAction {
  if (value === "pause" || value === "resume" || value === "step" || value === "state") return value;
  return "state";
}

function readGameFrames(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.round(clampNumber(value, 1, 600));
}

function normalizeViewport(value: unknown): SnapshotData["viewport"] {
  const record = isRecord(value) ? value : {};
  return {
    width: readFiniteNumber(record.width, 0),
    height: readFiniteNumber(record.height, 0),
    devicePixelRatio: readFiniteNumber(record.devicePixelRatio, 1),
  };
}

function normalizeControl(value: unknown): SnapshotControl | null {
  if (!isRecord(value) || !isRecord(value.rect)) return null;
  return {
    tag: readString(value.tag, "element"),
    role: readNullableString(value.role),
    label: readString(value.label, "").slice(0, MAX_CONTROL_LABEL),
    value: readString(value.value, "").slice(0, MAX_CONTROL_LABEL),
    rect: {
      x: readFiniteNumber(value.rect.x, 0),
      y: readFiniteNumber(value.rect.y, 0),
      width: readFiniteNumber(value.rect.width, 0),
      height: readFiniteNumber(value.rect.height, 0),
      centerX: readFiniteNumber(value.rect.centerX, 0),
      centerY: readFiniteNumber(value.rect.centerY, 0),
    },
  };
}

function formatSnapshot(snapshot: SnapshotData, logs: BrowserLogEntry[]): string {
  const lines = [
    `URL: ${snapshot.url || "(unknown)"}`,
    `Title: ${snapshot.title || "(untitled)"}`,
    `Viewport: ${Math.round(snapshot.viewport.width)}x${Math.round(snapshot.viewport.height)} CSS px, DPR ${snapshot.viewport.devicePixelRatio.toFixed(2)}`,
  ];
  if (snapshot.activeElement) lines.push(`Focused: ${snapshot.activeElement}`);
  lines.push("", "Visible text:", snapshot.text || "(No visible text detected.)");

  lines.push("", "Interactive controls:");
  if (snapshot.controls.length === 0) {
    lines.push("(No visible controls detected.)");
  } else {
    for (const [index, control] of snapshot.controls.entries()) {
      const label = control.label || control.value || "(unlabeled)";
      const role = control.role ? ` role=${control.role}` : "";
      lines.push(
        `${index + 1}. ${control.tag}${role} "${label}" at x=${Math.round(control.rect.centerX)}, y=${Math.round(control.rect.centerY)} size ${Math.round(control.rect.width)}x${Math.round(control.rect.height)}`,
      );
    }
  }

  if (snapshot.gameState) {
    lines.push("", "Game state hook:", snapshot.gameState);
  } else if (snapshot.gameStateError) {
    lines.push("", `Game state hook error: ${snapshot.gameStateError}`);
  }

  lines.push("", "Recent warnings/errors:");
  if (logs.length === 0) {
    lines.push("(None.)");
  } else {
    lines.push(...logs.map(formatLog));
  }
  return lines.join("\n");
}

function screenshotNote(
  viewport: SnapshotData["viewport"],
  captureSize: { width: number; height: number },
  resized: ResizedImage,
): string {
  const scaleX = viewport.width > 0 ? viewport.width / resized.width : 1;
  const scaleY = viewport.height > 0 ? viewport.height / resized.height : 1;
  const captureText = `${captureSize.width}x${captureSize.height}`;
  const displayText = `${resized.width}x${resized.height}`;
  return [
    `Screenshot captured. Viewport tool coordinates are ${Math.round(viewport.width)}x${Math.round(viewport.height)} CSS pixels.`,
    `This image is ${displayText}${resized.wasResized ? ` after resizing from ${captureText}` : ""}.`,
    `To click a point from this screenshot, use x = screenshotX * ${scaleX.toFixed(3)} and y = screenshotY * ${scaleY.toFixed(3)}.`,
  ].join("\n");
}

function formatLog(entry: BrowserLogEntry): string {
  const source = entry.sourceId ? ` (${entry.sourceId}${entry.lineNumber ? `:${entry.lineNumber}` : ""})` : "";
  return `[${entry.level}] ${entry.message}${source}`;
}

function readLogLevel(value: unknown): LogFilter {
  if (value === "all" || value === "warnings-and-errors" || value === "errors") return value;
  return "warnings-and-errors";
}

function readLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(clampNumber(value, 1, max));
}

function readPoint(params: Record<string, unknown>, viewport: ViewportSize): CursorPoint {
  return {
    x: readCoordinate(params.x, "x", viewport.width),
    y: readCoordinate(params.y, "y", viewport.height),
  };
}

function readOptionalPoint(
  params: Record<string, unknown>,
  viewport: ViewportSize,
): CursorPoint | null {
  if (params.x === undefined && params.y === undefined) return null;
  return readPoint(params, viewport);
}

function readCoordinate(value: unknown, name: string, max: number): number {
  const number = readFiniteNumber(value, Number.NaN);
  if (!Number.isFinite(number)) throw new Error(`browser coordinate ${name} must be a number.`);
  if (number < 0 || number > max) {
    throw new Error(`browser coordinate ${name} must be between 0 and ${Math.round(max)}.`);
  }
  return number;
}

function readMouseButton(value: unknown): "left" | "middle" | "right" {
  if (value === "middle" || value === "right") return value;
  return "left";
}

function readClickCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.round(clampNumber(value, 1, 3));
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function readOptionalNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function roundedPoint(point: CursorPoint): { x: number; y: number } {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function initialCursorPoint(target: CursorPoint, viewport: ViewportSize): CursorPoint {
  return {
    x: clampNumber(target.x - 90 + Math.random() * 50, 0, viewport.width),
    y: clampNumber(target.y - 55 + Math.random() * 60, 0, viewport.height),
  };
}

function humanCursorPath(from: CursorPoint, to: CursorPoint): CursorPoint[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.round(clampNumber(distance / 18, 8, 34));
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  const bend = (Math.random() - 0.5) * clampNumber(distance * 0.35, 18, 120);
  const control1 = {
    x: from.x + (to.x - from.x) * 0.32 + normal.x * bend,
    y: from.y + (to.y - from.y) * 0.32 + normal.y * bend,
  };
  const control2 = {
    x: from.x + (to.x - from.x) * 0.72 - normal.x * bend * 0.45,
    y: from.y + (to.y - from.y) * 0.72 - normal.y * bend * 0.45,
  };

  const points: CursorPoint[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const progress = i / steps;
    const t = easeInOutCubic(progress);
    const jitter = Math.sin(progress * Math.PI) * (Math.random() - 0.5) * 3;
    points.push({
      x: cubic(from.x, control1.x, control2.x, to.x, t) + normal.x * jitter,
      y: cubic(from.y, control1.y, control2.y, to.y, t) + normal.y * jitter,
    });
  }
  points[points.length - 1] = to;
  return points;
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
