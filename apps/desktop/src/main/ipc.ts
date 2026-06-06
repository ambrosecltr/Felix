import { ipcMain } from "electron";
import type { MiniAppManager } from "@felix/core";
import { SendChatRequest } from "@felix/contracts";
import type { ExtensionUiResponse, FelixApiChannel } from "@felix/contracts";
import type { MiniAppView, ViewBounds } from "./miniAppView.ts";

const MAX_VIEW_BOUND = 100_000;

export function registerIpc(manager: MiniAppManager, getView: () => MiniAppView | null): void {
  const handle = <C extends FelixApiChannel>(
    channel: C,
    fn: (arg: unknown) => unknown,
  ): void => {
    ipcMain.handle(channel, (_event, arg) => fn(arg));
  };

  handle("miniApp.list", () => manager.list());
  handle("miniApp.create", (arg) => manager.create((arg as { prompt: string }).prompt));
  handle("miniApp.open", (arg) => manager.open((arg as { appId: string }).appId));
  handle("miniApp.stop", (arg) => manager.stop((arg as { appId: string }).appId));
  handle("miniApp.delete", (arg) => manager.delete((arg as { appId: string }).appId));

  handle("chat.history", (arg) => manager.chatHistory((arg as { appId: string }).appId));
  handle("chat.send", (arg) => {
    const { appId, text, attachments } = SendChatRequest.parse(arg);
    return manager.sendChat(appId, text, attachments);
  });
  handle("chat.abort", (arg) => manager.abortChat((arg as { appId: string }).appId));
  handle("agent.ui.respond", (arg) => {
    const { appId, response } = arg as { appId: string; response: ExtensionUiResponse };
    return manager.respondToAgentUi(appId, response);
  });

  handle("checkpoint.list", (arg) => manager.listCheckpoints((arg as { appId: string }).appId));
  handle("checkpoint.restore", (arg) => {
    const { appId, checkpointId } = arg as { appId: string; checkpointId: string };
    return manager.restoreCheckpoint(appId, checkpointId);
  });

  handle("settings.get", () => manager.getSettings());
  handle("settings.set", (arg) => manager.setSettings(arg as never));
  handle("provider.models", (arg) => manager.listProviderModels(arg as never));

  // Mini app view control (not part of the typed FelixApi - main-only).
  ipcMain.handle("miniAppView.show", (_e, arg: { url: string; bounds: ViewBounds }) => {
    const view = requireMiniAppView(getView);
    const url = validateMiniAppUrl(arg.url);
    const bounds = validateBounds(arg.bounds);
    view.show(url, bounds);
  });
  ipcMain.handle("miniAppView.setBounds", (_e, bounds: ViewBounds) => {
    const view = requireMiniAppView(getView);
    view.setBounds(validateBounds(bounds));
  });
  ipcMain.handle("miniAppView.hide", () => getView()?.hide());
  ipcMain.handle("miniAppView.reload", () => getView()?.reload());
}

function requireMiniAppView(getView: () => MiniAppView | null): MiniAppView {
  const view = getView();
  if (!view) throw new Error("Mini app view is not available");
  return view;
}

function validateMiniAppUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid mini app URL");
  }
  const allowedProtocol = url.protocol === "http:";
  const allowedHost =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1";
  if (!allowedProtocol || !allowedHost) {
    throw new Error(`Mini app URL is not allowed: ${url.origin}`);
  }
  return url.toString();
}

function validateBounds(bounds: ViewBounds): ViewBounds {
  return {
    x: clampBound(bounds.x, 0),
    y: clampBound(bounds.y, 0),
    width: clampBound(bounds.width, 1),
    height: clampBound(bounds.height, 1),
  };
}

function clampBound(value: number, min: number): number {
  if (!Number.isFinite(value)) throw new Error("Invalid mini app view bounds");
  return Math.min(Math.max(value, min), MAX_VIEW_BOUND);
}
