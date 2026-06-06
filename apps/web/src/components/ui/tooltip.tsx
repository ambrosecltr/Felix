"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/springs";
import { fontWeights } from "@/lib/font-weight";
import { useShape } from "@/lib/shape-context";

const TooltipPortalContainerContext = createContext<HTMLElement | null>(null);

function TooltipPortalContainer({
  value,
  children,
}: {
  value: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <TooltipPortalContainerContext.Provider value={value}>
      {children}
    </TooltipPortalContainerContext.Provider>
  );
}

type TooltipSide = "top" | "right" | "bottom" | "left";

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: TooltipSide;
  sideOffset?: number;
  delayDuration?: number;
  className?: string;
  forceOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function getSlideOffset(side: TooltipSide) {
  switch (side) {
    case "top":
      return { y: 4 };
    case "bottom":
      return { y: -4 };
    case "left":
      return { x: 4 };
    case "right":
      return { x: -4 };
  }
}

function Tooltip({
  content,
  children,
  side = "top",
  sideOffset = 8,
  delayDuration = 200,
  className,
  forceOpen,
  onOpenChange,
}: TooltipProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = forceOpen ?? internalOpen;
  const shape = useShape();
  const portalContainer = useContext(TooltipPortalContainerContext);
  const slideOffset = getSlideOffset(side);

  return (
    <TooltipPrimitive.Provider delay={delayDuration}>
      <TooltipPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          if (forceOpen === undefined) setInternalOpen(next);
          onOpenChange?.(next);
        }}
      >
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal container={portalContainer ?? undefined}>
          <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="z-50">
            <TooltipPrimitive.Popup>
              <motion.div
                className={cn("bg-foreground px-2 py-1 text-[12px] text-background", shape.bg, className)}
                style={{ fontVariationSettings: fontWeights.medium }}
                initial={{ opacity: 0, ...slideOffset }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={springs.fast}
              >
                {content}
              </motion.div>
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export { Tooltip, TooltipPortalContainer };
export type { TooltipProps, TooltipSide };
