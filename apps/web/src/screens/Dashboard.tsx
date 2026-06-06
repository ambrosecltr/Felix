import { useState } from "react";
import { useStore } from "../store.tsx";
import { filesToChatAttachments } from "../lib/message-attachments.ts";
import { useIcon } from "../lib/icon-context.tsx";
import { Button } from "../components/ui/Button.tsx";
import { CreatingOverlay } from "../components/CreatingOverlay.tsx";
import { InputMessage } from "../components/ui/input-message.tsx";
import felixIcon from "../assets/felix-icon.png";

export function Dashboard() {
  const { apps, createApp, openApp, goSettings } = useStore();
  const [prompt, setPrompt] = useState("");
  const [promptFiles, setPromptFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const PaperclipIcon = useIcon("paperclip");
  const SettingsIcon = useIcon("settings");

  const submit = async (value: string, files: File[]) => {
    const text = value.trim();
    if (text.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const attachments = await filesToChatAttachments(files);
      await createApp(text, attachments);
      setPrompt("");
      setPromptFiles([]);
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
        <Button variant="ghost" size="sm" leadingIcon={SettingsIcon} onClick={goSettings}>
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

            <InputMessage
              value={prompt}
              onValueChange={setPrompt}
              onSend={(value, files) => void submit(value, files)}
              placeholder="A game where I catch falling stars..."
              minRows={3}
              maxRows={8}
              sendLabel="Build"
              disabled={creating}
              files={promptFiles}
              onFilesChange={setPromptFiles}
              maxFiles={4}
              allowFileOnly={false}
              leftSlot={({ openFilePicker }) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Attach files"
                  title="Attach files"
                  disabled={creating}
                  onClick={() => openFilePicker()}
                >
                  <PaperclipIcon />
                </Button>
              )}
            />

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
                    className="group flex flex-col gap-3 rounded-3xl bg-surface-2 p-4 text-left shadow-surface-2 transition-colors hover:bg-hover"
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
