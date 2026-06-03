import { type RefObject, useEffect } from "react";
import { felix } from "../bridge.ts";

/**
 * Keeps the native WebContentsView aligned with the placeholder element and
 * pointed at the running dev server. Hides it on unmount so it doesn't cover
 * the dashboard / settings.
 */
export function useMiniAppView(
  placeholderRef: RefObject<HTMLElement>,
  devUrl: string | null,
): void {
  useEffect(() => {
    const el = placeholderRef.current;
    if (!el || !devUrl) return;

    const sync = () => {
      const rect = el.getBoundingClientRect();
      const bounds = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
      void felix.view.show(devUrl, bounds);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      void felix.view.hide();
    };
  }, [placeholderRef, devUrl]);
}
