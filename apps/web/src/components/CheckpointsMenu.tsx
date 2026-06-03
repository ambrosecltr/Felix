import { useEffect, useState } from "react";
import type { Checkpoint } from "@felix/contracts";
import { felix } from "../bridge.ts";

export function CheckpointsMenu({ appId, onClose }: { appId: string; onClose: () => void }) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    void felix.invoke("checkpoint.list", { appId }).then((next) => {
      if (!stale) setCheckpoints(next);
    });
    return () => {
      stale = true;
    };
  }, [appId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const restore = async (checkpointId: string) => {
    setBusy(true);
    try {
      await felix.invoke("checkpoint.restore", { appId, checkpointId });
      await felix.view.reload();
      setBusy(false);
      onClose();
    } catch (err) {
      setBusy(false);
      throw err;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-3 top-12 z-20 w-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
        <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Go back to…
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {checkpoints.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">No saved versions yet.</p>
          )}
          {checkpoints.map((cp) => (
            <button
              key={cp.id}
              type="button"
              disabled={busy}
              onClick={() => void restore(cp.id)}
              className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-50"
            >
              <span className="block truncate text-sm">{cp.message}</span>
              <span className="block text-xs text-muted-foreground">
                {new Date(cp.createdAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
