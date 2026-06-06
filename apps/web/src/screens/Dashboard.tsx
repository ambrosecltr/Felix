import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { MiniAppSummary } from "@felix/contracts";
import { useStore } from "../store.tsx";
import { filesToChatAttachments } from "../lib/message-attachments.ts";
import { type IconComponent, useIcon } from "../lib/icon-context.tsx";
import { cn } from "../lib/utils.ts";
import { Button } from "../components/ui/Button.tsx";
import { CreatingOverlay } from "../components/CreatingOverlay.tsx";
import { MiniAppIconView } from "../components/MiniAppIconView.tsx";
import { InputMessage } from "../components/ui/input-message.tsx";
import { MyFelixPanel } from "./MyFelix.tsx";
import felixIcon from "../assets/felix-icon.png";

type DashboardTab = "apps" | "build" | "profile";

const DASHBOARD_TABS: Array<{ value: DashboardTab; label: string }> = [
  { value: "apps", label: "My apps" },
  { value: "build", label: "Build with Felix" },
  { value: "profile", label: "My Felix" },
];

export function Dashboard() {
  const { apps, createApp, openApp, goSettings } = useStore();
  const [activeTab, setActiveTab] = useState<DashboardTab>("apps");
  const [prompt, setPrompt] = useState("");
  const [promptFiles, setPromptFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();
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
    <div className="flex h-full flex-col bg-background">
      <header className="drag-region relative flex h-16 shrink-0 items-start justify-center px-4 pt-4">
        <DashboardTabs
          value={activeTab}
          onValueChange={setActiveTab}
          reducedMotion={shouldReduceMotion}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-3 top-3"
          onClick={goSettings}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon />
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === "apps" ? (
            <MotionPanel key="apps" reducedMotion={shouldReduceMotion}>
              <AppsPanel apps={apps} openApp={openApp} onBuild={() => setActiveTab("build")} />
            </MotionPanel>
          ) : activeTab === "build" ? (
            <MotionPanel key="build" reducedMotion={shouldReduceMotion}>
              <BuildPanel
                prompt={prompt}
                promptFiles={promptFiles}
                creating={creating}
                error={error}
                PaperclipIcon={PaperclipIcon}
                onPromptChange={setPrompt}
                onPromptFilesChange={setPromptFiles}
                onSubmit={submit}
              />
            </MotionPanel>
          ) : (
            <MotionPanel key="profile" reducedMotion={shouldReduceMotion}>
              <MyFelixPanel />
            </MotionPanel>
          )}
        </AnimatePresence>
      </main>

      {creating && <CreatingOverlay />}
    </div>
  );
}

function DashboardTabs({
  value,
  onValueChange,
  reducedMotion,
}: {
  value: DashboardTab;
  onValueChange: (value: DashboardTab) => void;
  reducedMotion: boolean | null;
}) {
  const selectedIndex = DASHBOARD_TABS.findIndex((tab) => tab.value === value);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (selectedIndex + direction + DASHBOARD_TABS.length) % DASHBOARD_TABS.length;
    onValueChange(DASHBOARD_TABS[nextIndex]?.value ?? value);
  };

  return (
    <div
      role="tablist"
      aria-label="Dashboard view"
      onKeyDown={handleKeyDown}
      className="inline-flex items-center gap-1 rounded-full bg-muted p-1 [-webkit-app-region:no-drag]"
    >
      {DASHBOARD_TABS.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "relative inline-flex h-7 items-center justify-center rounded-full px-4 text-[12px] leading-none outline-none transition-colors duration-80 text-box-trim-both text-box-edge-cap-alphabetic focus-visible:ring-1 focus-visible:ring-ring",
              active ? "text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="dashboard-tab-indicator"
                className="absolute inset-0 rounded-full bg-foreground shadow-surface-2"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: "spring", duration: 0.2, bounce: 0.18 }
                }
              />
            )}
            <span className="relative font-medium">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MotionPanel({
  children,
  reducedMotion,
}: {
  children: ReactNode;
  reducedMotion: boolean | null;
}) {
  return (
    <motion.div
      className="h-full"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={reducedMotion ? { duration: 0 } : { type: "spring", duration: 0.22, bounce: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

function AppsPanel({
  apps,
  openApp,
  onBuild,
}: {
  apps: MiniAppSummary[];
  openApp: (appId: string) => Promise<void>;
  onBuild: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center px-8 py-16">
        {apps.length > 0 ? (
          <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-8">
            {apps.map((app) => (
              <AppTile key={app.id} app={app} onOpen={() => void openApp(app.id)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="grid size-20 place-items-center rounded-2xl bg-surface-2 shadow-surface-2">
              <span className="text-3xl">🚀</span>
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-tight">No apps yet</h1>
              <p className="text-sm text-muted-foreground">Build your first mini app with Felix.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={onBuild}>
              Build
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AppTile({ app, onOpen }: { app: MiniAppSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-28 flex-col items-center gap-2 outline-none"
    >
      <AppIcon app={app} />
      <span className="max-w-full truncate text-center text-[11px] font-medium leading-tight text-foreground">
        {app.name}
      </span>
    </button>
  );
}

function AppIcon({ app }: { app: MiniAppSummary }) {
  return (
    <MiniAppIconView
      appId={app.id}
      emoji={app.emoji}
      icon={app.icon}
      className="size-24 rounded-2xl shadow-surface-3 transition-[transform,background-color] duration-150 group-hover:scale-[1.03] group-hover:bg-hover group-focus-visible:ring-1 group-focus-visible:ring-ring"
      emojiClassName="text-4xl"
    />
  );
}

function BuildPanel({
  prompt,
  promptFiles,
  creating,
  error,
  PaperclipIcon,
  onPromptChange,
  onPromptFilesChange,
  onSubmit,
}: {
  prompt: string;
  promptFiles: File[];
  creating: boolean;
  error: string | null;
  PaperclipIcon: IconComponent;
  onPromptChange: (value: string) => void;
  onPromptFilesChange: (files: File[]) => void;
  onSubmit: (value: string, files: File[]) => Promise<void>;
}) {
  return (
    <section className="relative h-full overflow-hidden px-6 pb-3">
      <div className="pointer-events-none absolute left-1/2 top-[42%] flex w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-6 text-center">
        <img src={felixIcon} alt="Felix" className="size-16 select-none" draggable={false} />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            What do you want to build today?
          </h1>
          <p className="text-base text-muted-foreground">
            Describe your idea and Felix will get to work building it.
          </p>
        </div>
      </div>

      <div className="absolute inset-x-6 bottom-3 mx-auto flex max-w-2xl flex-col gap-3">
        <InputMessage
          value={prompt}
          onValueChange={onPromptChange}
          onSend={(value, files) => void onSubmit(value, files)}
          placeholder="A game where I catch falling stars..."
          minRows={3}
          maxRows={8}
          sendLabel="Build"
          disabled={creating}
          files={promptFiles}
          onFilesChange={onPromptFilesChange}
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
      </div>
    </section>
  );
}
