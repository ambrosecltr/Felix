#!/usr/bin/env node
// Downloads a standalone Bun binary into apps/desktop/resources/bun so packaged
// Felix can install mini app dependencies without requiring the user to have
// bun on their PATH (GUI apps launched from Finder don't inherit a shell PATH).
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const BUN_VERSION = process.env.FELIX_BUN_VERSION ?? "1.3.14";
const DOWNLOAD_TIMEOUT_MS = 120_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.join(__dirname, "..", "apps", "desktop", "resources", "bun");

function assetName() {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "darwin") {
    if (arch === "arm64") return "bun-darwin-aarch64";
    if (arch === "x64") return "bun-darwin-x64";
  } else if (platform === "linux") {
    if (arch === "arm64") return "bun-linux-aarch64";
    if (arch === "x64") return "bun-linux-x64";
  } else if (platform === "win32") {
    if (arch === "x64") return "bun-windows-x64";
  }
  throw new Error(`Unsupported platform/arch for bun: ${platform}/${arch}`);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadFile(url, dest) {
  const res = await fetchWithTimeout(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function verifyChecksum(file, shasumsUrl, asset) {
  const res = await fetchWithTimeout(shasumsUrl);
  if (!res.ok) throw new Error(`Checksum download failed: ${res.status}`);
  const shasums = await res.text();
  const line = shasums
    .split(/\r?\n/)
    .find((entry) => entry.trim().endsWith(` ${asset}`) || entry.trim().endsWith(`  ${asset}`));
  if (!line) throw new Error(`No checksum found for ${asset}`);
  const expected = line.trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(await fs.readFile(file)).digest("hex");
  if (actual !== expected) throw new Error(`Checksum mismatch for ${asset}`);
}

async function main() {
  const name = assetName();
  const asset = `${name}.zip`;
  const releaseUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}`;
  const url = `${releaseUrl}/${asset}`;
  const shasumsUrl = `${releaseUrl}/SHASUMS256.txt`;

  await fs.mkdir(resourcesDir, { recursive: true });
  const binName = process.platform === "win32" ? "bun.exe" : "bun";
  const tmpZip = path.join(os.tmpdir(), `${name}.zip`);
  const tmpExtract = path.join(os.tmpdir(), `felix-${name}`);

  console.log(`Downloading ${url}`);
  await downloadFile(url, tmpZip);
  await verifyChecksum(tmpZip, shasumsUrl, asset);

  console.log("Extracting...");
  await fs.rm(tmpExtract, { recursive: true, force: true });
  await fs.mkdir(tmpExtract, { recursive: true });
  execFileSync("unzip", ["-q", "-o", tmpZip, "-d", tmpExtract], { stdio: "inherit" });

  // The archive contains a folder named like the asset with a `bun` binary inside.
  const extractedBin = path.join(tmpExtract, name, binName);
  const destBinDir = path.join(resourcesDir, "bin");
  await fs.mkdir(destBinDir, { recursive: true });
  const destBin = path.join(destBinDir, binName);
  await fs.copyFile(extractedBin, destBin);
  await fs.chmod(destBin, 0o755);

  execFileSync(destBin, ["--version"], { stdio: "inherit" });
  console.log(`Bun runtime ready at ${destBin}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
