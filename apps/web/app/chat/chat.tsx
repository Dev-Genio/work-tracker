"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { runAgent, type TraceStep } from "@/lib/agent";
import { fetchTodayDigest } from "@/lib/digest";
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

const SUGGESTIONS = [
  "What did I work on yesterday?",
  "How many hours on work-tracker this week?",
  "Show me commits from Monday.",
  "Which app did I use most today?",
];

export default function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const [primer, setPrimer] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setSettings({
        vlmModel: s.vlmModel, chatModel: s.chatModel,
        captureIntervalSec: s.captureIntervalSec, batchIntervalSec: s.batchIntervalSec,
      }))
      .catch(() => {});
    // Pre-fetch today's digest so the model can answer "what did I do today"
    // questions without burning a tool call.
    fetchTodayDigest().then(setPrimer).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg) return;
    const key = getOpenRouterKey();
    if (!key) {
      toast.error("No OpenRouter key — set one in Settings.");
      return;
    }

    const idx = turns.length;
    setTurns((t) => [...t, { user: msg, trace: [], pending: true }]);
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
        userMessage: msg,
        primer,
        maxSteps: 8,
        onStep: (step) => {
          setTurns((t) =>
            t.map((row, i) => i === idx ? { ...row, trace: [...row.trace, step] } : row),
          );
        },
      });
      setTurns((t) => t.map((row, i) => i === idx ? { ...row, answer, pending: false } : row));
    } catch (e) {
      setTurns((t) => t.map((row, i) => i === idx ? { ...row, error: String(e), pending: false } : row));
      toast.error(String(e));
    }
  }

  return (
    <div className="flex flex-col h-[calc(100svh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ask your work history</h1>
        <p className="text-sm text-muted-foreground">
          Model: <code className="text-foreground">{settings.chatModel}</code>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-6">
        {turns.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Sparkles className="h-4 w-4" /> Try one of these
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {turns.map((t, i) => (
          <div key={i} className="space-y-3">
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2 max-w-[80%] text-sm">
                {t.user}
              </div>
            </div>

            {t.trace.length > 0 && (
              <details className="group">
                <summary className="list-none flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground w-fit">
                  <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                  {t.trace.length} step{t.trace.length === 1 ? "" : "s"}
                </summary>
                <Card className="mt-2">
                  <CardContent className="pt-4 space-y-2 text-xs">
                    {t.trace.map((s, j) => (
                      <div key={j}>
                        {j > 0 && <Separator className="my-2" />}
                        {s.thought && (
                          <p className="text-muted-foreground italic mb-1">{s.thought}</p>
                        )}
                        {s.tool && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="font-mono">{s.tool}</Badge>
                            <code className="text-muted-foreground truncate">
                              {JSON.stringify(s.args ?? {})}
                            </code>
                          </div>
                        )}
                        {s.error && <p className="text-destructive mt-1">error: {s.error}</p>}
                        {s.result !== undefined && (
                          <p className="text-muted-foreground mt-1">→ {summarize(s.result)}</p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </details>
            )}

            {t.pending && !t.answer && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-1.5 w-1.5 bg-current rounded-full animate-pulse" />
                Thinking…
              </div>
            )}
            {t.answer && (
              <div className="rounded-2xl rounded-bl-sm bg-card border px-4 py-3 max-w-[85%] text-sm whitespace-pre-wrap leading-relaxed">
                {t.answer}
              </div>
            )}
            {t.error && (
              <div className="text-sm text-destructive">{t.error}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void send(); }}
        className="mt-4 flex gap-2 sticky bottom-0 bg-background pt-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your tracked work…"
          className="flex-1"
        />
        <Button type="submit" disabled={!input.trim()}>
          <Send className="h-4 w-4" />
          Send
        </Button>
      </form>
    </div>
  );
}

function summarize(r: unknown): string {
  try {
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      if (Array.isArray(o.results)) return `${o.results.length} result(s)`;
      if (Array.isArray(o.rows)) return `${o.rows.length} row(s)`;
      if (Array.isArray(o.commits)) return `${o.commits.length} commit(s)`;
      if (Array.isArray(o.summaries)) return `${o.summaries.length} summary(ies)`;
    }
    const s = JSON.stringify(r);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return "(unrenderable)";
  }
}
