import { useEffect, useState } from "react";
import type { MiniAppIcon } from "@felix/contracts";
import { felix } from "../bridge.ts";
import { cn } from "../lib/utils.ts";

interface MiniAppIconViewProps {
  appId: string;
  emoji: string;
  icon: MiniAppIcon | null;
  className?: string;
  imageClassName?: string;
  emojiClassName?: string;
}

export function MiniAppIconView({
  appId,
  emoji,
  icon,
  className,
  imageClassName,
  emojiClassName,
}: MiniAppIconViewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!icon) {
      setDataUrl(null);
      return () => {
        cancelled = true;
      };
    }

    setDataUrl(null);
    void felix
      .invoke("miniApp.icon", { appId })
      .then((result) => {
        if (!cancelled) setDataUrl(result.dataUrl);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [appId, icon?.generatedAt]);

  return (
    <span className={cn("grid place-items-center overflow-hidden bg-surface-2", className)}>
      {dataUrl ? (
        <img
          src={dataUrl}
          alt=""
          className={cn("size-full object-cover", imageClassName)}
          draggable={false}
        />
      ) : (
        <span className={cn("leading-none", emojiClassName)}>{emoji}</span>
      )}
    </span>
  );
}
