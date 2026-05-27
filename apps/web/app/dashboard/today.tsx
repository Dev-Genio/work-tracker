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
    const [sRes, cRes] = await Promise.all([
      fetch(`/api/summaries?${params}`).then((r) => r.json()),
      fetch(`/api/commits?from=${fromIso}&to=${toIso}`).then((r) => r.json()),
    ]);
    setSummaries(sRes.summaries ?? []);
    setTotal(Number(sRes.total ?? 0));
    setCommits(cRes.commits ?? []);
  }, [fromIso, toIso, pageSize, page]);

  // Fetch per-day totals — always wide enough to fill the heatmap.
  const loadHeatmap = useCallback(async () => {
    // Heatmap shows at least the last 90 days regardless of selected range,
    // so it stays useful even on a single-day view.
    const days = Math.max(90, daysBetween(from, to));
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

  const stats = useMemo(() => {
    if (!summaries) return null;
    let total = 0;
    const byProject = new Map<string, number>();
    const byApp = new Map<string, number>();
    let focusSum = 0;
    for (const s of summaries) {
      const d =
        (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000;
      total += Math.max(0, d);
      focusSum += s.focusScore;
      byProject.set(
        s.projectGuess ?? "(unknown)",
        (byProject.get(s.projectGuess ?? "(unknown)") ?? 0) + Math.max(0, d),
      );
      byApp.set(
        s.app ?? "(unknown)",
        (byApp.get(s.app ?? "(unknown)") ?? 0) + Math.max(0, d),
      );
    }
    return {
      total,
      focusAvg: summaries.length > 0 ? focusSum / summaries.length : 0,
      byProject: [...byProject.entries()].sort((a, b) => b[1] - a[1]),
      byApp: [...byApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [summaries]);

  const dailyChart = useMemo(() => {
    return heatmapDays
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ date: d.date.slice(5), minutes: Math.round(d.seconds / 60) }));
  }, [heatmapDays]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const loadingList = summaries === null;

  return (
    <div className="space-y-6">
      {/* Range picker */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1.5 flex-wrap">
              <RangeChip active={preset === "day"} onClick={() => pickPreset("day")}>
                Today
              </RangeChip>
              <RangeChip active={preset === "week"} onClick={() => pickPreset("week")}>
                This week
              </RangeChip>
              <RangeChip active={preset === "month"} onClick={() => pickPreset("month")}>
                This month
              </RangeChip>
              <RangeChip
                active={preset === "custom"}
                onClick={() => pickPreset("custom")}
              >
                Custom
              </RangeChip>
            </div>
            {preset === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="from">From</Label>
                  <Input
                    id="from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="to">To</Label>
                  <Input
                    id="to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-40"
                  />
                </div>
              </>
            )}
            <div className="flex-1" />
            <div className="text-sm text-muted-foreground">
              {humanRange(from, to)}
            </div>
          </div>
        </CardContent>
      </Card>

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
            <Stat icon={<Clock className="h-4 w-4" />} label="Tracked" value={formatHm(stats!.total)} />
            <Stat icon={<Sparkles className="h-4 w-4" />} label="Sessions" value={String(total)} />
            <Stat icon={<Target className="h-4 w-4" />} label="Avg focus" value={`${(stats!.focusAvg * 100).toFixed(0)}%`} />
            <Stat icon={<GitCommit className="h-4 w-4" />} label="Commits" value={String(commits?.length ?? 0)} />
          </>
        )}
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Activity heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapDays.length === 0 ? (
            <Skeleton className="h-24 w-full rounded-md" />
          ) : (
            <ActivityHeatmap
              days={heatmapDays}
              fromIso={heatmapRange.fromIso}
              toIso={heatmapRange.toIso}
            />
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BreakdownCard title="By project" data={stats?.byProject ?? []} loading={loadingList} />
        <BreakdownCard title="By app" data={stats?.byApp ?? []} loading={loadingList} />
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Daily activity</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyChart.length === 0 ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyChart} margin={{ left: 8, right: 8 }}>
                    <defs>
                      <linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} interval="preserveStartEnd" />
                    <YAxis stroke="var(--muted-foreground)" fontSize={10} />
                    <RechartsTooltip
                      cursor={{ stroke: "var(--accent)" }}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [`${v} min`, "Tracked"]}
                    />
                    <Area type="monotone" dataKey="minutes" stroke="var(--chart-1)" fill="url(#dailyFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
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
          <CardHeader>
            <CardTitle>Commits</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {commits.map((c) => (
                <li key={`${c.repo}:${c.sha}`} className="flex gap-2">
                  <code className="text-muted-foreground tabular-nums">{c.sha.slice(0, 7)}</code>
                  <span className="font-medium shrink-0">{c.repo}</span>
                  <span className="text-muted-foreground truncate">— {c.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
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
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon} {label}
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title, data, loading,
}: { title: string; data: [string, number][]; loading: boolean }) {
  const chartData = data.slice(0, 8).map(([name, seconds]) => ({
    name,
    minutes: Math.round(seconds / 60),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis dataKey="name" type="category" width={120} stroke="var(--muted-foreground)" fontSize={11} />
                <RechartsTooltip
                  cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v} min`, ""]}
                />
                <Bar dataKey="minutes" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
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
