#!/usr/bin/env node
// Downloads a standalone Node runtime (>= 22.5, which includes node:sqlite)
// into apps/desktop/resources/node so packaged Felix can run mini app dev
// servers independently of Electron's bundled Node.
import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const NODE_VERSION = process.env.FELIX_NODE_VERSION ?? "v22.14.0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.join(__dirname, "..", "apps", "desktop", "resources", "node");

function platformTriple() {
  const platform = os.platform();
  const arch = os.arch();
  const archMap = { x64: "x64", arm64: "arm64" };
  const a = archMap[arch];
  if (!a) throw new Error(`Unsupported arch: ${arch}`);
  if (platform === "darwin") return { os: "darwin", arch: a, ext: "tar.gz" };
  if (platform === "linux") return { os: "linux", arch: a, ext: "tar.gz" };
  if (platform === "win32") return { os: "win", arch: a, ext: "zip" };
  throw new Error(`Unsupported platform: ${platform}`);
}

async function main() {
  const { os: o, arch, ext } = platformTriple();
  const name = `node-${NODE_VERSION}-${o}-${arch}`;
  const url = `https://nodejs.org/dist/${NODE_VERSION}/${name}.${ext}`;

  await fs.mkdir(resourcesDir, { recursive: true });
  const tmp = path.join(os.tmpdir(), `${name}.${ext}`);

  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  await pipeline(res.body, createWriteStream(tmp));

  console.log("Extracting...");
  if (ext === "tar.gz") {
    const extractRoot = path.join(path.dirname(resourcesDir), `${name}.tmp`);
    await fs.rm(extractRoot, { recursive: true, force: true });
    await fs.mkdir(extractRoot, { recursive: true });
    execFileSync("tar", ["-xzf", tmp, "-C", extractRoot], { stdio: "inherit" });
    const extracted = path.join(extractRoot, name);
    await fs.rm(resourcesDir, { recursive: true, force: true });
    await fs.rename(extracted, resourcesDir);
    await fs.rm(extractRoot, { recursive: true, force: true });
  } else {
    throw new Error("Windows zip extraction not implemented in base version");
  }

  const nodeBin = path.join(resourcesDir, "bin", "node");
  execFileSync(nodeBin, ["-e", "require('node:sqlite'); console.log('node:sqlite OK', process.version)"], {
    stdio: "inherit",
  });
  console.log(`Node runtime ready at ${resourcesDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
