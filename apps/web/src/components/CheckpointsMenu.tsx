import { useEffect, useState } from "react";
import type { Checkpoint } from "@felix/contracts";
import { felix } from "../bridge.ts";
import { Dropdown, DropdownLabel, DropdownSeparator } from "./ui/dropdown.tsx";
import { MenuItem } from "./ui/menu-item.tsx";

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
      <div className="absolute right-3 top-12 z-20">
        <Dropdown className="max-h-80 overflow-y-auto">
          <DropdownLabel>Go back to...</DropdownLabel>
          <DropdownSeparator />
          {checkpoints.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">No saved versions yet.</p>
          )}
          {checkpoints.map((checkpoint, index) => (
            <MenuItem
              key={checkpoint.id}
              index={index}
              label={`${checkpoint.message} - ${new Date(checkpoint.createdAt).toLocaleString()}`}
              onSelect={() => {
                if (!busy) void restore(checkpoint.id);
              }}
              aria-disabled={busy || undefined}
              className={busy ? "pointer-events-none opacity-50" : undefined}
            />
          ))}
        </Dropdown>
      </div>
    </>
  );
}
