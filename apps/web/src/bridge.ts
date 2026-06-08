import type {
  FelixApiChannel,
  FelixApiRequest,
  FelixApiResponse,
  PushEvent,
} from "@felix/contracts";

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FelixBridge {
  invoke<C extends FelixApiChannel>(
    channel: C,
    arg: FelixApiRequest<C>,
  ): Promise<FelixApiResponse<C>>;
  onPush(listener: (event: PushEvent) => void): () => void;
  view: {
    show(appId: string, url: string, bounds: ViewBounds): Promise<void>;
    setBounds(bounds: ViewBounds): Promise<void>;
    hide(): Promise<void>;
    reload(): Promise<void>;
  };
}

declare global {
  interface Window {
    felix: FelixBridge;
  }
}

export const felix: FelixBridge = window.felix;
