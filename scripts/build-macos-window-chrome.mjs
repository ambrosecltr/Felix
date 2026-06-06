import { mkdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "apps/desktop/native/macos-window-chrome.mm");
const outputDir = path.join(root, "apps/desktop/resources/native");
const output = path.join(outputDir, "macos-window-chrome.node");

if (process.platform !== "darwin") {
  console.log("Skipping macOS window chrome native build on non-macOS host.");
  process.exit(0);
}

function firstExistingDirectory(candidates) {
  for (const candidate of candidates) {
    try {
      if (statSync(path.join(candidate, "node_api.h")).isFile()) return candidate;
    } catch {
      // Keep trying the remaining candidates.
    }
  }
  throw new Error("Could not find node_api.h for building the macOS window chrome addon.");
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }
  return result.stdout.trim();
}

const nodeRoot = path.resolve(path.dirname(process.execPath), "..");
const includeDir = firstExistingDirectory([
  process.env.npm_config_nodedir ? path.join(process.env.npm_config_nodedir, "include/node") : "",
  path.join(nodeRoot, "include/node"),
  "/opt/homebrew/include/node",
  "/usr/local/include/node",
].filter(Boolean));

const clang = commandOutput("xcrun", ["--find", "clang++"]);
const sdkPath = commandOutput("xcrun", ["--sdk", "macosx", "--show-sdk-path"]);
const arch = process.arch === "arm64" ? "arm64" : "x86_64";

mkdirSync(outputDir, { recursive: true });

const args = [
  "-std=c++17",
  "-fobjc-arc",
  "-ObjC++",
  "-bundle",
  "-undefined",
  "dynamic_lookup",
  "-mmacosx-version-min=11.0",
  "-isysroot",
  sdkPath,
  "-arch",
  arch,
  "-I",
  includeDir,
  "-framework",
  "AppKit",
  "-framework",
  "Foundation",
  source,
  "-o",
  output,
];

const result = spawnSync(clang, args, { stdio: "inherit" });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`macOS window chrome addon ready at ${output}`);
