import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

const PI_PKG = "@earendil-works/pi-coding-agent";
const NODE_MODULES_DIR = "node_modules";

/**
 * Path to the bundled, self-contained agent install shipped with the app:
 * resources/agent/node_modules/@earendil-works/pi-coding-agent. This flat
 * install carries PI's full dependency tree (unlike the workspace's bun store
 * or the asar-unpacked copy, whose deps don't survive packaging).
 */
export function bundledAgentPkgDir(resourcesDir: string): string {
  return bundledAgentNodeModuleDir(resourcesDir, PI_PKG);
}

export function bundledAgentNodeModuleDir(resourcesDir: string, packageName: string): string {
  return path.join(resourcesDir, "agent", NODE_MODULES_DIR, ...packageName.split("/"));
}

function isPackagedResourcesDir(resourcesDir: string): boolean {
  return fs.existsSync(path.join(resourcesDir, "app.asar"));
}

/**
 * Resolves the absolute path to the installed `pi` CLI entry so the agent
 * manager can spawn it regardless of where node_modules is hoisted. Prefers
 * the bundled agent install (the only location with a complete dependency
 * tree in a packaged app), then Node's resolver, then a manual walk-up.
 */
export function resolvePiBin(resourcesDir?: string): string {
  const binFromPkgDir = (pkgDir: string): string => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"),
    ) as { bin?: Record<string, string> | string };
    const binRel = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin?.pi ?? "dist/cli.js");
    return path.join(pkgDir, binRel);
  };

  if (resourcesDir) {
    const bundled = bundledAgentPkgDir(resourcesDir);
    if (fs.existsSync(path.join(bundled, "package.json"))) {
      return binFromPkgDir(bundled);
    }
    if (isPackagedResourcesDir(resourcesDir)) {
      throw new Error(`Packaged PI agent is missing from ${bundled}`);
    }
  }

  try {
    const require = createRequire(import.meta.url);
    const pkgJsonPath = require.resolve(`${PI_PKG}/package.json`);
    return binFromPkgDir(path.dirname(pkgJsonPath));
  } catch {
    // Fall through to manual search.
  }

  let dir = path.dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "node_modules", ...PI_PKG.split("/"));
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return binFromPkgDir(candidate);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(`Could not resolve ${PI_PKG}. Is it installed?`);
}

export function resolvePiPackageDir(
  packageName: string,
  resourcesDir?: string,
): string | null {
  if (resourcesDir) {
    const bundled = bundledAgentNodeModuleDir(resourcesDir, packageName);
    if (fs.existsSync(path.join(bundled, "package.json"))) return bundled;
  }

  try {
    const require = createRequire(import.meta.url);
    const pkgJsonPath = require.resolve(`${packageName}/package.json`);
    return path.dirname(pkgJsonPath);
  } catch {
    // Fall through to manual search.
  }

  let dir = path.dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, NODE_MODULES_DIR, ...packageName.split("/"));
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
