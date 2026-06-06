import { useMemo } from "react";
import type { TokenActivityDay } from "@felix/contracts";
import { cn } from "../lib/utils.ts";
import { formatFullTokenCount } from "../lib/format.ts";
import { Tooltip } from "./ui/tooltip.tsx";

interface TokenActivityCalendarProps {
  activity: TokenActivityDay[];
  referenceDate?: Date;
}

const DAY_COUNT = 365;
const CELL_CLASS =
  "aspect-square w-full min-w-0 rounded-[3px] transition-[box-shadow,transform] duration-80";
const INTENSITY_CLASSES = [
  "bg-muted/40",
  "bg-primary/15",
  "bg-primary/30",
  "bg-primary/50",
  "bg-primary/70",
  "bg-primary",
];

export function TokenActivityCalendar({
  activity,
  referenceDate = new Date(),
}: TokenActivityCalendarProps) {
  const model = useMemo(() => buildCalendarModel(activity, referenceDate), [activity, referenceDate]);

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-hidden
        className="mb-1 grid min-w-0 gap-[3px] overflow-hidden"
        style={{ gridTemplateColumns: model.gridTemplateColumns }}
      >
        {model.monthLabels.map((month) => (
          <span
            key={`${month.column}-${month.label}`}
            className="min-w-0 text-[11px] text-muted-foreground"
            style={{ gridColumnStart: month.column + 1 }}
          >
            {month.label}
          </span>
        ))}
      </div>
      <div
        role="grid"
        aria-label="Token activity for the last 365 days"
        className="grid min-w-0 grid-flow-col grid-rows-7 gap-[3px]"
        style={{ gridTemplateColumns: model.gridTemplateColumns }}
      >
        {model.cells.map((cell, index) => {
          if (!cell) return <span key={`empty-${index}`} className="aspect-square w-full min-w-0" />;
          const label = tooltipLabel(cell.date, cell.tokens);
          return (
            <Tooltip key={cell.date} content={label} side="top">
              <button
                type="button"
                role="gridcell"
                aria-label={label}
                className={cn(
                  CELL_CLASS,
                  INTENSITY_CLASSES[cell.intensity],
                  "hover:ring-1 hover:ring-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                )}
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span>Less</span>
        <div className="flex gap-[3px]" aria-hidden>
          {INTENSITY_CLASSES.map((className, index) => (
            <span key={index} className={cn("size-3 rounded-[3px]", className)} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

function buildCalendarModel(activity: TokenActivityDay[], referenceDate: Date) {
  const tokensByDate = new Map(activity.map((day) => [day.date, day.tokens]));
  const maxTokens = Math.max(0, ...activity.map((day) => day.tokens));
  const end = startOfLocalDay(referenceDate);
  const dates = Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (DAY_COUNT - 1 - index));
    return date;
  });

  const leadingEmptyCells = dates[0]?.getDay() ?? 0;
  const cells: Array<CalendarCell | null> = [
    ...Array.from({ length: leadingEmptyCells }, () => null),
    ...dates.map((date) => {
      const key = dateKey(date);
      const tokens = tokensByDate.get(key) ?? 0;
      return {
        date: key,
        tokens,
        intensity: intensityForTokens(tokens, maxTokens),
      };
    }),
  ];
  const columnCount = Math.ceil(cells.length / 7);
  const monthLabels = monthLabelsForCells(cells);

  return {
    cells,
    monthLabels,
    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
  };
}

interface CalendarCell {
  date: string;
  tokens: number;
  intensity: number;
}

function monthLabelsForCells(cells: Array<CalendarCell | null>) {
  const labels: Array<{ column: number; label: string }> = [];
  const seen = new Set<string>();

  cells.forEach((cell, index) => {
    if (!cell) return;
    const date = dateFromKey(cell.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if ((date.getDate() === 1 || labels.length === 0) && !seen.has(key)) {
      seen.add(key);
      labels.push({
        column: Math.floor(index / 7),
        label: date.toLocaleDateString("en", { month: "short" }),
      });
    }
  });

  return labels;
}

function intensityForTokens(tokens: number, maxTokens: number): number {
  if (tokens <= 0 || maxTokens <= 0) return 0;
  const ratio = Math.sqrt(tokens / maxTokens);
  if (ratio < 0.24) return 1;
  if (ratio < 0.42) return 2;
  if (ratio < 0.62) return 3;
  if (ratio < 0.82) return 4;
  return 5;
}

function tooltipLabel(date: string, tokens: number): string {
  const label = dateFromKey(date).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (tokens === 0) return `No tokens on ${label}`;
  return `${formatFullTokenCount(tokens)} tokens on ${label}`;
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}
