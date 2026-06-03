import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn.ts";

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "default" | "lg" | "icon";

const base =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60";

const variants: Record<Variant, string> = {
  default: "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border-input bg-card text-foreground shadow-sm hover:bg-accent",
  ghost: "border-transparent text-foreground hover:bg-accent",
  destructive: "border-destructive bg-destructive text-white shadow-sm hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  default: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
  icon: "size-9",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return <button type="button" className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
