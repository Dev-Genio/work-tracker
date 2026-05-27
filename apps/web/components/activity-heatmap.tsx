"use client";

import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  seconds: number;
  sessions: number;
}

interface Props {
  /** Days included in the range. Missing days are rendered as empty cells. */
  days: HeatmapDay[];
  /** Inclusive range bounds (ISO datetime strings). */
  fromIso: string;
  toIso: string;
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

export function ActivityHeatmap({ days, fromIso, toIso }: Props) {
  const grid = useMemo(() => buildGrid(days, fromIso, toIso), [days, fromIso, toIso]);

  return (
    <div className="w-full">
      <div className="flex gap-2 w-full">
        {/* Weekday labels */}
        <div className="grid grid-rows-7 gap-1 py-0.5 text-[10px] text-muted-foreground select-none shrink-0">
          {DAY_LABELS.map((d, i) => (
            <div key={i} className="h-[14px] leading-[14px]">{d}</div>
          ))}
        </div>

        {/* The grid takes all remaining width; cells expand to fill via
            grid-template-columns. */}
        <div
          className="grid grid-flow-col gap-1 grow"
          style={{
            gridTemplateColumns: `repeat(${grid.weeks.length}, minmax(0, 1fr))`,
            gridTemplateRows: "repeat(7, 1fr)",
            gridAutoFlow: "column",
          }}
        >
          {grid.weeks.flatMap((week, wi) =>
            week.map((cell, di) =>
              cell ? (
                <Tooltip key={`${wi}-${di}`}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "aspect-square rounded-[3px] transition-colors min-w-0",
                        intensityClass(cell.seconds, grid.max),
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className="text-xs">
                      <div className="font-medium">{cell.date}</div>
                      <div className="text-muted-foreground">
                        {formatHm(cell.seconds)} · {cell.sessions} session
                        {cell.sessions === 1 ? "" : "s"}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div key={`${wi}-${di}`} className="aspect-square" />
              ),
            ),
          )}
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

function buildGrid(
  data: HeatmapDay[],
  fromIso: string,
  toIso: string,
): { weeks: (HeatmapDay | null)[][]; max: number } {
  const byDate = new Map<string, HeatmapDay>();
  for (const d of data) byDate.set(d.date, d);

  const from = startOfWeekMon(new Date(fromIso));
  const to = endOfDay(new Date(toIso));

  const weeks: (HeatmapDay | null)[][] = [];
  let cursor = new Date(from);
  let max = 0;

  while (cursor <= to) {
    const week: (HeatmapDay | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = toIsoDate(cursor);
      const orig = new Date(fromIso);
      const beforeRange = cursor < startOfDay(orig);
      const afterRange = cursor > to;
      if (beforeRange || afterRange) {
        week.push(null);
      } else {
        const cell = byDate.get(iso) ?? {
          date: iso,
          seconds: 0,
          sessions: 0,
        };
        if (cell.seconds > max) max = cell.seconds;
        week.push(cell);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return { weeks, max };
}

function intensityClass(seconds: number, max: number): string {
  if (seconds <= 0) return scaleClass(0);
  const t = max > 0 ? seconds / max : 0;
  if (t < 0.25) return scaleClass(1);
  if (t < 0.5) return scaleClass(2);
  if (t < 0.75) return scaleClass(3);
  return scaleClass(4);
}

function scaleClass(level: 0 | 1 | 2 | 3 | 4 | number): string {
  switch (level) {
    case 0:
      return "bg-muted/40";
    case 1:
      return "bg-primary/25";
    case 2:
      return "bg-primary/50";
    case 3:
      return "bg-primary/75";
    case 4:
    default:
      return "bg-primary";
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeekMon(d: Date): Date {
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setDate(x.getDate() - wd);
  return x;
}
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatHm(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
