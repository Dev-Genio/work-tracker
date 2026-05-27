"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptureBatch, VlmSummary } from "@work-tracker/shared";
import { isTauri } from "@work-tracker/shared";
import { CaptureLoop } from "@/lib/capture";
import { callVlm } from "@/lib/vlm";
import { ghTodayCommits, listProcesses, onTrayToggle, systemStats } from "@/lib/tauri-bridge";
import {
  DEFAULT_SETTINGS,
  getOpenRouterKey,
  type ServerSettings,
} from "@/lib/settings-store";

type LogLine = { t: string; msg: string; kind: "info" | "ok" | "err" };

export default function TrackPage() {
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
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) =>
        setSettings({
          vlmModel: s.vlmModel,
          chatModel: s.chatModel,
          captureIntervalSec: s.captureIntervalSec,
          batchIntervalSec: s.batchIntervalSec,
        }),
      )
      .catch(() => {});

    // Tray "Pause / Resume" menu click — no-op in browser.
    let cleanup: (() => void) | null = null;
    void onTrayToggle(() => {
      const loop = loopRef.current;
      if (!loop) return;
      const nowPaused = loop.toggle();
      setPaused(nowPaused);
      append("info", nowPaused ? "Paused via tray." : "Resumed via tray.");
    }).then((u) => {
      cleanup = u;
    });
    return () => {
      cleanup?.();
    };
  }, []);

  function append(kind: LogLine["kind"], msg: string) {
    setLog((l) =>
      [{ t: new Date().toLocaleTimeString(), msg, kind }, ...l].slice(0, 50),
    );
  }

  async function handleBatch(batch: CaptureBatch) {
    const key = getOpenRouterKey();
    if (!key) {
      append("err", "No OpenRouter key — set one in Settings.");
      return;
    }
    append("info", `Batch ready: ${batch.frames.length} frames → enriching…`);

    // Tauri-only enrichments. All return empty/null in the browser, so this is safe.
    const [processes, system, commits] = await Promise.all([
      listProcesses(20),
      systemStats(),
      ghTodayCommits(),
    ]);
    const enriched = {
      ...batch,
      processes: processes.length > 0 ? processes : undefined,
      system: system ?? undefined,
      commits: commits.length > 0 ? commits : undefined,
    };

    append("info", `Calling VLM with ${batch.frames.length} frames…`);
    try {
      const { summary, raw } = await callVlm({
        apiKey: key,
        model: settings.vlmModel,
        batch: enriched,
      });
      setLastSummary(summary);

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runtime: isTauri() ? "tauri" : "browser",
          startedAt: batch.startedAt,
          endedAt: batch.endedAt,
          frames: enriched.frames,
          processes: enriched.processes ?? null,
          system: enriched.system ?? null,
          commits: enriched.commits ?? [],
          model: settings.vlmModel,
          summary,
          rawJson: raw,
        }),
      });
      if (!res.ok) throw new Error(`ingest ${res.status}`);
      append("ok", `Saved. ${summary.activity}`);
      setFrames(0);
    } catch (e) {
      append("err", String(e));
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
      append("ok", "Tracking started.");
    } catch (e) {
      append("err", String(e));
      loopRef.current = null;
    }
  }

  async function stop() {
    const loop = loopRef.current;
    loopRef.current = null;
    if (loop) await loop.stop();
    setRunning(false);
    append("info", "Tracking stopped.");
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Track</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>
        Runtime: <strong>{tauri ? "tauri" : "browser"}</strong> · capturing every{" "}
        {settings.captureIntervalSec}s · batch every {Math.round(settings.batchIntervalSec / 60)} min
      </p>

      <div style={{ display: "flex", gap: 12 }}>
        {!running ? (
          <button onClick={start} style={{ ...btn, background: "var(--accent)" }}>
            Start tracking
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                const loop = loopRef.current;
                if (!loop) return;
                setPaused(loop.toggle());
              }}
              style={btn}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button onClick={stop} style={btn}>
              Stop
            </button>
          </>
        )}
        <span style={{ color: "var(--muted)", alignSelf: "center" }}>
          Buffer: {frames} frame{frames === 1 ? "" : "s"}
          {paused && " · paused"}
        </span>
      </div>

      {lastSummary && (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Last summary</h2>
          <p style={{ margin: "8px 0 4px" }}>{lastSummary.activity}</p>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            {lastSummary.app ?? "—"} · {lastSummary.projectGuess ?? "—"} · focus{" "}
            {(lastSummary.focusScore * 100).toFixed(0)}%
          </p>
          {lastSummary.tasks.length > 0 && (
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {lastSummary.tasks.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Activity</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: 13 }}>
          {log.map((l, i) => (
            <li key={i} style={{ color: l.kind === "err" ? "#ff6b6b" : l.kind === "ok" ? "var(--accent)" : "var(--muted)" }}>
              [{l.t}] {l.msg}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const btn: React.CSSProperties = {
  background: "#1a1a1a",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
};
const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};
