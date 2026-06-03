import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Felix installs each mini app's dependencies with bun. A GUI app launched
 * from Finder/dock does not inherit the user's shell PATH, so a bare
 * `spawn("bun")` fails with ENOENT. This resolves an absolute bun path.
 *
 * Resolution order:
 *   1. FELIX_BUN_PATH env override
 *   2. A bun binary bundled with the app (resources/bun/bin/bun)
 *   3. Common install locations (~/.bun/bin, Homebrew, /usr/local/bin)
 *   4. A `bun` on PATH
 */
export interface BunRuntimeOptions {
  bundledBunPath?: string;
}

let cached: string | null = null;

function isExecutable(bin: string): boolean {
  try {
    return fs.existsSync(bin) && fs.statSync(bin).isFile();
  } catch {
    return false;
  }
}

export function resolveBun(options: BunRuntimeOptions = {}): string {
  if (cached) return cached;

  const home = os.homedir();
  const binName = process.platform === "win32" ? "bun.exe" : "bun";
  const candidates: Array<string | undefined> = [
    process.env.FELIX_BUN_PATH,
    options.bundledBunPath,
    path.join(home, ".bun", "bin", binName),
    `/opt/homebrew/bin/${binName}`,
    `/usr/local/bin/${binName}`,
  ];

  for (const candidate of candidates) {
    if (candidate && isExecutable(candidate)) {
      cached = candidate;
      return cached;
    }
  }

  // `bun` on PATH.
  try {
    const which = process.platform === "win32" ? "where" : "/usr/bin/which";
    const found = execFileSync(which, ["bun"], { encoding: "utf8" }).split("\n")[0]?.trim();
    if (found && isExecutable(found)) {
      cached = found;
      return cached;
    }
  } catch {
    // ignore
  }

  throw new Error(
    "Could not find the bun runtime. Reinstall Felix, install bun from https://bun.sh, " +
      "or set FELIX_BUN_PATH.",
  );
}

export function bundledBunPath(resourcesDir: string): string {
  const binName = process.platform === "win32" ? "bun.exe" : "bun";
  return path.join(resourcesDir, "bun", "bin", binName);
}
