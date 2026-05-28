"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Clock, GitCommit, Sparkles, Target } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivityHeatmap, type HeatmapDay } from "@/components/activity-heatmap";
// HeatmapDay is used by HeatmapRollups too; the type re-import is intentional.
import { formatHm, isoDate, startOfDay, startOfWeek } from "@/lib/time";
import { cn } from "@/lib/utils";

type Preset = "day" | "week" | "month" | "custom";

interface Summary {
  id: string;
  startedAt: string;
  endedAt: string;
  activity: string;
  app: string | null;
  projectGuess: string | null;
  tasks: string[];
  focusScore: number;
}
interface Commit {
  repo: string;
  sha: string;
  message: string;
  body: string | null;
  additions: number;
  deletions: number;
  committedAt: string;
}

const PAGE_SIZES = [25, 50, 75, 100] as const;

export default function Today() {
  // Range state
  const [preset, setPreset] = useState<Preset>("day");
  const initialRange = computeRange("day");
  const [from, setFrom] = useState<string>(initialRange.from);
  const [to, setTo] = useState<string>(initialRange.to);

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(0);

  // Data
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [rangeSeconds, setRangeSeconds] = useState<number>(0);
  const [rangeFocus, setRangeFocus] = useState<number>(0);
  const [byApp, setByApp] = useState<[string, number][]>([]);
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [heatmapDays, setHeatmapDays] = useState<HeatmapDay[]>([]);
  const [heatmapRange, setHeatmapRange] = useState<{ fromIso: string; toIso: string }>({
    fromIso: new Date(initialRange.from + "T00:00:00").toISOString(),
    toIso: new Date(initialRange.to + "T23:59:59").toISOString(),
  });

  const fromIso = useMemo(() => new Date(from + "T00:00:00").toISOString(), [from]);
  const toIso = useMemo(() => new Date(to + "T23:59:59").toISOString(), [to]);

  // Fetch paginated summaries + total count + commits
  const loadList = useCallback(async () => {
    setSummaries(null);
    const params = new URLSearchParams({
      from: fromIso,
      to: toIso,
      limit: String(pageSize),
      offset: String(page * pageSize),
      order: "desc",
    });
    const rangeQ = `from=${fromIso}&to=${toIso}`;
    const [sRes, cRes, appRes] = await Promise.all([
      fetch(`/api/summaries?${params}`).then((r) => r.json()),
      fetch(`/api/commits?${rangeQ}`).then((r) => r.json()),
      fetch(`/api/timesheet?${rangeQ}&groupBy=app`).then((r) => r.json()),
    ]);
    setSummaries(sRes.summaries ?? []);
    setTotal(Number(sRes.total ?? 0));
    setRangeSeconds(Number(sRes.totalSeconds ?? 0));
    setRangeFocus(Number(sRes.focusAvg ?? 0));
    setCommits(cRes.commits ?? []);
    setByApp(
      (appRes.rows ?? []).slice(0, 8).map((r: { key: string; seconds: number }) => [r.key, r.seconds] as [string, number]),
    );
  }, [fromIso, toIso, pageSize, page]);

  // Fetch per-day totals — always wide enough to fill the heatmap.
  const loadHeatmap = useCallback(async () => {
    // Heatmap shows at least the last ~6 months so the grid is wide and
    // short (GitHub contributions style) instead of tall and tiny.
    const days = Math.max(183, daysBetween(from, to));
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    const hmFromIso = startOfDay(start).toISOString();
    const hmToIso = new Date().toISOString();
    const res = await fetch(
      `/api/heatmap?from=${hmFromIso}&to=${hmToIso}`,
    ).then((r) => r.json());
    setHeatmapDays(res.days ?? []);
    setHeatmapRange({ fromIso: hmFromIso, toIso: hmToIso });
  }, [from, to]);

  useEffect(() => {
    setPage(0);
  }, [from, to, pageSize]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadHeatmap();
  }, [loadHeatmap]);

  function pickPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      const r = computeRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  const dailyChart = useMemo(() => {
    return heatmapDays
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ date: d.date.slice(5), minutes: Math.round(d.seconds / 60) }));
  }, [heatmapDays]);

  const commitsChart = useMemo(() => {
    return heatmapDays
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ date: d.date.slice(5), commits: d.commits }));
  }, [heatmapDays]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const loadingList = summaries === null;

  return (
    <div className="space-y-6">
      {/* Range picker — inline strip, no card */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          <RangeChip active={preset === "day"} onClick={() => pickPreset("day")}>Today</RangeChip>
          <RangeChip active={preset === "week"} onClick={() => pickPreset("week")}>This week</RangeChip>
          <RangeChip active={preset === "month"} onClick={() => pickPreset("month")}>This month</RangeChip>
          <RangeChip active={preset === "custom"} onClick={() => pickPreset("custom")}>Custom</RangeChip>
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="from" className="text-xs text-muted-foreground">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-36"
            />
            <Label htmlFor="to" className="text-xs text-muted-foreground">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-36"
            />
          </div>
        )}
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground tabular-nums">
          {humanRange(from, to)}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loadingList ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <Stat icon={<Clock className="h-4 w-4" />} label="Tracked" value={formatHm(rangeSeconds)} />
            <Stat icon={<Sparkles className="h-4 w-4" />} label="Sessions" value={String(total)} />
            <Stat icon={<Target className="h-4 w-4" />} label="Avg focus" value={`${(rangeFocus * 100).toFixed(0)}%`} />
            <Stat icon={<GitCommit className="h-4 w-4" />} label="Commits" value={String(commits?.length ?? 0)} />
          </>
        )}
      </div>

      {/* Heatmap + rollups (bento) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Activity heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapDays.length === 0 ? (
            <Skeleton className="h-24 w-full rounded-md" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,auto)_1fr] gap-6 items-start">
              <div className="min-w-0 overflow-hidden">
                <ActivityHeatmap
                  days={heatmapDays}
                  fromIso={heatmapRange.fromIso}
                  toIso={heatmapRange.toIso}
                />
              </div>
              <HeatmapRollups days={heatmapDays} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">App focus</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingList ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ActivityRings data={byApp} />
            )}
          </CardContent>
        </Card>

        <TrendCard
          title="Daily activity"
          loading={loadingList}
          data={dailyChart}
          dataKey="minutes"
          unit="min"
          gradientId="dailyFill"
        />

        <TrendCard
          title="Daily commits"
          loading={loadingList}
          data={commitsChart}
          dataKey="commits"
          unit="commits"
          gradientId="commitsFill"
        />
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Timeline</span>
            <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              <span>Per page</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 pt-0">
          {loadingList ? (
            <div className="space-y-2 py-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : summaries!.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No activity in this range.</p>
          ) : (
            summaries!.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <Separator />}
                <div className="grid grid-cols-[140px_1fr_auto] gap-4 py-3 text-sm">
                  <div className="text-muted-foreground tabular-nums">
                    <div>{fmtDateShort(s.startedAt)}</div>
                    <div className="text-xs">{fmtTime(s.startedAt)} – {fmtTime(s.endedAt)}</div>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-1.5 items-center mb-1">
                      {s.projectGuess && <Badge variant="secondary">{s.projectGuess}</Badge>}
                      {s.app && <Badge variant="outline">{s.app}</Badge>}
                    </div>
                    <div className="text-foreground/90">{s.activity}</div>
                    {s.tasks.length > 0 && (
                      <ul className="mt-1 text-xs text-muted-foreground list-disc pl-4">
                        {s.tasks.slice(0, 3).map((t, j) => <li key={j}>{t}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="text-muted-foreground tabular-nums text-xs self-start">
                    focus {(s.focusScore * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Pagination footer */}
          {!loadingList && summaries!.length > 0 && (
            <div className="flex items-center justify-between pt-4 mt-2 border-t text-sm text-muted-foreground">
              <span>
                Showing {page * pageSize + 1}–
                {Math.min((page + 1) * pageSize, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commits */}
      {commits && commits.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Commits</span>
              <span className="font-normal text-xs text-muted-foreground tabular-nums">
                {commits.length} commit{commits.length === 1 ? "" : "s"} ·{" "}
                <span className="text-green-500">+{sum(commits, "additions")}</span> /{" "}
                <span className="text-red-500">-{sum(commits, "deletions")}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {commits.map((c) => (
                <li key={`${c.repo}:${c.sha}`}>
                  {c.body ? (
                    <details className="group">
                      <summary className="list-none cursor-pointer flex items-center gap-2 hover:bg-accent/40 rounded-sm px-1 py-0.5 -mx-1">
                        <CommitRow commit={c} />
                      </summary>
                      <div className="ml-[88px] mt-1 mb-2 p-2 rounded-md border bg-muted/30 text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                        {c.body}
                      </div>
                    </details>
                  ) : (
                    <div className="px-1 py-0.5 -mx-1">
                      <CommitRow commit={c} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HeatmapRollups({ days }: { days: HeatmapDay[] }) {
  const stats = useMemo(() => computeRollups(days), [days]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Tile label="Last 7 days" value={formatHm(stats.last7)} sub={`${stats.daysActive7}/7 days active`} />
      <Tile label="Last 30 days" value={formatHm(stats.last30)} sub={`${stats.daysActive30}/30 days active`} />
      <Tile label="Current streak" value={`${stats.streak}d`} sub={stats.streak > 0 ? "Keep it up" : "Start one today"} />
      <Tile label="Best day" value={stats.best ? formatHm(stats.best.seconds) : "—"} sub={stats.best ? stats.best.date : "no data yet"} />
      <Tile className="sm:col-span-2" label="Most active weekday" value={stats.bestWeekday.name} sub={`avg ${formatHm(stats.bestWeekday.avg)}`} />
    </div>
  );
}

function Tile({
  label, value, sub, className,
}: { label: string; value: string; sub: string; className?: string }) {
  return (
    <div className={cn("rounded-md border bg-muted/20 p-3", className)}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

interface Rollups {
  last7: number;
  last30: number;
  daysActive7: number;
  daysActive30: number;
  streak: number;
  best: { date: string; seconds: number } | null;
  bestWeekday: { name: string; avg: number };
}

function computeRollups(days: HeatmapDay[]): Rollups {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byDate = new Map(days.map((d) => [d.date, d.seconds]));

  function nDays(n: number): { total: number; active: number } {
    let total = 0;
    let active = 0;
    for (let i = 0; i < n; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const sec = byDate.get(isoDayKey(d)) ?? 0;
      total += sec;
      if (sec > 0) active++;
    }
    return { total, active };
  }

  const w = nDays(7);
  const m = nDays(30);

  // Current streak: consecutive days back from today with seconds>0
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if ((byDate.get(isoDayKey(d)) ?? 0) > 0) streak++;
    else break;
  }

  let best: { date: string; seconds: number } | null = null;
  const wdTotals = [0, 0, 0, 0, 0, 0, 0];
  const wdCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) {
    if (!best || d.seconds > best.seconds) {
      if (d.seconds > 0) best = { date: d.date, seconds: d.seconds };
    }
    const wd = new Date(d.date + "T00:00:00").getDay();
    wdTotals[wd] += d.seconds;
    wdCounts[wd] += 1;
  }
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let bestWd = 0;
  let bestAvg = 0;
  for (let i = 0; i < 7; i++) {
    const avg = wdCounts[i] > 0 ? wdTotals[i] / wdCounts[i] : 0;
    if (avg > bestAvg) { bestAvg = avg; bestWd = i; }
  }

  return {
    last7: w.total,
    last30: m.total,
    daysActive7: w.active,
    daysActive30: m.active,
    streak,
    best,
    bestWeekday: { name: names[bestWd], avg: bestAvg },
  };
}

function isoDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CommitRow({ commit }: { commit: Commit }) {
  return (
    <div className="flex items-center gap-2 min-w-0 w-full">
      <code className="text-muted-foreground tabular-nums shrink-0 text-xs">{commit.sha.slice(0, 7)}</code>
      <span className="font-medium shrink-0 text-xs">{commit.repo}</span>
      <span className="text-foreground/90 truncate">— {commit.message}</span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
        <span className="text-green-500">+{commit.additions}</span>{" "}
        <span className="text-red-500">-{commit.deletions}</span>
      </span>
    </div>
  );
}

function sum(commits: Commit[], key: "additions" | "deletions"): number {
  let s = 0;
  for (const c of commits) s += c[key] ?? 0;
  return s;
}

function RangeChip({
  active, children, onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-sm rounded-full px-3 py-1 border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-transparent text-foreground/80 border-border hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function Stat({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="py-4 gap-1">
      <CardContent className="px-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

const RING_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function ActivityRings({ data }: { data: [string, number][] }) {
  const top = data.slice(0, 4);
  if (top.length === 0) {
    return <p className="text-sm text-muted-foreground h-56 flex items-center justify-center">No data.</p>;
  }
  const max = top[0][1] || 1;
  const size = 180;
  const center = size / 2;
  const stroke = 16;
  const gap = 4;

  return (
    <div className="h-56 flex flex-col items-center justify-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {top.map(([, seconds], i) => {
            const radius = center - stroke / 2 - i * (stroke + gap);
            const circ = 2 * Math.PI * radius;
            const frac = Math.max(0.02, Math.min(1, seconds / max));
            return (
              <g key={i}>
                <circle
                  cx={center} cy={center} r={radius}
                  fill="none" stroke="var(--muted)" strokeOpacity={0.35} strokeWidth={stroke}
                />
                <circle
                  cx={center} cy={center} r={radius}
                  fill="none" stroke={RING_COLORS[i]} strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - frac)}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="w-full space-y-1 text-xs">
        {top.map(([name, seconds], i) => (
          <li key={name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: RING_COLORS[i] }} />
            <span className="truncate flex-1">{name}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">{formatHm(seconds)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendCard({
  title, loading, data, dataKey, unit, gradientId,
}: {
  title: string;
  loading: boolean;
  data: Array<Record<string, string | number>>;
  dataKey: string;
  unit: string;
  gradientId: string;
}) {
  const nonZero = data.filter((d) => Number(d[dataKey]) > 0).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground h-56 flex items-center justify-center">No data.</p>
        ) : nonZero <= 1 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} interval="preserveStartEnd" />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} allowDecimals={false} />
                <RechartsTooltip
                  cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v} ${unit}`, ""]}
                />
                <Bar dataKey={dataKey} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ left: 8, right: 8 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} interval="preserveStartEnd" />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} allowDecimals={false} />
                <RechartsTooltip
                  cursor={{ stroke: "var(--accent)" }}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v} ${unit}`, ""]}
                />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke="var(--chart-1)"
                  fill={`url(#${gradientId})`}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----- Range helpers ------------------------------------------------------

function computeRange(p: Preset): { from: string; to: string } {
  const today = isoDate(new Date());
  if (p === "day") return { from: today, to: today };
  if (p === "week") return { from: isoDate(startOfWeek()), to: today };
  if (p === "month") {
    const start = new Date();
    start.setDate(1);
    return { from: isoDate(start), to: today };
  }
  return { from: today, to: today };
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00").getTime();
  const b = new Date(toIso + "T23:59:59").getTime();
  return Math.max(1, Math.ceil((b - a) / 86_400_000));
}

function humanRange(from: string, to: string): string {
  if (from === to) return new Date(from).toLocaleDateString();
  return `${new Date(from).toLocaleDateString()} – ${new Date(to).toLocaleDateString()}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
