import { useEffect, useRef } from "react";
import { felix } from "../bridge.ts";

interface WebviewElement extends HTMLWebViewElement {
  getWebContentsId(): number;
}

/**
 * Renders the mini app's dev server inside a <webview>. Because the guest is
 * a regular DOM element, the rest of the UI (build chat tab, dialogs, menus)
 * stacks above it with plain CSS. The guest's WebContents id is handed to the
 * main process so Felix's browser tools can drive it.
 */
export function MiniAppPreview({ appId, url }: { appId: string; url: string }) {
  const webviewRef = useRef<HTMLWebViewElement>(null);

  useEffect(() => {
    const webview = webviewRef.current as WebviewElement | null;
    if (!webview) return;

    const onDomReady = () => {
      void felix.view.attach(appId, webview.getWebContentsId());
    };
    webview.addEventListener("dom-ready", onDomReady);
    return () => {
      webview.removeEventListener("dom-ready", onDomReady);
      void felix.view.detach();
    };
  }, [appId, url]);

  return (
    <webview
      ref={webviewRef}
      src={url}
      className="absolute inset-0 h-full w-full"
    />
  );
}
