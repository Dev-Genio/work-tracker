"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Send, Sparkles, User, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

import { runAgent, type TraceStep } from "@/lib/agent";
import { fetchTodayDigest } from "@/lib/digest";
import { dataGetSettings } from "@/lib/data-client";
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
    dataGetSettings()
      .then((s) => setSettings({
        vlmModel: s.vlmModel, chatModel: s.chatModel,
        captureIntervalSec: s.captureIntervalSec, batchIntervalSec: s.batchIntervalSec,
      }))
      .catch(() => {});
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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

  const empty = turns.length === 0;

  return (
    <div className="flex flex-col min-h-[calc(100svh-8rem)]">
      {/* Header */}
      <div className="mx-auto w-full max-w-2xl px-1 mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ask your work history</h1>
        <p className="text-sm text-muted-foreground">
          Grounded in your tracked sessions and commits · <code className="text-foreground/80">{settings.chatModel}</code>
        </p>
      </div>

      {/* Conversation — flows within the app shell's single scroll container */}
      <div className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-1 py-4 space-y-8">
          {empty && (
            <div className="flex flex-col items-center text-center gap-5 pt-10 animate-in fade-in duration-500">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">Ask anything about your work</p>
                <p className="text-sm text-muted-foreground">
                  I can search sessions, total your hours, and pull up commits.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm rounded-xl border bg-card hover:bg-accent transition-colors px-4 py-3"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className="space-y-4">
              {/* User message */}
              <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start gap-2.5 max-w-[85%]">
                  <div className="rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-sm leading-relaxed">
                    {t.user}
                  </div>
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>

              {/* Assistant turn */}
              <div className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {t.trace.length > 0 && <TraceDisclosure trace={t.trace} />}

                  {t.pending && !t.answer && <Thinking />}

                  {t.answer && (
                    <div className="group/answer relative rounded-2xl rounded-tl-md bg-card border px-4 py-3">
                      <Markdown>{t.answer}</Markdown>
                      <CopyButton text={t.answer} />
                    </div>
                  )}
                  {t.error && (
                    <div className="rounded-2xl rounded-tl-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {t.error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer — sticks to the bottom of the scroll viewport */}
      <div className="sticky bottom-0 border-t bg-background/80 backdrop-blur">
        <form
          onSubmit={(e) => { e.preventDefault(); void send(); }}
          className="mx-auto w-full max-w-2xl px-1 py-3 flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your tracked work…"
            className="flex-1 h-11 rounded-xl"
          />
          <Button type="submit" disabled={!input.trim()} size="icon" className="h-11 w-11 rounded-xl">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy markdown"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy to clipboard");
        }
      }}
      className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover/answer:opacity-100 focus:opacity-100 transition-opacity"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2 text-muted-foreground">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </div>
  );
}

function TraceDisclosure({ trace }: { trace: TraceStep[] }) {
  return (
    <details className="group rounded-lg border bg-muted/30 overflow-hidden">
      <summary className="list-none flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground px-3 py-2">
        <Wrench className="h-3 w-3" />
        <span>{trace.length} step{trace.length === 1 ? "" : "s"}</span>
        <ChevronDown className="h-3 w-3 ml-auto group-open:rotate-180 transition-transform" />
      </summary>
      <div className="px-3 pb-3 space-y-2 text-xs">
        {trace.map((s, j) => (
          <div key={j}>
            {j > 0 && <Separator className="my-2" />}
            {s.thought && <p className="text-muted-foreground italic mb-1">{s.thought}</p>}
            {s.tool && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-mono">{s.tool}</Badge>
                <code className="text-muted-foreground truncate">{JSON.stringify(s.args ?? {})}</code>
              </div>
            )}
            {s.error && <p className="text-destructive mt-1">error: {s.error}</p>}
            {s.result !== undefined && (
              <p className="text-muted-foreground mt-1">→ {summarize(s.result)}</p>
            )}
          </div>
        ))}
      </div>
    </details>
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
// cn retained for potential future styling tweaks.
void cn;
