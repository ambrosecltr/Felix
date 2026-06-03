import { useEffect, useRef, useState } from "react";
import { useStore } from "../store.tsx";
import { Button } from "../components/ui/Button.tsx";
import { BuildChat } from "../components/BuildChat.tsx";
import { CheckpointsMenu } from "../components/CheckpointsMenu.tsx";
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

  useMiniAppView(placeholderRef, isRunning ? devUrl : null);

  useEffect(() => {
    if (!showDeleteConfirm || isDeleting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteError(null);
        setShowDeleteConfirm(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showDeleteConfirm, isDeleting]);

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
      <header className="drag-region flex h-12 items-center gap-2 border-b border-border pl-20 pr-3">
        <Button variant="ghost" size="sm" onClick={goDashboard}>
          ← Apps
        </Button>
        <div className="flex items-center gap-2 px-1">
          <span className="text-base leading-none">{app?.emoji ?? "·"}</span>
          <span className="text-sm font-medium">{app?.name ?? "Loading…"}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void felix.view.reload()}>
            Reload
          </Button>
          <Button
            variant="ghost"
            size="sm"
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
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <div ref={placeholderRef} className="flex-1 bg-muted/40">
          {!isRunning && (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              Starting your app…
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
        {showDeleteConfirm && (
          <DeleteAppConfirm
            appName={app?.name ?? "this app"}
            isDeleting={isDeleting}
            error={deleteError}
            onCancel={() => {
              if (isDeleting) return;
              setDeleteError(null);
              setShowDeleteConfirm(false);
            }}
            onConfirm={() => void confirmDelete()}
          />
        )}
      </div>
    </div>
  );
}

function DeleteAppConfirm({
  appName,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: {
  appName: string;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-background/30" onClick={onCancel} />
      <div className="absolute right-3 top-3 z-40 w-80 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <TrashIcon />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Delete {appName}?</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              This removes the app and its chat history from this computer.
            </p>
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={isDeleting} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 15h10l1-15" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
