import { createRequire } from "node:module";
import * as path from "node:path";
import type { BrowserWindow } from "electron";

const require = createRequire(import.meta.url);

interface MacosWindowChromeAddon {
  configureUnifiedToolbar(nativeWindowHandle: Buffer): void;
}

function isMacosWindowChromeAddon(value: unknown): value is MacosWindowChromeAddon {
  return (
    typeof value === "object" &&
    value !== null &&
    "configureUnifiedToolbar" in value &&
    typeof value.configureUnifiedToolbar === "function"
  );
}

export function applyMacosWindowChrome(window: BrowserWindow, resourcesDir: string): void {
  if (process.platform !== "darwin") return;

  const addonPath = path.join(resourcesDir, "native", "macos-window-chrome.node");
  try {
    const addon: unknown = require(addonPath);
    if (!isMacosWindowChromeAddon(addon)) {
      throw new Error(`Invalid macOS window chrome addon at ${addonPath}`);
    }
    addon.configureUnifiedToolbar(window.getNativeWindowHandle());
  } catch (error) {
    console.warn(
      "[felix] could not apply native macOS window chrome:",
      error instanceof Error ? error.message : error,
    );
  }
}
