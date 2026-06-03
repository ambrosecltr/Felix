import * as fs from "node:fs/promises";
import { DEFAULT_SETTINGS, FelixSettings } from "@felix/contracts";
import { felixPaths } from "@felix/shared/paths";

export class SettingsStore {
  private cached: FelixSettings | null = null;

  async get(): Promise<FelixSettings> {
    if (this.cached) return this.cached;
    const { settingsFile } = felixPaths();
    try {
      const raw = await fs.readFile(settingsFile, "utf8");
      this.cached = FelixSettings.parse(JSON.parse(raw));
    } catch {
      this.cached = { ...DEFAULT_SETTINGS };
    }
    return this.cached;
  }

  async set(next: FelixSettings): Promise<FelixSettings> {
    const parsed = FelixSettings.parse(next);
    const paths = felixPaths();
    await fs.mkdir(paths.root, { recursive: true });
    await fs.writeFile(paths.settingsFile, JSON.stringify(parsed, null, 2), "utf8");
    this.cached = parsed;
    return parsed;
  }
}
