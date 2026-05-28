"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/markdown";

import { generateReport } from "@/lib/report";
import { dataGet, dataGetSettings } from "@/lib/data-client";
import { providerReady } from "@/lib/llm";
import { isoDate } from "@/lib/time";
import {
  DEFAULT_SETTINGS,
  type ServerSettings,
} from "@/lib/settings-store";

interface ProjectRow {
  project: string;
  seconds: number;
}

export default function ReportBuilder() {
  const today = useMemo(() => isoDate(new Date()), []);
  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  }, []);

  const [from, setFrom] = useState(sevenDaysAgo);
  const [to, setTo] = useState(today);
  const [allProjects, setAllProjects] = useState<ProjectRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeAll, setIncludeAll] = useState(true);
  const [customContext, setCustomContext] = useState("");
  const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<string>("");

  useEffect(() => {
    dataGetSettings()
      .then((s) => setSettings({
        vlmModel: s.vlmModel, chatModel: s.chatModel,
        captureIntervalSec: s.captureIntervalSec, batchIntervalSec: s.batchIntervalSec,
      }))
      .catch(() => {});
  }, []);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const data = await dataGet<{ projects: ProjectRow[] }>("projects", {
        from: new Date(from + "T00:00:00").toISOString(),
        to: new Date(to + "T23:59:59").toISOString(),
      });
      setAllProjects(data.projects ?? []);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoadingProjects(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  function toggleProject(p: string) {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setSelected(next);
    setIncludeAll(false);
  }

  async function generate() {
    const ready = providerReady();
    if (!ready.ok) {
      toast.error(ready.reason ?? "Configure an LLM provider in Settings.");
      return;
    }
    setGenerating(true);
    setReport("");
    try {
      const md = await generateReport({
        apiKey: "",
        model: settings.chatModel,
        fromIso: new Date(from + "T00:00:00").toISOString(),
        toIso: new Date(to + "T23:59:59").toISOString(),
        projects: includeAll ? [] : [...selected],
        customContext,
      });
      setReport(md);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function copyMd() {
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Copied to clipboard.");
    } catch (e) {
      toast.error(String(e));
    }
  }

  function downloadMd() {
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-report-${from}_${to}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report</h1>
        <p className="text-sm text-muted-foreground">
          Generate a Markdown summary of past work. Pick a range, filter
          projects, and add anything the activity logs don&apos;t cover.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Range</CardTitle>
            <CardDescription>Defaults to the past 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Projects
              <Button
                size="sm"
                variant={includeAll ? "default" : "outline"}
                onClick={() => {
                  setIncludeAll(true);
                  setSelected(new Set());
                }}
              >
                {includeAll && <Check className="h-3.5 w-3.5" />}
                All
              </Button>
            </CardTitle>
            <CardDescription>
              Click to include. Empty selection = all projects in the range.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingProjects ? (
              <div className="flex gap-2 flex-wrap">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}
              </div>
            ) : allProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tracked projects in this range.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {allProjects.map((p) => {
                  const active = !includeAll && selected.has(p.project);
                  return (
                    <button
                      key={p.project}
                      onClick={() => toggleProject(p.project)}
                      className="group"
                    >
                      <Badge
                        variant={active ? "default" : "outline"}
                        className="gap-1.5 cursor-pointer hover:bg-accent"
                      >
                        {active && <Check className="h-3 w-3" />}
                        {p.project}
                        <span className="text-muted-foreground/70 ml-0.5">
                          {formatHm(p.seconds)}
                        </span>
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Custom context</CardTitle>
          <CardDescription>
            Anything not captured by the screen tracker — meetings, decisions,
            blockers, planning. Becomes the &quot;Notes&quot; section.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="Standups, design decisions, blockers, what you'd say in a Friday wrap-up…"
            className="w-full min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button size="lg" onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {generating ? "Generating…" : "Generate report"}
        </Button>
        {!includeAll && selected.size > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setSelected(new Set());
              setIncludeAll(true);
            }}
          >
            <X className="h-4 w-4" />
            Clear filter ({selected.size})
          </Button>
        )}
      </div>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Report</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyMd}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button size="sm" variant="outline" onClick={downloadMd}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            <Markdown>{report}</Markdown>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatHm(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
