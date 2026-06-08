import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";
import { BrowserWindow, Menu, app, nativeImage } from "electron";
import { MiniAppManager, resolvePiBin } from "@felix/core";
import { PUSH_CHANNEL, type PushEvent } from "@felix/contracts";
import { resizeImageForModel } from "./imageResize.ts";
import { registerIpc } from "./ipc.ts";
import { applyMacosWindowChrome } from "./macosWindowChrome.ts";
import { MiniAppView } from "./miniAppView.ts";
import { UpdateController } from "./updater.ts";
import { persistWindowState, readWindowState } from "./windowState.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Name shown in the dock tooltip, menus, and "About" (overrides "Electron").
app.setName("Felix");

let mainWindow: BrowserWindow | null = null;
let manager: MiniAppManager | null = null;
let miniAppView: MiniAppView | null = null;
let updates: UpdateController | null = null;

function emit(event: PushEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { webContents } = mainWindow;
  if (webContents.isDestroyed()) return;
  webContents.send(PUSH_CHANNEL, event);
}

function appIconPath(): string {
  // Always use the PNG for the runtime icon: nativeImage cannot decode .icns,
  // so passing the .icns yields an empty image and no icon shows. The .icns is
  // only for the packaged .app bundle (electron-builder config).
  return path.join(resourcesDir(), "icon.png");
}

function createWindow(): void {
  const appResourcesDir = resourcesDir();
  const windowState = readWindowState();
  const window = new BrowserWindow({
    ...windowState,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: "#f5f7ff",
    title: "Felix",
    icon: nativeImage.createFromPath(appIconPath()),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  applyMacosWindowChrome(window, appResourcesDir);
  persistWindowState(window);
  mainWindow = window;
  const view = new MiniAppView(window, {
    resizeImage: resizeImageForModel,
    cursorImageDataUrl: agentCursorDataUrl(appResourcesDir),
  });
  miniAppView = view;

  window.once("ready-to-show", () => {
    if (window.isDestroyed()) return;
    window.show();
  });

  window.once("close", () => {
    view.destroy();
  });

  window.once("closed", () => {
    if (mainWindow === window) mainWindow = null;
    if (miniAppView === view) miniAppView = null;
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  window.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("[felix] renderer failed to load:", code, desc);
  });
}

function resourcesDir(): string {
  // In dev, resources live next to the desktop package; when packaged they are
  // under the app's resources directory.
  if (app.isPackaged) return process.resourcesPath;
  return path.join(__dirname, "../../resources");
}

function agentCursorDataUrl(appResourcesDir: string): string | null {
  try {
    const bytes = fs.readFileSync(path.join(appResourcesDir, "agent-cursor.png"));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function installAppMenu(): void {
  if (process.platform !== "darwin") return;
  // Build the default menu but force the application menu label to "Felix"
  // (it otherwise inherits the bundle name, which is "Electron" in dev).
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Felix",
      submenu: [
        { role: "about", label: "About Felix" },
        {
          label: "Check for Updates...",
          click: () => {
            void updates?.checkForUpdates();
          },
        },
        { type: "separator" },
        { role: "hide", label: "Hide Felix" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: "Quit Felix" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  updates = new UpdateController((status) => emit({ kind: "update", status }));
  if (process.platform === "darwin") {
    const icon = nativeImage.createFromPath(appIconPath());
    if (!icon.isEmpty()) app.dock?.setIcon(icon);
    installAppMenu();
  }
  manager = new MiniAppManager(resolvePiBin(resourcesDir()), emit, {
    resourcesDir: resourcesDir(),
    resizeImage: resizeImageForModel,
    browserPreview: {
      execute: (appId, request) => {
        const view = miniAppView;
        if (!view) throw new Error("Felix preview is not available.");
        return view.executeBrowserTool(appId, request);
      },
      setAgentActive: (appId, active) => {
        miniAppView?.setAgentActive(appId, active);
      },
    },
  });
  createWindow();
  registerIpc(manager, () => miniAppView, updates);
  updates.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  updates?.stop();
  manager?.shutdown();
});
