"use client";

import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface HeatmapDay {
  date: string;
  seconds: number;
  commits: number;
}

interface Props {
  days: HeatmapDay[];
  fromIso: string;
  toIso: string;
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

export function ActivityHeatmap({ days, fromIso, toIso }: Props) {
  const grid = useMemo(() => buildGrid(days, fromIso, toIso), [days, fromIso, toIso]);

  const CELL = 12;
  const GAP = 3;

  return (
    <div className="w-full">
      <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
        {/* min-w-max keeps the month row + cells aligned and lets the whole
            block scroll as one unit on narrow screens. */}
        <div className="min-w-max">
          {/* Month labels — same grid geometry as the cells below, so each
              label spans exactly the weeks of its month. */}
          <div className="flex gap-2 mb-1">
            <div className="w-7 shrink-0" />
            <div
              className="grid"
              style={{
                gridAutoColumns: `${CELL}px`,
                gridAutoFlow: "column",
                columnGap: `${GAP}px`,
              }}
            >
              {grid.monthSpans.map((span, i) => (
                <div
                  key={i}
                  className="text-[10px] text-muted-foreground leading-3 whitespace-nowrap select-none"
                  style={{ gridColumn: `span ${span.weeks}` }}
                >
                  {span.label}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            {/* Weekday labels */}
            <div
              className="grid text-[10px] text-muted-foreground select-none shrink-0 w-7"
              style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px` }}
            >
              {DAY_LABELS.map((d, i) => (
                <div key={i} className="leading-3">{d}</div>
              ))}
            </div>

            {/* Cells */}
            <div
              className="grid"
              style={{
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gridAutoColumns: `${CELL}px`,
                gridAutoFlow: "column",
                gap: `${GAP}px`,
              }}
            >
              {grid.weeks.flatMap((week, wi) =>
                week.map((cell, di) =>
                  cell ? (
                    <Tooltip key={`${wi}-${di}`}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "rounded-[2px] transition-colors",
                            intensityClass(cell.seconds, grid.max),
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <div className="text-xs">
                          <div className="font-medium">{cell.date}</div>
                          <div className="text-muted-foreground">
                            {formatHm(cell.seconds)} · {cell.commits} commit
                            {cell.commits === 1 ? "" : "s"}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <div key={`${wi}-${di}`} />
                  ),
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <div key={lvl} className={cn("h-2.5 w-2.5 rounded-[2px]", scaleClass(lvl))} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

interface MonthSpan {
  label: string;
  weeks: number;
}

function buildGrid(
  data: HeatmapDay[],
  fromIso: string,
  toIso: string,
): {
  weeks: (HeatmapDay | null)[][];
  max: number;
  monthSpans: MonthSpan[];
} {
  const byDate = new Map<string, HeatmapDay>();
  for (const d of data) byDate.set(d.date, d);

  const fromDate = new Date(fromIso);
  const toDate = endOfDay(new Date(toIso));
  const from = startOfWeekMon(fromDate);

  const weeks: (HeatmapDay | null)[][] = [];
  const cursor = new Date(from);
  let max = 0;

  // Track the month label of the first cell of each week column.
  const monthOfFirstCell: string[] = [];

  while (cursor <= toDate) {
    const week: (HeatmapDay | null)[] = [];
    monthOfFirstCell.push(monthLabel(cursor));
    for (let d = 0; d < 7; d++) {
      const iso = toIsoDate(cursor);
      const beforeRange = cursor < startOfDay(fromDate);
      const afterRange = cursor > toDate;
      if (beforeRange || afterRange) {
        week.push(null);
      } else {
        const cell = byDate.get(iso) ?? { date: iso, seconds: 0, commits: 0 };
        if (cell.seconds > max) max = cell.seconds;
        week.push(cell);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  // Collapse adjacent same-month columns into a single label span.
  const monthSpans: MonthSpan[] = [];
  for (const m of monthOfFirstCell) {
    const prev = monthSpans[monthSpans.length - 1];
    if (prev && prev.label === m) prev.weeks++;
    else monthSpans.push({ label: m, weeks: 1 });
  }

  return { weeks, max, monthSpans };
}

function intensityClass(seconds: number, max: number): string {
  if (seconds <= 0) return scaleClass(0);
  const t = max > 0 ? seconds / max : 0;
  if (t < 0.25) return scaleClass(1);
  if (t < 0.5) return scaleClass(2);
  if (t < 0.75) return scaleClass(3);
  return scaleClass(4);
}
function scaleClass(level: number): string {
  switch (level) {
    case 0: return "bg-muted/40";
    case 1: return "bg-primary/25";
    case 2: return "bg-primary/50";
    case 3: return "bg-primary/75";
    default: return "bg-primary";
  }
}
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfWeekMon(d: Date): Date {
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd);
  return x;
}
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short" });
}
function formatHm(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
