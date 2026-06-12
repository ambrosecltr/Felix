import { ipcMain } from "electron";
import type { MiniAppManager } from "@felix/core";
import {
  MiniAppIconRequest,
  SendChatRequest,
  SetProfileNameRequest,
  SettingsLockdownSetRequest,
  SettingsLockdownVerifyRequest,
} from "@felix/contracts";
import type { ExtensionUiResponse, FelixApiChannel } from "@felix/contracts";
import type { MiniAppView } from "./miniAppView.ts";
import type { UpdateController } from "./updater.ts";

export function registerIpc(
  manager: MiniAppManager,
  getView: () => MiniAppView | null,
  updates: UpdateController,
): void {
  const handle = <C extends FelixApiChannel>(
    channel: C,
    fn: (arg: unknown) => unknown,
  ): void => {
    ipcMain.handle(channel, (_event, arg) => fn(arg));
  };

  handle("miniApp.list", () => manager.list());
  handle("miniApp.create", (arg) => manager.create((arg as { prompt: string }).prompt));
  handle("miniApp.open", (arg) => manager.open((arg as { appId: string }).appId));
  handle("miniApp.icon", (arg) => manager.iconData(MiniAppIconRequest.parse(arg).appId));
  handle("miniApp.stop", (arg) => manager.stop((arg as { appId: string }).appId));
  handle("miniApp.delete", (arg) => manager.delete((arg as { appId: string }).appId));

  handle("chat.history", (arg) => manager.chatHistory((arg as { appId: string }).appId));
  handle("chat.clear", (arg) => manager.clearChat((arg as { appId: string }).appId));
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
  handle("settings.lockdown.status", () => manager.getLockdownStatus());
  handle("settings.lockdown.set", (arg) =>
    manager.setLockdown(SettingsLockdownSetRequest.parse(arg)),
  );
  handle("settings.lockdown.verify", (arg) =>
    manager.verifyLockdown(SettingsLockdownVerifyRequest.parse(arg)),
  );
  handle("profile.get", () => manager.getProfileOverview());
  handle("profile.setName", (arg) => manager.setProfileName(SetProfileNameRequest.parse(arg)));
  handle("provider.models", (arg) => manager.listProviderModels(arg as never));
  handle("update.status", () => updates.getStatus());
  handle("update.check", () => updates.checkForUpdates());
  handle("update.downloadAndInstall", () => updates.downloadAndInstall());

  // Mini app view control (not part of the typed FelixApi - main-only).
  ipcMain.handle("miniAppView.attach", (_e, arg: { appId: string; webContentsId: number }) => {
    const view = requireMiniAppView(getView);
    const appId = validateAppId(arg.appId);
    if (typeof arg.webContentsId !== "number" || !Number.isInteger(arg.webContentsId)) {
      throw new Error("Invalid mini app preview id");
    }
    view.attach(appId, arg.webContentsId);
  });
  ipcMain.handle("miniAppView.detach", () => getView()?.detach());
  ipcMain.handle("miniAppView.reload", () => getView()?.reload());
}

function requireMiniAppView(getView: () => MiniAppView | null): MiniAppView {
  const view = getView();
  if (!view) throw new Error("Mini app view is not available");
  return view;
}

function validateAppId(appId: string): string {
  if (typeof appId !== "string" || appId.trim().length === 0) {
    throw new Error("Invalid mini app id");
  }
  return appId;
}
