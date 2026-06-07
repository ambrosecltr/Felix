import type { ReactNode } from "react";
import { cn } from "../lib/utils.ts";
import { UpdateButton } from "./UpdateProvider.tsx";

interface AppChromeHeaderProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  border?: boolean;
  spacious?: boolean;
  className?: string;
  leftClassName?: string;
  centerClassName?: string;
  rightClassName?: string;
}

export function AppChromeHeader({
  left,
  center,
  right,
  border = true,
  spacious = false,
  className,
  leftClassName,
  centerClassName,
  rightClassName,
}: AppChromeHeaderProps) {
  return (
    <header
      className={cn(
        "drag-region grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] px-3",
        spacious ? "h-16 items-start pt-4" : "h-12 items-center",
        border && "border-b border-border",
        className,
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-2 pl-[76px]", leftClassName)}>
        <UpdateButton />
        {left}
      </div>
      <div className={cn("min-w-0 justify-self-center", centerClassName)}>{center}</div>
      <div className={cn("flex min-w-0 items-center justify-end gap-1", rightClassName)}>
        {right}
      </div>
    </header>
  );
}
