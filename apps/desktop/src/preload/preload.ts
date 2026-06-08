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

interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
    show: (appId: string, url: string, bounds: ViewBounds) =>
      ipcRenderer.invoke("miniAppView.show", { appId, url, bounds }),
    setBounds: (bounds: ViewBounds) => ipcRenderer.invoke("miniAppView.setBounds", bounds),
    hide: () => ipcRenderer.invoke("miniAppView.hide"),
    reload: () => ipcRenderer.invoke("miniAppView.reload"),
  },
};

export type FelixBridge = typeof api;

contextBridge.exposeInMainWorld("felix", api);
