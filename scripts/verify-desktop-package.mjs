#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const desktopDir = join(repoRoot, "apps", "desktop");
const args = process.argv.slice(2);
const releaseMode = args.includes("--release");
const appPathArg = args.find((arg) => !arg.startsWith("--"));
const appPath = appPathArg
  ? resolve(appPathArg)
  : join(desktopDir, "release", "mac-arm64", "Felix.app");
const resourcesDir = join(appPath, "Contents", "Resources");
const appAsarPath = join(resourcesDir, "app.asar");
const failures = [];
const desktopPkg = readJson(join(desktopDir, "package.json"), "Desktop package.json");
const version = typeof desktopPkg?.version === "string" ? desktopPkg.version : "0.0.0";
const releaseDir = join(desktopDir, "release");
const dmgPath = join(releaseDir, `Felix-${version}-arm64.dmg`);
const zipPath = join(releaseDir, `Felix-${version}-arm64.zip`);
const latestMacPath = join(releaseDir, "latest-mac.yml");

function fail(message) {
  failures.push(message);
}

function requirePath(filePath, description, options = {}) {
  if (!existsSync(filePath)) {
    fail(`${description} is missing: ${filePath}`);
    return false;
  }
  const stat = statSync(filePath);
  if (options.directory && !stat.isDirectory()) {
    fail(`${description} is not a directory: ${filePath}`);
    return false;
  }
  if (options.file && !stat.isFile()) {
    fail(`${description} is not a file: ${filePath}`);
    return false;
  }
  if (options.executable && (stat.mode & 0o111) === 0) {
    fail(`${description} is not executable: ${filePath}`);
    return false;
  }
  return true;
}

