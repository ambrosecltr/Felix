# Felix

A macOS desktop app that lets kids build mini apps by chatting. They describe what they want, Felix generates it, and they iterate from there.

## Download

Download the latest macOS DMG from the [GitHub Releases tab](../../releases/latest), then drag Felix into Applications.

Felix is currently unsigned and not notarized with Apple yet. macOS may say the app or disk image is "damaged" after downloading or receiving it over AirDrop; that usually means Gatekeeper is blocking the unsigned build, not that the download is corrupt.

Current release builds are Apple Silicon only (`arm64`). They will not run on Intel Macs.

If macOS refuses to open the DMG or app, remove the quarantine attribute:

```bash
cd ~/Downloads
xattr -cr Felix-0.0.2-arm64.dmg
open Felix-0.0.2-arm64.dmg
```

After dragging Felix into Applications, run:

```bash
xattr -cr /Applications/Felix.app
open /Applications/Felix.app
```

## Quick Start

**Requirements:** macOS, [Bun](https://bun.sh) 1.3+, Node 24+

```bash
bun install
bun run dev:desktop
```

Then open Settings in the app and add an API key (OpenRouter or DeepSeek).

## How It Works

Each mini app gets its own folder, Vite dev server, SQLite database, and git history. When a kid sends a message in the build chat, Felix spins up a coding agent (PI) scoped to that app's directory. The agent edits files, the preview hot-reloads, and the kid sees the result.

The agent runs inside a macOS sandbox so it can't touch anything outside the mini app folder. Everything is local — no accounts, no cloud sync.

The packaged `.app` bundles its own Node, Bun, and PI agent runtimes so it doesn't depend on whatever the user has installed.

## Building

```bash
bun run package:desktop
```

Output lands in `apps/desktop/release/` as a DMG plus the unpacked app bundle. Local builds are unsigned. For distribution to other Macs, Felix needs to be signed with an Apple Developer ID certificate and notarized.

## Commands

| Command | Description |
| --- | --- |
| `bun run dev:desktop` | Run in dev mode |
| `bun run build` | Build all packages |
| `bun run typecheck` | Type-check the workspace |
| `bun run package:desktop` | Package `Felix.app` |
| `bun run setup:runtime` | Download bundled Node runtime |
| `bun run setup:bun` | Download bundled Bun runtime |
| `bun run bundle:agent` | Build the PI agent bundle |
| `bun run make:icon` | Regenerate icons from source image |

## Project Structure

```
apps/desktop        Electron main process, preload, packaging, bundled resources
apps/web            React UI rendered inside the desktop window
apps/core           Mini app lifecycle, agent runner, settings, runtimes
packages/contracts  Shared TypeScript types and IPC contracts
packages/shared     IDs, paths, git helpers
packages/mini-app-template  Scaffold template for new mini apps
scripts             Build scripts for runtimes, agent, and icons
```

## Packaging Notes

The packaged app needs the PI agent at `Contents/Resources/agent`. Electron Builder likes to strip `node_modules`, so there's an `afterPack` hook that copies the agent bundle into the `.app` manually.

If builds work in dev but the chat does nothing in the packaged app, check that this exists:

```
Felix.app/Contents/Resources/agent/node_modules/@earendil-works/pi-coding-agent
```

And that the bundled Node can run it:

```bash
apps/desktop/release/mac-arm64/Felix.app/Contents/Resources/node/bin/node \
  apps/desktop/release/mac-arm64/Felix.app/Contents/Resources/agent/node_modules/@earendil-works/pi-coding-agent/dist/cli.js \
  --version
```
