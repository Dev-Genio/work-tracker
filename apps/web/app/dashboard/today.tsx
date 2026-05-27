"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Clock, GitCommit, Target } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatHm } from "@/lib/time";

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

export default function Today() {
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [commits, setCommits] = useState<Commit[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/summaries").then((r) => r.json()),
      fetch("/api/commits").then((r) => r.json()),
    ]).then(([s, c]) => {
      setSummaries(s.summaries ?? []);
      setCommits(c.commits ?? []);
    });
  }, []);

  const loading = summaries === null || commits === null;

  const stats = useMemo(() => {
    if (!summaries) return null;
    let total = 0;
    const byProject = new Map<string, number>();
    const byApp = new Map<string, number>();
    let focusSum = 0;
    for (const s of summaries) {
      const d = Math.max(0, (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
      total += d;
      focusSum += s.focusScore;
      byProject.set(s.projectGuess ?? "(unknown)", (byProject.get(s.projectGuess ?? "(unknown)") ?? 0) + d);
      byApp.set(s.app ?? "(unknown)", (byApp.get(s.app ?? "(unknown)") ?? 0) + d);
    }
    return {
      total,
      focusAvg: summaries.length > 0 ? focusSum / summaries.length : 0,
      byProject: [...byProject.entries()].sort((a, b) => b[1] - a[1]),
      byApp: [...byApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [summaries]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (summaries.length === 0 && commits.length === 0) {
    return <Empty />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat icon={<Clock className="h-4 w-4" />} label="Tracked today" value={formatHm(stats!.total)} />
        <Stat icon={<Target className="h-4 w-4" />} label="Avg focus" value={`${(stats!.focusAvg * 100).toFixed(0)}%`} />
        <Stat icon={<GitCommit className="h-4 w-4" />} label="Commits today" value={String(commits!.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BreakdownCard title="By project" data={stats!.byProject} />
        <BreakdownCard title="By app" data={stats!.byApp} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 pt-0">
          {summaries.map((s, i) => (
            <div key={s.id}>
              {i > 0 && <Separator />}
              <div className="grid grid-cols-[110px_1fr_auto] gap-4 py-3 text-sm">
                <div className="text-muted-foreground tabular-nums">
                  {fmtTime(s.startedAt)} – {fmtTime(s.endedAt)}
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
          ))}
        </CardContent>
      </Card>

      {commits!.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Commits today</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {commits!.map((c) => (
                <li key={`${c.repo}:${c.sha}`} className="flex gap-2">
                  <code className="text-muted-foreground tabular-nums">{c.sha.slice(0, 7)}</code>
                  <span className="font-medium">{c.repo}</span>
                  <span className="text-muted-foreground">— {c.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Empty() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">No activity today yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Head to <a href="/track" className="underline">Track</a> to start a session.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, data }: { title: string; data: [string, number][] }) {
  const chartData = data.slice(0, 8).map(([name, seconds]) => ({ name, minutes: Math.round(seconds / 60) }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
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

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
