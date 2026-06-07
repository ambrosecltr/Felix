import { useRef, useState } from "react";
import { useStore } from "../store.tsx";
import { useIcon } from "../lib/icon-context.tsx";
import { Button } from "../components/ui/Button.tsx";
import { AppChromeHeader } from "../components/AppChromeHeader.tsx";
import { BuildChat } from "../components/BuildChat.tsx";
import { CheckpointsMenu } from "../components/CheckpointsMenu.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import { useMiniAppView } from "../components/useMiniAppView.ts";
import { useResizablePanel } from "../components/useResizablePanel.ts";
import { felix } from "../bridge.ts";

export function MiniAppScreen({ appId }: { appId: string }) {
  const { apps, statuses, goDashboard, deleteApp } = useStore();
  const app = apps.find((a) => a.id === appId);
  const status = statuses[appId];
  const devUrl = status?.devUrl ?? null;
  const isRunning = status?.status === "running" && devUrl !== null;

  const placeholderRef = useRef<HTMLDivElement>(null);
  const { width, onMouseDown } = useResizablePanel(400, 300, 680);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const AppsIcon = useIcon("arrow-left");
  const ReloadIcon = useIcon("rotate-ccw");
  const CheckpointsIcon = useIcon("clock");
  const TrashIcon = useIcon("trash");
  const miniAppViewUrl = isRunning && !showDeleteConfirm ? devUrl : null;

  useMiniAppView(placeholderRef, miniAppViewUrl);

  const confirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteApp(appId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete this app.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <AppChromeHeader
        left={
          <>
            <Button variant="ghost" size="sm" leadingIcon={AppsIcon} onClick={goDashboard}>
              Apps
            </Button>
            <div className="flex min-w-0 items-center gap-2 px-1">
              <span className="text-base leading-none">{app?.emoji ?? "·"}</span>
              <span className="truncate text-sm font-medium">{app?.name ?? "Loading..."}</span>
            </div>
          </>
        }
        right={
          <>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={ReloadIcon}
              onClick={() => void felix.view.reload()}
            >
              Reload
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={CheckpointsIcon}
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteError(null);
                setShowCheckpoints((v) => !v);
              }}
            >
              Checkpoints
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label="Delete app"
              title="Delete app"
              onClick={() => {
                setShowCheckpoints(false);
                setDeleteError(null);
                setShowDeleteConfirm(true);
              }}
            >
              <TrashIcon />
            </Button>
          </>
        }
      />

      <div className="relative flex flex-1 overflow-hidden">
        <div ref={placeholderRef} className="flex-1 bg-muted/40">
          {!isRunning && (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              Starting your app...
            </div>
          )}
        </div>

        <div
          onMouseDown={onMouseDown}
          className="group relative w-px shrink-0 cursor-col-resize bg-border"
        >
          <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/20" />
        </div>

        <div style={{ width }} className="shrink-0 border-l border-border">
          <BuildChat appId={appId} />
        </div>

        {showCheckpoints && (
          <CheckpointsMenu appId={appId} onClose={() => setShowCheckpoints(false)} />
        )}
        <DeleteAppConfirm
          open={showDeleteConfirm}
          appName={app?.name ?? "this app"}
          isDeleting={isDeleting}
          error={deleteError}
          onOpenChange={(open) => {
            if (isDeleting) return;
            setDeleteError(null);
            setShowDeleteConfirm(open);
          }}
          onConfirm={() => void confirmDelete()}
        />
      </div>
    </div>
  );
}

function DeleteAppConfirm({
  open,
  appName,
  isDeleting,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  appName: string;
  isDeleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const TrashIcon = useIcon("trash");

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TrashIcon />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle>Delete {appName}?</DialogTitle>
              <DialogDescription className="mt-1">
                This removes the app and its chat history from this computer.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {error && (
          <p className="rounded-3xl bg-destructive-light px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button variant="destructive" size="sm" loading={isDeleting} onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
