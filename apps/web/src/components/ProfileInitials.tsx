import { cn } from "../lib/utils.ts";

interface ProfileInitialsProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses: Record<NonNullable<ProfileInitialsProps["size"]>, string> = {
  sm: "size-9 text-[13px]",
  md: "size-14 text-lg",
  lg: "size-20 text-2xl",
};

export function ProfileInitials({ name, size = "md", className }: ProfileInitialsProps) {
  const hue = hueForName(name);
  const initials = initialsForName(name);

  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-[1.25rem] font-semibold shadow-surface-2",
        sizeClasses[size],
        className,
      )}
      style={{
        backgroundColor: `hsl(${hue} 72% 88%)`,
        color: `hsl(${hue} 50% 28%)`,
      }}
    >
      {initials}
    </span>
  );
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return graphemes(parts[0] ?? "").slice(0, 2).join("").toUpperCase();
  return `${firstGrapheme(parts[0] ?? "")}${firstGrapheme(parts[parts.length - 1] ?? "")}`.toUpperCase();
}

function hueForName(name: string): number {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

function firstGrapheme(value: string): string {
  return graphemes(value)[0] ?? "?";
}

function graphemes(value: string): string[] {
  const segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!segmenter) return [...value];
  return [...new segmenter().segment(value)].map(({ segment }) => segment);
}