function readJson(filePath, description) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${description} is not valid JSON: ${errorMessage(error)}`);
    return null;
  }
}

function readAsarHeader(filePath) {
  const archive = readFileSync(filePath);
  if (archive.byteLength < 16) {
    throw new Error("ASAR archive is too small");
  }
  const headerSize = archive.readUInt32LE(4);
  const headerPickle = archive.subarray(8, 8 + headerSize);
  const headerStringSize = headerPickle.readUInt32LE(4);
  const headerString = headerPickle.subarray(8, 8 + headerStringSize).toString("utf8");
  return {
    archive,
    header: JSON.parse(headerString),
    headerString,
    headerSize,
  };
}

function getAsarEntry(header, filePath) {
  const parts = filePath.split("/").filter(Boolean);
  let entry = header;
  for (const part of parts) {
    entry = entry?.files?.[part];
    if (!entry) return null;
  }
  return entry;
}

function requireAsarFile(asar, filePath) {
  const entry = getAsarEntry(asar.header, filePath);
  if (!entry || typeof entry.size !== "number" || typeof entry.offset !== "string") {
    fail(`ASAR file is missing: ${filePath}`);
    return null;
  }
  const start = 8 + asar.headerSize + Number(entry.offset);
  const end = start + entry.size;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end > asar.archive.byteLength) {
    fail(`ASAR file has an invalid offset: ${filePath}`);
    return null;
  }
  return asar.archive.subarray(start, end);
}

function requireAsarDirectory(header, filePath) {
  const entry = getAsarEntry(header, filePath);
  if (!entry?.files) {
    fail(`ASAR directory is missing: ${filePath}`);
    return null;
  }
  return entry.files;
}

function textFromAsarFile(asar, filePath) {
  const bytes = requireAsarFile(asar, filePath);
  return bytes ? bytes.toString("utf8") : "";
}

async function assertNoSymlinks(rootDir, description) {
  if (!existsSync(rootDir)) return;
  const queue = [rootDir];
  while (queue.length > 0) {
    const dir = queue.shift();
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = join(dir, entry.name);
      const stat = lstatSync(filePath);
      if (stat.isSymbolicLink()) {
        fail(`${description} contains a symlink that may not survive packaging: ${filePath}`);
      } else if (stat.isDirectory()) {
        queue.push(filePath);
      }
    }
  }
}

function commandSucceeds(command, args, description) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
  } catch (error) {
    fail(`${description} failed: ${errorMessage(error)}`);
  }
}

function commandOutput(command, args, description) {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch (error) {
    fail(`${description} failed: ${errorMessage(error)}`);
    return "";
  }
}

function commandCombinedOutput(command, args, description) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    fail(`${description} failed: ${result.error?.message ?? result.stderr.trim()}`);
    return "";
  }
  return `${result.stdout}${result.stderr}`.trim();
}

function optionalCommandOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

function assertNodeSatisfiesEngine(version, engine, description) {
  if (typeof engine !== "string") return;
  const minimum = engine.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  if (!minimum) return;
  const actualParts = parseVersion(version);
  const expectedParts = minimum.slice(1).map(Number);
  if (!actualParts || compareVersions(actualParts, expectedParts) < 0) {
    fail(`${description} requires Node ${engine}, but bundled Node is ${version}`);
  }
}

function parseVersion(version) {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function sha512Base64(filePath) {
  return createHash("sha512").update(readFileSync(filePath)).digest("base64");
}

function releaseEntry(metadata, fileName) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = metadata.match(
    new RegExp(`- url: ${escaped}\\n\\s+sha512: ([^\\n]+)\\n\\s+size: (\\d+)`),
  );
  return match ? { sha512: match[1].trim(), size: Number(match[2]) } : null;
}

function assertReleaseMetadata(filePath, metadata) {
  if (!requirePath(filePath, "Release artifact", { file: true })) return;
  const fileName = filePath.split("/").at(-1);
  const entry = releaseEntry(metadata, fileName);
  if (!entry) {
    fail(`latest-mac.yml is missing metadata for ${fileName}`);
    return;
  }
  const size = statSync(filePath).size;
  const sha512 = sha512Base64(filePath);
  if (entry.size !== size) {
    fail(`latest-mac.yml size for ${fileName} is ${entry.size}, expected ${size}`);
  }
  if (entry.sha512 !== sha512) {
    fail(`latest-mac.yml sha512 for ${fileName} does not match the artifact`);
  }
}

function assertAsarIntegrityMatches() {
  const plistPath = join(appPath, "Contents", "Info.plist");
  const raw = optionalCommandOutput("/usr/bin/plutil", [
    "-extract",
    "ElectronAsarIntegrity",
    "json",
    "-o",
    "-",
    plistPath,
  ]);
  if (!raw) return;

  try {
    const integrity = JSON.parse(raw);
    const asarEntry = integrity["Resources/app.asar"];
    if (!asarEntry?.hash) return;
    const actual = createHash("sha256").update(readAsarHeader(appAsarPath).headerString).digest("hex");
    if (asarEntry.hash !== actual) {
      fail(`ElectronAsarIntegrity hash is ${asarEntry.hash}, expected ${actual}`);
    }
  } catch (error) {
    fail(`ElectronAsarIntegrity is not readable JSON: ${errorMessage(error)}`);
  }
}

function assertReleaseSigning() {
  commandSucceeds("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], "App code signature verification");
  const details = commandCombinedOutput("codesign", ["-dvvv", appPath], "App code signature details");
  if (/Signature=adhoc/.test(details)) fail("App is ad-hoc signed, expected Developer ID signing");
  if (/TeamIdentifier=not set/.test(details)) fail("App has no TeamIdentifier");
  commandSucceeds("xcrun", ["stapler", "validate", appPath], "App stapler validation");

  commandSucceeds("codesign", ["--verify", "--verbose=2", dmgPath], "DMG code signature verification");
  const dmgDetails = commandCombinedOutput("codesign", ["-dvvv", dmgPath], "DMG code signature details");
  if (/Signature=adhoc/.test(dmgDetails)) fail("DMG is ad-hoc signed, expected Developer ID signing");
  if (/TeamIdentifier=not set/.test(dmgDetails)) fail("DMG has no TeamIdentifier");
  commandSucceeds("xcrun", ["stapler", "validate", dmgPath], "DMG stapler validation");
}

function assertNoRuntimeImport(source, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\brequire\\(\\s*["']${escaped}["']\\s*\\)`),
    new RegExp(`\\bimport\\(\\s*["']${escaped}["']\\s*\\)`),
    new RegExp(`\\bfrom\\s+["']${escaped}["']`),
  ];
  if (patterns.some((pattern) => pattern.test(source))) {
    fail(`main bundle still imports ${packageName} at runtime`);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

requirePath(appPath, "Felix app bundle", { directory: true });
requirePath(join(appPath, "Contents", "MacOS", "Felix"), "Felix executable", {
  file: true,
  executable: true,
});
requirePath(resourcesDir, "Resources directory", { directory: true });
requirePath(join(resourcesDir, "app-update.yml"), "Updater config", { file: true });
requirePath(join(resourcesDir, "icon.icns"), "Bundle icon", { file: true });
requirePath(join(resourcesDir, "icon.png"), "Runtime icon", { file: true });
requirePath(join(resourcesDir, "native", "macos-window-chrome.node"), "macOS window chrome addon", {
  file: true,
});

const nodeBin = join(resourcesDir, "node", "bin", "node");
const bunBin = join(resourcesDir, "bun", "bin", "bun");
requirePath(nodeBin, "Bundled Node runtime", { file: true, executable: true });
requirePath(bunBin, "Bundled Bun runtime", { file: true, executable: true });
commandSucceeds(nodeBin, ["-e", "require('node:sqlite')"], "Bundled Node node:sqlite check");
commandSucceeds(bunBin, ["--version"], "Bundled Bun version check");
const bundledNodeVersion = commandOutput(
  nodeBin,
  ["-p", "process.versions.node"],
  "Bundled Node version check",
);

const agentDir = join(resourcesDir, "agent");
const piPkgDir = join(agentDir, "node_modules", "@earendil-works", "pi-coding-agent");
const piPkg = readJson(join(piPkgDir, "package.json"), "Bundled PI package.json");
const piBinRel = typeof piPkg?.bin === "string" ? piPkg.bin : piPkg?.bin?.pi ?? "dist/cli.js";
const piBin = join(piPkgDir, piBinRel);
requirePath(piBin, "Bundled PI CLI", { file: true });
assertNodeSatisfiesEngine(
  bundledNodeVersion,
  piPkg?.engines?.node,
  "Bundled PI agent",
);
commandSucceeds(nodeBin, [piBin, "--version"], "Bundled PI CLI check");
requirePath(
  join(agentDir, "node_modules", "@juicesharp", "rpiv-web-tools", "package.json"),
  "PI web tools extension",
  { file: true },
);
requirePath(join(agentDir, "node_modules", "pi-nvidia-nim", "package.json"), "PI NVIDIA extension", {
  file: true,
});
requirePath(join(agentDir, "node_modules", "pi-opencode-bridge", "package.json"), "PI OpenCode extension", {
  file: true,
});
await assertNoSymlinks(agentDir, "Bundled PI agent install");

let asar = null;
if (requirePath(appAsarPath, "Application ASAR", { file: true })) {
  try {
    asar = readAsarHeader(appAsarPath);
  } catch (error) {
    fail(`Application ASAR header is unreadable: ${errorMessage(error)}`);
  }
}

if (asar) {
  const asarPkg = JSON.parse(textFromAsarFile(asar, "package.json") || "null");
  if (asarPkg?.main !== "dist/main/main.js") {
    fail(`Packaged package.json main is ${JSON.stringify(asarPkg?.main)}, expected "dist/main/main.js"`);
  }
  if (desktopPkg?.version && asarPkg?.version !== desktopPkg.version) {
    fail(
      `Packaged package.json version is ${JSON.stringify(asarPkg?.version)}, expected ${JSON.stringify(
        desktopPkg.version,
      )}`,
    );
  }

  const mainJs = textFromAsarFile(asar, "dist/main/main.js");
  textFromAsarFile(asar, "dist/preload/preload.cjs");
  textFromAsarFile(asar, "dist/renderer/index.html");
  const rendererAssets = requireAsarDirectory(asar.header, "dist/renderer/assets");
  if (rendererAssets) {
    const assetNames = Object.keys(rendererAssets);
    if (!assetNames.some((name) => name.endsWith(".js"))) fail("Renderer JS asset is missing");
    if (!assetNames.some((name) => name.endsWith(".css"))) fail("Renderer CSS asset is missing");
  }

  for (const packageName of [
    "electron-updater",
    "@felix/core",
    "@felix/contracts",
    "@felix/shared",
    "@felix/mini-app-template",
  ]) {
    assertNoRuntimeImport(mainJs, packageName);
  }
}

if (releaseMode) {
  requirePath(dmgPath, "Release DMG", { file: true });
  requirePath(zipPath, "Release ZIP", { file: true });
  if (requirePath(latestMacPath, "latest-mac.yml", { file: true })) {
    const metadata = readFileSync(latestMacPath, "utf8");
    if (!metadata.includes(`version: ${version}`)) {
      fail(`latest-mac.yml does not reference version ${version}`);
    }
    if (!metadata.includes(`path: Felix-${version}-arm64.zip`)) {
      fail(`latest-mac.yml path does not reference Felix-${version}-arm64.zip`);
    }
    assertReleaseMetadata(zipPath, metadata);
    assertReleaseMetadata(dmgPath, metadata);
  }
  assertAsarIntegrityMatches();
  assertReleaseSigning();
}

if (failures.length > 0) {
  console.error(`Felix desktop package verification failed for ${appPath}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Felix desktop ${releaseMode ? "release " : ""}package verification passed for ${appPath}`,
);
