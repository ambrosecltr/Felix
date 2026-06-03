import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Felix runs each mini app's Vite dev server with a standalone Node runtime
 * that supports `node:sqlite` (Node >= 22.5), independent of Electron's older
 * bundled Node. This resolves the runtime path used to spawn mini apps.
 *
 * Resolution order:
 *   1. FELIX_NODE_PATH env override
 *   2. A Node binary bundled with the app (resources/node/bin/node)
 *   3. The current process executable if it already supports node:sqlite
 *   4. A `node` on PATH that supports node:sqlite
 */
export interface NodeRuntimeOptions {
  bundledNodePath?: string;
}

let cached: string | null = null;

function supportsSqlite(nodeBin: string): boolean {
  try {
    execFileSync(nodeBin, ["-e", "require('node:sqlite')"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function resolveMiniAppNode(options: NodeRuntimeOptions = {}): string {
  if (cached) return cached;

  const candidates: Array<string | undefined> = [
    process.env.FELIX_NODE_PATH,
    options.bundledNodePath,
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && supportsSqlite(candidate)) {
      cached = candidate;
      return cached;
    }
  }

  // Current executable (works in dev when launched with a modern Node).
  if (!process.env.ELECTRON_RUN_AS_NODE && supportsSqlite(process.execPath)) {
    cached = process.execPath;
    return cached;
  }

  // `node` on PATH.
  try {
    const which = execFileSync("/usr/bin/which", ["node"], { encoding: "utf8" }).trim();
    if (which && supportsSqlite(which)) {
      cached = which;
      return cached;
    }
  } catch {
    // ignore
  }

  throw new Error(
    "No Node runtime with node:sqlite support found. Run the Felix runtime setup, " +
      "install Node >= 22.5, or set FELIX_NODE_PATH.",
  );
}

export function bundledNodePath(resourcesDir: string): string {
  const binName = process.platform === "win32" ? "node.exe" : "node";
  return path.join(resourcesDir, "node", "bin", binName);
}
