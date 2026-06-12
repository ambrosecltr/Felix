import { contextBridge, ipcRenderer } from "electron";
import {
  type FelixApiChannel,
  type FelixApiRequest,
  type FelixApiResponse,
  PUSH_CHANNEL,
  type PushEvent,
} from "@felix/contracts";

function markElectronRuntime(): void {
  const root = document.documentElement;
  if (!root) {
    window.addEventListener("DOMContentLoaded", markElectronRuntime, { once: true });
    return;
  }
  root.dataset.felixRuntime = "electron";
}

markElectronRuntime();

function invoke<C extends FelixApiChannel>(
  channel: C,
  arg: FelixApiRequest<C>,
): Promise<FelixApiResponse<C>> {
  return ipcRenderer.invoke(channel, arg) as Promise<FelixApiResponse<C>>;
}

const api = {
  invoke,
  onPush(listener: (event: PushEvent) => void): () => void {
    const handler = (_e: unknown, event: PushEvent) => listener(event);
    ipcRenderer.on(PUSH_CHANNEL, handler);
    return () => ipcRenderer.off(PUSH_CHANNEL, handler);
  },
  view: {
    attach: (appId: string, webContentsId: number) =>
      ipcRenderer.invoke("miniAppView.attach", { appId, webContentsId }),
    detach: () => ipcRenderer.invoke("miniAppView.detach"),
    reload: () => ipcRenderer.invoke("miniAppView.reload"),
  },
};

export type FelixBridge = typeof api;

contextBridge.exposeInMainWorld("felix", api);
