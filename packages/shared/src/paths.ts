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
  readonly profileFile: string;
  readonly tokenUsageFile: string;
}

export function felixPaths(dataDir?: string | null): FelixPaths {
  const root = dataDir ?? defaultDataDir();
  return {
    root,
    apps: path.join(root, "apps"),
    agent: path.join(root, "agent"),
    settingsFile: path.join(root, "settings.json"),
    profileFile: path.join(root, "profile.json"),
    tokenUsageFile: path.join(root, "token-usage.json"),
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
  const root = safeMiniAppRoot(appsDir, appId);
  return {
    root,
    manifestFile: path.join(root, "felix.json"),
    dbFile: path.join(root, "felix.db"),
    chatFile: path.join(root, ".felix", "chat.json"),
    aboutFile: path.join(root, ".felix", "about.json"),
  };
}

function safeMiniAppRoot(appsDir: string, appId: string): string {
  const root = path.join(appsDir, appId);
  const relative = path.relative(path.resolve(appsDir), path.resolve(root));
  if (
    appId.trim().length === 0 ||
    appId.includes("/") ||
    appId.includes("\\") ||
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Invalid mini app id: ${appId}`);
  }
  return root;
}
