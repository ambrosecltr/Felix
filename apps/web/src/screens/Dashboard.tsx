import { useState } from "react";
import { useStore } from "../store.tsx";
import { Button } from "../components/ui/Button.tsx";
import { CreatingOverlay } from "../components/CreatingOverlay.tsx";
import felixIcon from "../assets/felix-icon.png";

export function Dashboard() {
  const { apps, createApp, openApp, goSettings } = useStore();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const text = prompt.trim();
    if (text.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      await createApp(text);
      setPrompt("");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't build your app: ${err.message}`
          : "Couldn't build your app. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 items-center justify-between border-b border-border pl-20 pr-3">
        <span className="text-sm font-semibold tracking-tight">Felix</span>
        <Button variant="ghost" size="sm" onClick={goSettings}>
          Settings
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-16">
          <section className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <img
                src={felixIcon}
                alt="Felix"
                className="h-20 w-20 select-none"
                draggable={false}
              />
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">
                  What do you want to build today?
                </h1>
                <p className="text-sm text-muted-foreground">
                  Describe your idea and Felix will get to work building it.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
                }}
                placeholder="A game where I catch falling stars…"
                rows={3}
                className="w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <span className="text-xs text-muted-foreground">⌘↵ to build</span>
                <Button onClick={() => void submit()} disabled={prompt.trim().length === 0}>
                  Build it
                </Button>
              </div>
            </div>

            {error && (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </section>

          {apps.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">Your mini apps</h2>
                <span className="text-xs text-muted-foreground">{apps.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {apps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => void openApp(app.id)}
                    className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
                  >
                    <span className="text-3xl">{app.emoji}</span>
                    <span className="truncate text-sm font-medium">{app.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {creating && <CreatingOverlay />}
    </div>
  );
}
