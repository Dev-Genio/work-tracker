"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatHm, isoDate, startOfWeek } from "@/lib/time";

interface Row {
  key: string;
  seconds: number;
  focusAvg: number;
  entries: number;
}

type GroupBy = "project" | "app" | "day";

export default function TimesheetPage() {
  const today = useMemo(() => isoDate(new Date()), []);
  const weekStart = useMemo(() => isoDate(startOfWeek()), []);

  const [from, setFrom] = useState(weekStart);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(from + "T00:00:00").toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
      groupBy,
    });
    const res = await fetch(`/api/timesheet?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setLoading(false);
  }, [from, to, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.reduce((a, r) => a + r.seconds, 0);

  const exportParams = new URLSearchParams({
    from: new Date(from + "T00:00:00").toISOString(),
    to: new Date(to + "T23:59:59").toISOString(),
  });

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: 32,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Timesheet</h1>
        <Link href="/dashboard">Back to dashboard</Link>
      </header>

      <section style={card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
          </Field>
          <Field label="Group by">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              style={input}
            >
              <option value="project">Project</option>
              <option value="app">App</option>
              <option value="day">Day</option>
            </select>
          </Field>
          <div style={{ flex: 1 }} />
          <a href={`/api/export/csv?${exportParams}`} style={btn}>
            Export CSV
          </a>
          <button onClick={() => window.print()} style={btn}>
            Print / save PDF
          </button>
        </div>
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <strong>{rows.length} row{rows.length === 1 ? "" : "s"}</strong>
          <span style={{ color: "var(--muted)" }}>Total: {formatHm(total)}</span>
        </div>
        {loading ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>No entries in range.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontWeight: 500 }}>
                <th style={th}>{labelFor(groupBy)}</th>
                <th style={th}>Time</th>
                <th style={th}>Entries</th>
                <th style={th}>Focus</th>
                <th style={th}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = total > 0 ? (r.seconds / total) * 100 : 0;
                return (
                  <tr key={r.key} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>{r.key}</td>
                    <td style={td}>{formatHm(r.seconds)}</td>
                    <td style={td}>{r.entries}</td>
                    <td style={td}>{(r.focusAvg * 100).toFixed(0)}%</td>
                    <td style={td}>{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <style>{`
        @media print {
          a, button, header a, .no-print { display: none !important; }
          body { background: white; color: black; }
          section { border-color: #ccc !important; background: white !important; }
        }
      `}</style>
    </main>
  );
}

function labelFor(g: GroupBy): string {
  return g === "project" ? "Project" : g === "app" ? "App" : "Day";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--muted)" }}>
      {label}
      {children}
    </label>
  );
}

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
};
const input: React.CSSProperties = {
  background: "#0a0a0a",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 14,
};
const btn: React.CSSProperties = {
  background: "#1a1a1a",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
};
const th: React.CSSProperties = { padding: "6px 8px", fontSize: 12 };
const td: React.CSSProperties = { padding: "8px" };
