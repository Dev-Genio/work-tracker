"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/summaries").then((r) => r.json()),
      fetch("/api/commits").then((r) => r.json()),
    ])
      .then(([s, c]) => {
        setSummaries(s.summaries ?? []);
        setCommits(c.commits ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    let total = 0;
    const byProject = new Map<string, number>();
    const byApp = new Map<string, number>();
    let focusSum = 0;
    for (const s of summaries) {
      const d = Math.max(0, (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
      total += d;
      focusSum += s.focusScore;
      const proj = s.projectGuess ?? "(unknown)";
      const app = s.app ?? "(unknown)";
      byProject.set(proj, (byProject.get(proj) ?? 0) + d);
      byApp.set(app, (byApp.get(app) ?? 0) + d);
    }
    return {
      total,
      focusAvg: summaries.length > 0 ? focusSum / summaries.length : 0,
      byProject: [...byProject.entries()].sort((a, b) => b[1] - a[1]),
      byApp: [...byApp.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [summaries]);

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading today…</p>;

  if (summaries.length === 0 && commits.length === 0) {
    return (
      <p style={{ color: "var(--muted)" }}>
        Nothing tracked today yet. Head to <a href="/track">Track</a> to start.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Stat label="Tracked today" value={formatHm(stats.total)} />
        <Stat label="Avg focus" value={`${(stats.focusAvg * 100).toFixed(0)}%`} />
        <Stat label="Commits today" value={String(commits.length)} />
      </div>

      <Card title="By project">
        <Bars items={stats.byProject} total={stats.total} />
      </Card>

      <Card title="By app">
        <Bars items={stats.byApp.slice(0, 8)} total={stats.total} />
      </Card>

      <Card title="Timeline">
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {summaries.map((s) => (
            <li
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 60px",
                gap: 12,
                fontSize: 13,
                paddingBottom: 8,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ color: "var(--muted)" }}>
                {fmtTime(s.startedAt)} – {fmtTime(s.endedAt)}
              </span>
              <span>
                <strong>{s.projectGuess ?? "—"}</strong>
                {s.app ? ` · ${s.app}` : ""} — {s.activity}
              </span>
              <span style={{ color: "var(--muted)", textAlign: "right" }}>
                {(s.focusScore * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {commits.length > 0 && (
        <Card title="Commits today">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6, fontSize: 13 }}>
            {commits.map((c) => (
              <li key={`${c.repo}:${c.sha}`}>
                <code style={{ color: "var(--muted)" }}>{c.sha.slice(0, 7)}</code>{" "}
                <strong>{c.repo}</strong> — {c.message}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={card}>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--muted)" }}>{title}</h2>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Bars({ items, total }: { items: [string, number][]; total: number }) {
  if (items.length === 0) return <p style={{ color: "var(--muted)", margin: 0 }}>—</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map(([k, v]) => {
        const pct = total > 0 ? (v / total) * 100 : 0;
        return (
          <div key={k}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>{k}</span>
              <span style={{ color: "var(--muted)" }}>{formatHm(v)}</span>
            </div>
            <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, marginTop: 4 }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--accent)",
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
