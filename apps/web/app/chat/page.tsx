"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { runAgent, type TraceStep } from "@/lib/agent";
import {
  DEFAULT_SETTINGS,
  getOpenRouterKey,
  type ServerSettings,
} from "@/lib/settings-store";

interface Turn {
  user: string;
  answer?: string;
  trace: TraceStep[];
  pending: boolean;
  error?: string;
}

export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    const key = getOpenRouterKey();
    if (!key) {
      setTurns((t) => [...t, { user: text, trace: [], pending: false, error: "No OpenRouter key — set one in Settings." }]);
      setInput("");
      return;
    }

    const idx = turns.length;
    setTurns((t) => [...t, { user: text, trace: [], pending: true }]);
    setInput("");

    const history = turns
      .filter((t) => t.answer)
      .flatMap((t) => [
        { role: "user" as const, content: t.user },
        { role: "assistant" as const, content: t.answer! },
      ]);

    try {
      const { answer, trace } = await runAgent({
        apiKey: key,
        model: settings.chatModel,
        history,
        userMessage: text,
        maxSteps: 8,
        onStep: (step) => {
          setTurns((t) =>
            t.map((row, i) =>
              i === idx ? { ...row, trace: [...row.trace, step] } : row,
            ),
          );
        },
      });
      setTurns((t) =>
        t.map((row, i) => (i === idx ? { ...row, answer, pending: false } : row)),
      );
    } catch (e) {
      setTurns((t) =>
        t.map((row, i) =>
          i === idx ? { ...row, error: String(e), pending: false } : row,
        ),
      );
    }
  }

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: 32,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: "100vh",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Ask your work history</h1>
        <Link href="/dashboard">Back</Link>
      </header>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        Model: <code>{settings.chatModel}</code>. Tools: search_logs, aggregate_time, get_commits, list_today.
      </p>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {turns.length === 0 && (
          <div style={card}>
            <p style={{ margin: 0, color: "var(--muted)" }}>Try:</p>
            <ul style={{ marginTop: 8 }}>
              <li>"What did I work on yesterday?"</li>
              <li>"How many hours on work-tracker this week?"</li>
              <li>"Show me commits from Monday."</li>
            </ul>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ ...bubble, alignSelf: "flex-end", background: "var(--accent)", color: "white" }}>
              {t.user}
            </div>

            {t.trace.length > 0 && (
              <details style={traceCard}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
                  Trace ({t.trace.length} step{t.trace.length === 1 ? "" : "s"})
                </summary>
                <ol style={{ marginTop: 8, paddingLeft: 20, fontSize: 12 }}>
                  {t.trace.map((s, j) => (
                    <li key={j} style={{ marginBottom: 6 }}>
                      {s.thought && <div style={{ color: "var(--muted)", fontStyle: "italic" }}>{s.thought}</div>}
                      {s.tool && (
                        <div>
                          <code>{s.tool}</code>(<code>{JSON.stringify(s.args ?? {})}</code>)
                        </div>
                      )}
                      {s.error && <div style={{ color: "#ff6b6b" }}>error: {s.error}</div>}
                      {s.result !== undefined && (
                        <div style={{ color: "var(--muted)" }}>
                          → {summarizeResult(s.result)}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            )}

            {t.pending && !t.answer && (
              <div style={{ ...bubble, color: "var(--muted)" }}>Thinking…</div>
            )}
            {t.answer && <div style={bubble}>{t.answer}</div>}
            {t.error && <div style={{ ...bubble, color: "#ff6b6b" }}>{t.error}</div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        style={{ display: "flex", gap: 8, position: "sticky", bottom: 16 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your tracked work…"
          style={inputStyle}
        />
        <button type="submit" style={{ ...btn, background: "var(--accent)" }}>
          Send
        </button>
      </form>
    </main>
  );
}

function summarizeResult(r: unknown): string {
  try {
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      if (Array.isArray(o.results)) return `${o.results.length} result(s)`;
      if (Array.isArray(o.rows)) return `${o.rows.length} row(s)`;
      if (Array.isArray(o.commits)) return `${o.commits.length} commit(s)`;
      if (Array.isArray(o.summaries)) return `${o.summaries.length} summary(s)`;
    }
    const s = JSON.stringify(r);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return "(unrenderable)";
  }
}

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
};
const bubble: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "10px 14px",
  maxWidth: "85%",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};
const traceCard: React.CSSProperties = {
  background: "#0a0a0a",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 12px",
};
const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "#0a0a0a",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
};
const btn: React.CSSProperties = {
  background: "#1a1a1a",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 14,
  cursor: "pointer",
};
