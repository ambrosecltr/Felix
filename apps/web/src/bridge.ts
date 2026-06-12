import type {
  FelixApiChannel,
  FelixApiRequest,
  FelixApiResponse,
  PushEvent,
} from "@felix/contracts";

interface FelixBridge {
  invoke<C extends FelixApiChannel>(
    channel: C,
    arg: FelixApiRequest<C>,
  ): Promise<FelixApiResponse<C>>;
  onPush(listener: (event: PushEvent) => void): () => void;
  view: {
    attach(appId: string, webContentsId: number): Promise<void>;
    detach(): Promise<void>;
    reload(): Promise<void>;
  };
}

declare global {
  interface Window {
    felix: FelixBridge;
  }
}

export const felix: FelixBridge = window.felix;
