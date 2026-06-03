import * as os from "node:os";
import * as path from "node:path";

const APP_DIR_NAME = "Felix";

export function defaultDataDir(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_DIR_NAME);
  }
  return path.join(os.homedir(), `.${APP_DIR_NAME.toLowerCase()}`);
}

export interface FelixPaths {
  readonly root: string;
  readonly apps: string;
  readonly agent: string;
  readonly settingsFile: string;
}

export function felixPaths(dataDir?: string | null): FelixPaths {
  const root = dataDir ?? defaultDataDir();
  return {
    root,
    apps: path.join(root, "apps"),
    agent: path.join(root, "agent"),
    settingsFile: path.join(root, "settings.json"),
  };
}

export interface MiniAppPaths {
  readonly root: string;
  readonly manifestFile: string;
  readonly dbFile: string;
  readonly chatFile: string;
  readonly aboutFile: string;
}

export function miniAppPaths(appsDir: string, appId: string): MiniAppPaths {
  const root = path.join(appsDir, appId);
  return {
    root,
    manifestFile: path.join(root, "felix.json"),
    dbFile: path.join(root, "felix.db"),
    chatFile: path.join(root, ".felix", "chat.json"),
    aboutFile: path.join(root, ".felix", "about.json"),
  };
}
