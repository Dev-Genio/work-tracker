"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Circle } from "lucide-react";
import { toast } from "sonner";

import { isTauri } from "@work-tracker/shared";
import type { CaptureBatch, VlmSummary } from "@work-tracker/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import { CaptureLoop } from "@/lib/capture";
import { callVlm } from "@/lib/vlm";
import { dataGetSettings, dataIngest } from "@/lib/data-client";
import { ghTodayDetailed, listProcesses, onTrayToggle, systemStats } from "@/lib/tauri-bridge";
import {
  DEFAULT_SETTINGS,
  type ServerSettings,
} from "@/lib/settings-store";
import { providerReady } from "@/lib/llm";

type LogLine = { t: string; msg: string; kind: "info" | "ok" | "err" };

export default function Tracker() {
  const loopRef = useRef<CaptureLoop | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frames, setFrames] = useState(0);
  const [lastSummary, setLastSummary] = useState<VlmSummary | null>(null);
  const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const [log, setLog] = useState<LogLine[]>([]);
  const [tauri, setTauri] = useState(false);

  useEffect(() => {
    setTauri(isTauri());
    dataGetSettings()
      .then((s) => setSettings({
        vlmModel: s.vlmModel, chatModel: s.chatModel,
        captureIntervalSec: s.captureIntervalSec, batchIntervalSec: s.batchIntervalSec,
      }))
      .catch(() => {});

    let cleanup: (() => void) | null = null;
    void onTrayToggle(() => {
      const loop = loopRef.current;
      if (!loop) return;
      const now = loop.toggle();
      setPaused(now);
      append("info", now ? "Paused via tray." : "Resumed via tray.");
    }).then((u) => { cleanup = u; });
    return () => { cleanup?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function append(kind: LogLine["kind"], msg: string) {
    setLog((l) => [{ t: new Date().toLocaleTimeString(), msg, kind }, ...l].slice(0, 60));
  }

  async function handleBatch(batch: CaptureBatch) {
    const ready = providerReady();
    if (!ready.ok) {
      append("err", ready.reason ?? "LLM provider not configured.");
      toast.error(ready.reason ?? "Configure an LLM provider in Settings.");
      return;
    }
    append("info", `Batch ready: ${batch.frames.length} frames`);

    const [processes, system, gh] = await Promise.all([
      listProcesses(20),
      systemStats(),
      ghTodayDetailed(),
    ]);
    // Surface any gh failure verbosely — once, on the first occurrence per
    // session — so SAML/auth issues don't silently strip commits from batches.
    if (gh.warnings.length > 0) {
      for (const w of gh.warnings) {
        append("err", w);
      }
      toast.error("GitHub data partial — see Activity log for details.", {
        description: gh.warnings[0].split("\n").slice(-1)[0],
        duration: 8000,
      });
    }
    const enriched = {
      ...batch,
      processes: processes.length > 0 ? processes : undefined,
      system: system ?? undefined,
      commits: gh.commits.length > 0 ? gh.commits : undefined,
    };

    try {
      append("info", "Calling VLM…");
      const { summary } = await callVlm({ model: settings.vlmModel, batch: enriched });
      setLastSummary(summary);

      await dataIngest({
        runtime: isTauri() ? "tauri" : "browser",
        startedAt: batch.startedAt,
        endedAt: batch.endedAt,
        // Only the count — JPEG bytes stay client-side, used for the VLM
        // call above and then discarded.
        frameCount: enriched.frames.length,
        processes: enriched.processes ?? null,
        system: enriched.system ?? null,
        commits: enriched.commits ?? [],
        model: settings.vlmModel,
        summary,
      });
      append("ok", summary.activity);
      setFrames(0);
    } catch (e) {
      append("err", String(e));
      toast.error(String(e));
    }
  }

  async function start() {
    if (loopRef.current) return;
    const loop = new CaptureLoop({
      captureIntervalSec: settings.captureIntervalSec,
      batchIntervalSec: settings.batchIntervalSec,
      onFrame: (_, n) => setFrames(n),
      onBatchReady: handleBatch,
      onError: (e) => append("err", String(e)),
    });
    loopRef.current = loop;
    try {
      await loop.start();
      setRunning(true);
      setPaused(false);
      append("ok", "Tracking started.");
      toast.success("Tracking started.");
    } catch (e) {
      append("err", String(e));
      loopRef.current = null;
      toast.error(String(e));
    }
  }

  async function stop() {
    const loop = loopRef.current;
    loopRef.current = null;
    if (loop) await loop.stop();
    setRunning(false);
    setPaused(false);
    append("info", "Tracking stopped.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Track</h1>
        <p className="text-sm text-muted-foreground">
          Start a session — we&apos;ll capture frames and ask the VLM what you&apos;re up to.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3">
              <StatusDot running={running} paused={paused} />
              <div>
                <div className="font-medium">
                  {running ? (paused ? "Paused" : "Tracking") : "Idle"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Runtime: <Badge variant="outline" className="ml-1 align-middle">{tauri ? "tauri" : "browser"}</Badge>
                  <span className="mx-2">·</span>
                  every {settings.captureIntervalSec}s
                  <span className="mx-2">·</span>
                  batch every {Math.round(settings.batchIntervalSec / 60)} min
                </div>
              </div>
            </div>
            <div className="flex-1" />
            <div className="flex gap-2">
              {!running ? (
                <Button onClick={start} size="lg">
                  <Play className="h-4 w-4" /> Start tracking
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const loop = loopRef.current;
                      if (!loop) return;
                      setPaused(loop.toggle());
                    }}
                  >
                    {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {paused ? "Resume" : "Pause"}
                  </Button>
                  <Button variant="outline" onClick={stop}>
                    <Square className="h-4 w-4" /> Stop
                  </Button>
                </>
              )}
            </div>
          </div>
          {running && (
            <div className="mt-4 text-sm text-muted-foreground">
              Buffer: <span className="text-foreground tabular-nums font-medium">{frames}</span> frame{frames === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Last summary</CardTitle>
            <CardDescription>The VLM&apos;s read on your most recent batch.</CardDescription>
          </CardHeader>
          <CardContent>
            {!lastSummary ? (
              <p className="text-sm text-muted-foreground">Nothing yet. Summaries appear after the first batch is sent.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {lastSummary.projectGuess && <Badge variant="secondary">{lastSummary.projectGuess}</Badge>}
                  {lastSummary.app && <Badge variant="outline">{lastSummary.app}</Badge>}
                  <Badge variant="default">focus {(lastSummary.focusScore * 100).toFixed(0)}%</Badge>
                </div>
                <p className="text-sm">{lastSummary.activity}</p>
                {lastSummary.tasks.length > 0 && (
                  <>
                    <Separator />
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                      {lastSummary.tasks.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Live log of capture events.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 pr-4">
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events yet.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {log.map((l, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground tabular-nums shrink-0">{l.t}</span>
                      <span className={`whitespace-pre-wrap break-words ${
                        l.kind === "err" ? "text-destructive" :
                        l.kind === "ok" ? "text-foreground" :
                        "text-muted-foreground"
                      }`}>{l.msg}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusDot({ running, paused }: { running: boolean; paused: boolean }) {
  const color = !running ? "text-muted-foreground" : paused ? "text-yellow-500" : "text-green-500";
  return (
    <div className="relative">
      <Circle className={`h-3 w-3 fill-current ${color}`} />
      {running && !paused && (
        <Circle className="absolute inset-0 h-3 w-3 fill-current text-green-500 animate-ping opacity-50" />
      )}
    </div>
  );
}
