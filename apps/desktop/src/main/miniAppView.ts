import { type BrowserWindow, WebContentsView } from "electron";

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Manages a single WebContentsView layered over the main window that shows
 * the currently open mini app's running dev server. Using a real web
 * contents (rather than an iframe) lets Felix later screenshot, drive, and
 * let the kid annotate the live page.
 */
export class MiniAppView {
  private view: WebContentsView | null = null;
  private currentUrl: string | null = null;
  private bounds: ViewBounds = { x: 0, y: 0, width: 0, height: 0 };
  private visible = false;

  constructor(private readonly window: BrowserWindow) {}

  private ensureView(): WebContentsView {
    if (this.isWindowDestroyed()) throw new Error("Mini app window has been destroyed");
    if (this.view) return this.view;
    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    return this.view;
  }

  private isWindowDestroyed(): boolean {
    return this.window.isDestroyed();
  }

  private isViewDestroyed(view: WebContentsView | null = this.view): boolean {
    if (!view) return true;
    try {
      return view.webContents.isDestroyed();
    } catch {
      return true;
    }
  }

  show(url: string, bounds: ViewBounds): void {
    if (this.isWindowDestroyed()) return;
    const view = this.ensureView();
    if (!this.visible) {
      this.window.contentView.addChildView(view);
      this.visible = true;
    }
    this.setBounds(bounds);
    if (url !== this.currentUrl) {
      this.currentUrl = url;
      void view.webContents.loadURL(url);
    }
  }

  setBounds(bounds: ViewBounds): void {
    this.bounds = bounds;
    if (this.isViewDestroyed()) return;
    this.view?.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  reload(): void {
    if (this.isViewDestroyed()) return;
    this.view?.webContents.reload();
  }

  hide(): void {
    if (!this.view || !this.visible) return;
    const view = this.view;
    this.visible = false;
    if (!this.isWindowDestroyed() && !this.isViewDestroyed(view)) {
      this.window.contentView.removeChildView(view);
    }
  }

  destroy(): void {
    const view = this.view;
    this.hide();
    if (view && !this.isViewDestroyed(view)) {
      view.webContents.close({ waitForBeforeUnload: false });
    }
    this.view = null;
    this.currentUrl = null;
    this.visible = false;
  }
}
