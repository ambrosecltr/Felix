![Felix header](docs/images/felix-readme-header.png)

# Felix

Felix is a macOS coding app for kids. They describe the app they want to make, Felix builds a little web app, and then they can keep chatting to change, fix, and grow it.

The goal is to make real coding feel approachable without turning it into a toy. Felix creates actual Vite apps on disk, runs them locally, keeps their history in git, and uses a coding agent to make changes while the app preview updates.

## Download

Download the latest signed and notarized macOS build from [GitHub Releases](../../releases/latest).

Current public builds are Apple Silicon only (`arm64`). Download the DMG, open it, and drag Felix into Applications.

## What Felix Does

- Turns a plain-language idea into a working mini app.
- Lets kids keep iterating through chat instead of starting over.
- Shows the app in a live preview while Felix works.
- Keeps each mini app in its own local folder with its own source code, SQLite database, Vite dev server, and git history.
- Supports model providers through Settings, currently including OpenRouter, DeepSeek, OpenCode Go, and OpenCode Zen.
- Can generate dashboard icons when icon generation is enabled.
- Ships release builds with bundled Node, Bun, and agent runtimes, so the installed app does not depend on whatever developer tools are already on the Mac.

## Safety And Sandboxing

Felix is designed around small, local projects with clear boundaries.

Each mini app lives in its own folder. When Felix starts the coding agent for that app, it runs the agent from inside that folder and, on macOS, wraps it in a Seatbelt sandbox. The sandbox allows the agent to read what it needs to run, but limits writes to the mini app directory plus standard temporary and package-cache locations.

Network access for the sandbox can be turned off in Settings for a stricter local-only mode. Project data stays on the Mac: Felix does not require accounts or cloud sync. API keys are configured locally in the app.

## How It Works

Felix has three main pieces:

- `apps/desktop`: the Electron desktop shell, app packaging, signing, notarization, bundled runtimes, and updater integration.
- `apps/web`: the React interface shown inside the desktop app.
- `apps/core`: mini app creation, Vite lifecycle, chat history, settings, sandbox setup, and agent orchestration.

When a mini app is created, Felix scaffolds a Vite project from `packages/mini-app-template`, installs dependencies with Bun, starts a local dev server, and opens the preview. Chat messages are sent to the PI coding agent in RPC mode, scoped to that mini app's working directory.

## Local Development

Requirements:

- macOS
- [Bun](https://bun.sh) 1.3+
- Node 24+

Install dependencies:

```bash
bun install
```

Run the desktop app in development:

```bash
bun run dev:desktop
```

Then open Settings in Felix and add an API key for the provider you want to use.

Useful commands:

| Command | Description |
| --- | --- |
| `bun run dev:desktop` | Run Felix in dev mode |
| `bun run dev:desktop:update` | Run in dev mode with a simulated update available |
| `bun run build` | Build all packages |
| `bun run typecheck` | Type-check the workspace |
| `bun run test` | Run the test suite |
| `bun run setup:runtime` | Download the bundled Node runtime |
| `bun run setup:bun` | Download the bundled Bun runtime |
| `bun run bundle:agent` | Build the bundled PI agent install |
| `bun run make:icon` | Regenerate app icons from the source image |

## Building The Desktop App

For a local unsigned package:

```bash
bun run package:desktop:unsigned
```

Unsigned packages are useful for local packaging checks, but they are not valid public releases. Official signed and notarized builds are published from [GitHub Releases](../../releases/latest).

## Project Structure

```text
apps/desktop                 Electron main process, preload, packaging, bundled resources
apps/web                     React UI rendered inside the desktop window
apps/core                    Mini app lifecycle, agent runner, settings, runtimes
packages/contracts           Shared TypeScript types and IPC contracts
packages/shared              IDs, paths, git helpers
packages/mini-app-template   Scaffold template for new mini apps
scripts                      Build scripts for runtimes, agent, icons, and packaging
```

## Packaging Notes

The packaged app needs the PI agent at `Contents/Resources/agent`. Electron Builder can strip workspace `node_modules`, so `apps/desktop/scripts/copy-agent-after-pack.cjs` copies the agent bundle into the `.app` during packaging.

If builds work in dev but chat does nothing in the packaged app, check that this exists:

```text
Felix.app/Contents/Resources/agent/node_modules/@earendil-works/pi-coding-agent
```

And that the bundled Node can run it:

```bash
apps/desktop/release/mac-arm64/Felix.app/Contents/Resources/node/bin/node \
  apps/desktop/release/mac-arm64/Felix.app/Contents/Resources/agent/node_modules/@earendil-works/pi-coding-agent/dist/cli.js \
  --version
```
