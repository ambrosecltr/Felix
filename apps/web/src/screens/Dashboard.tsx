import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { MiniAppSummary } from "@felix/contracts";
import { felix } from "../bridge.ts";
import { useStore } from "../store.tsx";
import { filesToChatAttachments } from "../lib/message-attachments.ts";
import { type IconComponent, useIcon } from "../lib/icon-context.tsx";
import { cn } from "../lib/utils.ts";
import { Button } from "../components/ui/Button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import { AppChromeHeader } from "../components/AppChromeHeader.tsx";
import { CreatingOverlay } from "../components/CreatingOverlay.tsx";
import { MiniAppIconView } from "../components/MiniAppIconView.tsx";
import { InputMessage } from "../components/ui/input-message.tsx";
import { MyFelixPanel } from "./MyFelix.tsx";
import felixIcon from "../assets/felix-icon.svg";

type DashboardTab = "apps" | "build" | "profile";

const DASHBOARD_TABS: Array<{ value: DashboardTab; label: string }> = [
  { value: "apps", label: "My apps" },
  { value: "build", label: "Build with Felix" },
  { value: "profile", label: "My Felix" },
];
const PIN_LENGTH = 4;

export function Dashboard() {
  const { apps, createApp, openApp, goSettings } = useStore();
  const [activeTab, setActiveTab] = useState<DashboardTab>("build");
  const [prompt, setPrompt] = useState("");
  const [promptFiles, setPromptFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsPinOpen, setSettingsPinOpen] = useState(false);
  const [settingsPin, setSettingsPin] = useState("");
  const [settingsPinError, setSettingsPinError] = useState<string | null>(null);
  const [checkingSettingsAccess, setCheckingSettingsAccess] = useState(false);
  const [verifyingSettingsPin, setVerifyingSettingsPin] = useState(false);
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

  const openSettings = async () => {
    if (checkingSettingsAccess) return;
    setCheckingSettingsAccess(true);
    setSettingsPinError(null);
    try {
      const status = await felix.invoke("settings.lockdown.status", undefined);
      if (!status.enabled) {
        goSettings();
        return;
      }
      setSettingsPin("");
      setSettingsPinOpen(true);
    } catch (err) {
      if (isMissingLockdownStatusHandlerError(err)) {
        console.warn("[felix] Lockdown status handler is not registered yet:", err);
        goSettings();
        return;
      }
      setSettingsPinError(err instanceof Error ? err.message : "Could not check settings access.");
      setSettingsPinOpen(true);
    } finally {
      setCheckingSettingsAccess(false);
    }
  };

  const verifySettingsPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (settingsPin.length !== 4 || verifyingSettingsPin) return;
    setVerifyingSettingsPin(true);
    setSettingsPinError(null);
    try {
      const result = await felix.invoke("settings.lockdown.verify", { pin: settingsPin });
      if (!result.ok) {
        setSettingsPinError("Incorrect PIN.");
        return;
      }
      setSettingsPinOpen(false);
      setSettingsPin("");
      goSettings();
    } catch (err) {
      setSettingsPinError(err instanceof Error ? err.message : "Could not verify PIN.");
    } finally {
      setVerifyingSettingsPin(false);
    }
  };

  const closeSettingsPin = (open: boolean) => {
    setSettingsPinOpen(open);
    if (open) return;
    setSettingsPin("");
    setSettingsPinError(null);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <AppChromeHeader
        spacious
        border={false}
        center={
          <DashboardTabs
            value={activeTab}
            onValueChange={setActiveTab}
            reducedMotion={shouldReduceMotion}
          />
        }
        right={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void openSettings()}
            loading={checkingSettingsAccess}
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon />
          </Button>
        }
      />

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
      <Dialog open={settingsPinOpen} onOpenChange={closeSettingsPin} modal>
        <DialogContent size="sm">
          <form onSubmit={verifySettingsPin} className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Lockdown enabled</DialogTitle>
              <DialogDescription>Enter your lockdown pin to continue.</DialogDescription>
            </DialogHeader>
            <PinCodeInput
              value={settingsPin}
              error={settingsPinError}
              onChange={(value) => {
                setSettingsPin(value);
                setSettingsPinError(null);
              }}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onClick={() => closeSettingsPin(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={verifyingSettingsPin}
                disabled={settingsPin.length !== 4}
              >
                Unlock
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PinCodeInput({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: PIN_LENGTH }, (_, index) => value[index] ?? "");

  const focusInput = (index: number) => {
    inputRefs.current[Math.min(Math.max(index, 0), PIN_LENGTH - 1)]?.focus();
  };

  const setDigit = (index: number, digit: string) => {
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    onChange(nextDigits.join("").slice(0, PIN_LENGTH));
    if (digit) focusInput(index + 1);
  };

  const setPastedPin = (text: string) => {
    const nextValue = sanitizePin(text);
    onChange(nextValue);
    focusInput(Math.min(nextValue.length, PIN_LENGTH - 1));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              inputRefs.current[index] = node;
            }}
            type="password"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`PIN digit ${index + 1}`}
            aria-invalid={Boolean(error) || undefined}
            value={digit}
            maxLength={1}
            onChange={(event) => {
              const nextDigit = sanitizePin(event.target.value).slice(-1);
              setDigit(index, nextDigit);
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !digits[index]) focusInput(index - 1);
              if (event.key === "ArrowLeft") focusInput(index - 1);
              if (event.key === "ArrowRight") focusInput(index + 1);
            }}
            onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
              event.preventDefault();
              setPastedPin(event.clipboardData.getData("text"));
            }}
            className={cn(
              "h-12 w-11 rounded-xl border bg-transparent text-center text-base text-foreground outline-none transition-colors duration-80 placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-[#6B97FF]",
              error ? "border-destructive/60" : "border-border hover:bg-hover focus:bg-card",
            )}
          />
        ))}
      </div>
      {error && (
        <p className="text-center text-[12px] font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function sanitizePin(value: string): string {
  return value.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

function isMissingLockdownStatusHandlerError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("No handler registered for 'settings.lockdown.status'")
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
        <img src={felixIcon} alt="Felix" className="size-24 select-none" draggable={false} />
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
