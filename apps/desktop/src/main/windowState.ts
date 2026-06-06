import * as fs from "node:fs";
import * as path from "node:path";
import { app, screen, type BrowserWindow, type Rectangle } from "electron";

const DEFAULT_BOUNDS = {
  width: 1200,
  height: 820,
};

const MIN_BOUNDS = {
  width: 940,
  height: 640,
};

const MIN_VISIBLE_AREA = 80;
const SAVE_DELAY_MS = 250;

interface SavedWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
}
function statePath(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeState(value: unknown): SavedWindowState | null {
  if (!isRecord(value)) return null;
  if (!finiteNumber(value.width) || !finiteNumber(value.height)) return null;

  const state: SavedWindowState = {
    width: Math.max(Math.round(value.width), MIN_BOUNDS.width),
    height: Math.max(Math.round(value.height), MIN_BOUNDS.height),
  };

  if (finiteNumber(value.x) && finiteNumber(value.y)) {
    state.x = Math.round(value.x);
    state.y = Math.round(value.y);
  }

  return state;
}

function intersectsWorkArea(bounds: SavedWindowState): boolean {
  if (bounds.x === undefined || bounds.y === undefined) return false;
  const rect = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  return screen.getAllDisplays().some(({ workArea }) => {
    const xOverlap =
      Math.min(rect.x + rect.width, workArea.x + workArea.width) - Math.max(rect.x, workArea.x);
    const yOverlap =
      Math.min(rect.y + rect.height, workArea.y + workArea.height) - Math.max(rect.y, workArea.y);
    return xOverlap >= MIN_VISIBLE_AREA && yOverlap >= MIN_VISIBLE_AREA;
  });
}

export function readWindowState(): SavedWindowState {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const saved = normalizeState(JSON.parse(raw));
    if (!saved) return DEFAULT_BOUNDS;
    if (saved.x === undefined || saved.y === undefined) return saved;
    return intersectsWorkArea(saved) ? saved : { width: saved.width, height: saved.height };
  } catch {
    return DEFAULT_BOUNDS;
  }
}

function writeWindowState(bounds: Rectangle): void {
  const state: SavedWindowState = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(bounds.width, MIN_BOUNDS.width),
    height: Math.max(bounds.height, MIN_BOUNDS.height),
  };

  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`);
  } catch (error) {
    console.warn(
      "[felix] could not save window state:",
      error instanceof Error ? error.message : error,
    );
  }
}

export function persistWindowState(window: BrowserWindow): void {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    writeWindowState(window.getNormalBounds());
  };

  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      save();
    }, SAVE_DELAY_MS);
  };

  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("close", () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    save();
  });
}
