#!/usr/bin/env node
// Produces a self-contained, flat node_modules for the PI coding agent at
// apps/desktop/resources/agent so packaged Felix can spawn `pi` without any
// of the user's tooling. Bun's workspace install hoists deps into an isolated
// .bun store with symlinks, which does not survive electron-builder packaging;
// a dedicated npm install yields a normal, copyable tree.
import { existsSync, readFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const agentDir = path.join(repoRoot, "apps", "desktop", "resources", "agent");

const PI_PKG = "@earendil-works/pi-coding-agent";
const NVIDIA_NIM_PKG = "pi-nvidia-nim";
const NVIDIA_NIM_VERSION = "^1.1.22";
const OPENCODE_BRIDGE_PKG = "pi-opencode-bridge";
const OPENCODE_BRIDGE_VERSION = "^0.2.1";

function piVersion() {
  // Pin to the version resolved in the workspace so the bundle matches dev.
  for (const packageJsonPath of workspacePackageJsonCandidates(PI_PKG)) {
    const version = readPackageVersion(packageJsonPath);
    if (version) return version;
  }

  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve(`${PI_PKG}/package.json`, {
      paths: [path.join(repoRoot, "apps", "desktop"), repoRoot],
    });
    return JSON.parse(readFileSync(pkgPath, "utf8")).version;
  } catch {
    return null;
  }
}

function workspacePackageJsonCandidates(packageName) {
  const packageParts = packageName.split("/");
  return [
    path.join(repoRoot, "apps", "desktop", "node_modules", ...packageParts, "package.json"),
    path.join(repoRoot, "apps", "core", "node_modules", ...packageParts, "package.json"),
    path.join(repoRoot, "node_modules", ...packageParts, "package.json"),
    path.join(repoRoot, "node_modules", ".bun", "node_modules", ...packageParts, "package.json"),
  ];
}

function readPackageVersion(packageJsonPath) {
  if (!existsSync(packageJsonPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

async function main() {
  const version = piVersion();
  const spec = version ? `${PI_PKG}@${version}` : PI_PKG;

  await fs.rm(agentDir, { recursive: true, force: true });
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(
    path.join(agentDir, "package.json"),
    `${JSON.stringify(
      {
        name: "felix-agent-bundle",
        private: true,
        dependencies: {
          [PI_PKG]: version ?? "*",
          [NVIDIA_NIM_PKG]: NVIDIA_NIM_VERSION,
          [OPENCODE_BRIDGE_PKG]: OPENCODE_BRIDGE_VERSION,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // Use a real npm to get a flat, copyable node_modules (no workspace symlinks).
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log(
    `Installing ${spec}, ${NVIDIA_NIM_PKG}@${NVIDIA_NIM_VERSION}, and ${OPENCODE_BRIDGE_PKG}@${OPENCODE_BRIDGE_VERSION} into ${agentDir}`,
  );
  execFileSync(npm, ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: agentDir,
    stdio: "inherit",
    env: { ...process.env },
  });

  // Sanity check: the CLI must load with its deps resolved.
  const cli = path.join(agentDir, "node_modules", ...PI_PKG.split("/"), "dist", "cli.js");
  execFileSync(process.execPath, [cli, "--version"], { stdio: "inherit" });
  console.log(`Agent bundle ready at ${agentDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
