import { useEffect, useRef, useState } from "react";
import type { FelixSettings, ProviderId } from "@felix/contracts";
import { felix } from "../bridge.ts";
import { useStore } from "../store.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Card } from "../components/ui/Card.tsx";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "deepseek", label: "DeepSeek" },
];

export function Settings() {
  const { goDashboard } = useStore();
  const [settings, setSettings] = useState<FelixSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void felix.invoke("settings.get", undefined).then(setSettings);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (!settings) return null;

  const keyFor = (id: ProviderId) => settings.providers.find((p) => p.id === id)?.apiKey ?? "";

  const setKey = (id: ProviderId, apiKey: string) => {
    const others = settings.providers.filter((p) => p.id !== id);
    setSettings({ ...settings, providers: [...others, { id, apiKey }] });
  };

  const save = async () => {
    const next = await felix.invoke("settings.set", settings);
    setSettings(next);
    setSaved(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaved(false);
      saveTimeoutRef.current = null;
    }, 1500);
  };

  const fieldClass =
    "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40";

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 items-center justify-between border-b border-border pl-20 pr-3">
        <span className="text-sm font-semibold tracking-tight">Settings</span>
        <Button variant="ghost" size="sm" onClick={goDashboard}>
          Done
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-5 px-6 py-10">
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-sm font-medium">AI Provider</h2>
              <p className="text-xs text-muted-foreground">Which model Felix uses to help build.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Provider</label>
              <select
                value={settings.activeProvider}
                onChange={(e) =>
                  setSettings({ ...settings, activeProvider: e.target.value as ProviderId })
                }
                className={fieldClass}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Model</label>
              <input
                value={settings.activeModel}
                onChange={(e) => setSettings({ ...settings, activeModel: e.target.value })}
                className={fieldClass}
                placeholder="anthropic/claude-3.5-sonnet"
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-sm font-medium">API Keys</h2>
              <p className="text-xs text-muted-foreground">Stored locally on this computer.</p>
            </div>
            {PROVIDERS.map((p) => (
              <div key={p.id} className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">{p.label}</label>
                <input
                  type="password"
                  value={keyFor(p.id)}
                  onChange={(e) => setKey(p.id, e.target.value)}
                  className={fieldClass}
                  placeholder="sk-…"
                />
              </div>
            ))}
          </Card>

          <Card className="flex items-center justify-between gap-4 p-5">
            <div>
              <h2 className="text-sm font-medium">Allow apps to use the internet</h2>
              <p className="text-xs text-muted-foreground">
                Lets mini apps load things online. Turn off for extra safety.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.sandboxAllowNetwork}
              onClick={() =>
                setSettings({ ...settings, sandboxAllowNetwork: !settings.sandboxAllowNetwork })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                settings.sandboxAllowNetwork ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
                  settings.sandboxAllowNetwork ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </Card>

          <Button className="self-end" onClick={() => void save()}>
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
