import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { UpdateStatus } from "@felix/contracts";
import { felix } from "../bridge.ts";
import { useIcon } from "../lib/icon-context.tsx";
import { Button } from "./ui/Button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";

const INITIAL_UPDATE_STATUS: UpdateStatus = {
  state: "idle",
  currentVersion: "",
  availableVersion: null,
  progress: null,
  error: null,
  checkedAt: null,
};

interface UpdateContextValue {
  status: UpdateStatus;
  showUpdateButton: boolean;
  openDialog: () => void;
  beginUpdate: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>(INITIAL_UPDATE_STATUS);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    void felix.invoke("update.status", undefined).then(setStatus).catch((error: unknown) => {
      setStatus((current) => ({ ...current, state: "error", error: errorMessage(error) }));
    });

    return felix.onPush((event) => {
      if (event.kind !== "update") return;
      setStatus(event.status);
      if (shouldOpenDialog(event.status)) setDialogOpen(true);
    });
  }, []);

  const beginUpdate = useCallback(async () => {
    setDialogOpen(true);
    try {
      const next = await felix.invoke("update.downloadAndInstall", undefined);
      setStatus(next);
    } catch (error) {
      setStatus((current) => ({ ...current, state: "error", error: errorMessage(error) }));
    }
  }, []);

  const value = useMemo<UpdateContextValue>(
    () => ({
      status,
      showUpdateButton: shouldShowUpdateButton(status),
      openDialog: () => setDialogOpen(true),
      beginUpdate,
    }),
    [beginUpdate, status],
  );

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <UpdateStatusDialog
        open={dialogOpen}
        status={status}
        onOpenChange={setDialogOpen}
        onBeginUpdate={() => void beginUpdate()}
      />
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdate must be used within UpdateProvider");
  return ctx;
}

export function UpdateButton() {
  const { status, showUpdateButton, beginUpdate, openDialog } = useUpdate();
  const ArrowUpIcon = useIcon("arrow-up");
  const CheckIcon = useIcon("check");
  if (!showUpdateButton) return null;

  const inProgress = status.state === "downloading" || status.state === "installing";
  const Icon = status.state === "downloaded" ? CheckIcon : inProgress ? FluidLoaderIcon : ArrowUpIcon;
  const label = inProgress || status.state === "downloaded" ? "Updating" : "Update";

  const handleClick = () => {
    if (status.state === "available" || status.state === "error") {
      void beginUpdate();
      return;
    }
    openDialog();
  };

  return (
    <Button variant="secondary" size="sm" leadingIcon={Icon} onClick={handleClick}>
      {label}
    </Button>
  );
}

function FluidLoaderIcon({
  size = 16,
  strokeWidth = 1.5,
  className,
}: {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        pathLength="100"
        style={{
          strokeDasharray: "15 85",
          animation: "spinner-move 2s linear infinite, spinner-dash 4s ease-in-out infinite",
        }}
      />
    </svg>
  );
}

function UpdateStatusDialog({
  open,
  status,
  onOpenChange,
  onBeginUpdate,
}: {
  open: boolean;
  status: UpdateStatus;
  onOpenChange: (open: boolean) => void;
  onBeginUpdate: () => void;
}) {
  const progress = progressPercent(status);
  const actionAvailable =
    status.state === "available" ||
    (status.state === "error" && status.availableVersion !== null);
  const actionLabel = status.state === "error" ? "Try Again" : "Update Now";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle(status)}</DialogTitle>
          <DialogDescription>{dialogDescription(status)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{progressLabel(status)}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {status.error && (
          <p className="mt-4 rounded-3xl bg-destructive-light px-3 py-2 text-sm text-destructive">
            {status.error}
          </p>
        )}

        {actionAvailable && (
          <DialogFooter>
            <Button variant="primary" size="sm" onClick={onBeginUpdate}>
              {actionLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function shouldShowUpdateButton(status: UpdateStatus): boolean {
  if (status.state === "available" || status.state === "downloading") return true;
  if (status.state === "downloaded" || status.state === "installing") return true;
  return status.state === "error" && status.availableVersion !== null;
}

function shouldOpenDialog(status: UpdateStatus): boolean {
  return (
    status.state === "downloading" ||
    status.state === "downloaded" ||
    status.state === "installing"
  );
}

function progressPercent(status: UpdateStatus): number {
  if (status.state === "downloaded" || status.state === "installing") return 100;
  return status.progress?.percent ?? 0;
}

function progressLabel(status: UpdateStatus): string {
  if (status.state === "available") return "Ready to download";
  if (status.state === "checking") return "Checking";
  if (status.state === "downloading" && status.progress?.total) {
    return `${formatBytes(status.progress.transferred)} of ${formatBytes(status.progress.total)}`;
  }
  if (status.state === "downloaded") return "Download complete";
  if (status.state === "installing") return "Restarting";
  if (status.state === "error") return "Update failed";
  return "Waiting";
}

function dialogTitle(status: UpdateStatus): string {
  const version = status.availableVersion ? ` ${status.availableVersion}` : "";
  if (status.state === "available") return `Felix${version} is ready`;
  if (status.state === "downloading") return `Downloading Felix${version}`;
  if (status.state === "downloaded") return "Update downloaded";
  if (status.state === "installing") return "Restarting Felix";
  if (status.state === "error") return "Update failed";
  return "Felix update";
}

function dialogDescription(status: UpdateStatus): string {
  if (status.state === "available") return "Felix will download the update and restart.";
  if (status.state === "downloading") return "Keep Felix open while the update downloads.";
  if (status.state === "downloaded") return "Felix is applying the update now.";
  if (status.state === "installing") return "Felix will reopen when the update finishes.";
  if (status.state === "error") return "Felix could not complete the update.";
  return "Felix is checking for a newer version.";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${Math.round(value)} B`;
  const mb = value / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
