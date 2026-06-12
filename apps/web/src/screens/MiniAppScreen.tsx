import { useState } from "react";
import { motion } from "framer-motion";
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
import { MiniAppPreview } from "../components/MiniAppPreview.tsx";
import { useResizablePanel } from "../components/useResizablePanel.ts";
import { felix } from "../bridge.ts";
import tabIconSrc from "../assets/tab_icon.svg";

const PANEL_SPRING = { type: "spring", stiffness: 420, damping: 40, mass: 0.8 } as const;

export function MiniAppScreen({
  appId,
  buildChatInitiallyOpen,
}: {
  appId: string;
  buildChatInitiallyOpen: boolean;
}) {
  const { apps, statuses, goDashboard, deleteApp } = useStore();
  const app = apps.find((a) => a.id === appId);
  const status = statuses[appId];
  const devUrl = status?.devUrl ?? null;
  const isRunning = status?.status === "running" && devUrl !== null;

  const { width, onMouseDown, dragging } = useResizablePanel(400, 300, 680);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showBuildChat, setShowBuildChat] = useState(buildChatInitiallyOpen);
  const AppsIcon = useIcon("arrow-left");
  const ReloadIcon = useIcon("rotate-ccw");
  const CheckpointsIcon = useIcon("clock");
  const TrashIcon = useIcon("trash");

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
        <div className="relative flex-1 bg-muted/40">
          {isRunning ? (
            <MiniAppPreview appId={appId} url={devUrl} />
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              Starting your app...
            </div>
          )}
          <BuildChatTab open={showBuildChat} onToggle={() => setShowBuildChat((v) => !v)} />
          {/* The webview eats mouse events; blanket it while resizing so the
              drag keeps tracking even when the cursor crosses the preview. */}
          {dragging && <div className="absolute inset-0 z-30 cursor-col-resize" />}
        </div>

        <motion.div
          initial={false}
          animate={
            showBuildChat
              ? { width, opacity: 1, visibility: "visible" }
              : { width: 0, opacity: 0, transitionEnd: { visibility: "hidden" } }
          }
          transition={dragging ? { type: "tween", duration: 0 } : PANEL_SPRING}
          aria-hidden={!showBuildChat}
          className="relative shrink-0 overflow-hidden bg-background"
        >
          <div
            onMouseDown={showBuildChat ? onMouseDown : undefined}
            className="group absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize"
          >
            <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/20" />
          </div>
          <div className="h-full" style={{ width }}>
            <BuildChat appId={appId} />
          </div>
        </motion.div>

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

/**
 * Fluid drawer handle on the preview/chat boundary. A plain DOM button: the
 * preview is a <webview>, so this stacks above it with regular z-index.
 */
function BuildChatTab({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <motion.button
      type="button"
      aria-label={open ? "Hide build chat" : "Show build chat"}
      aria-expanded={open}
      onClick={onToggle}
      initial={false}
      animate={{
        y: "-50%",
        width: open ? 46 : 42,
        height: open ? 112 : 86,
      }}
      whileTap={{ y: "-50%", scale: 0.97 }}
      style={{ originX: 1, originY: 0.5 }}
      transition={PANEL_SPRING}
      className="absolute right-0 top-1/2 z-20 flex cursor-pointer items-center justify-center rounded-l-[20px] border-0 bg-background text-foreground shadow-[-4px_6px_10px_rgba(0,0,0,0.14),-1px_1px_4px_rgba(0,0,0,0.08)] outline-none transition-shadow [clip-path:inset(-32px_0_-32px_-32px)] hover:shadow-[-5px_7px_12px_rgba(0,0,0,0.16),-1px_1px_4px_rgba(0,0,0,0.08)]"
    >
      {/* Fillets joining the tab to the panel edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2.5 right-0 size-2.5 rounded-br-[10px] shadow-[5px_5px_0_5px_var(--background)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-2.5 right-0 size-2.5 rounded-tr-[10px] shadow-[5px_-5px_0_5px_var(--background)]"
      />
      {open ? (
        <span className="rotate-180 text-[11px] font-bold uppercase leading-none tracking-[0.16em] [writing-mode:vertical-rl]">
          Hide
        </span>
      ) : (
        <img src={tabIconSrc} alt="" draggable={false} className="size-7 object-contain" />
      )}
    </motion.button>
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
