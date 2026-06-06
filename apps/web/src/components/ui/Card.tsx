import type { ComponentPropsWithoutRef } from "react";
import { Elevated } from "../../lib/elevated.tsx";
import { useShape } from "../../lib/shape-context.tsx";
import { cn } from "../../lib/utils.ts";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  const shape = useShape();

  return (
    <Elevated
      offset={1}
      shadowLevel={2}
      className={cn(shape.container, "text-card-foreground", className)}
      {...props}
    />
  );
}
