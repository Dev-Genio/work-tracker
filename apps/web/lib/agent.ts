"use client";

// Agentic RAG over the user's tracked work. The OpenRouter key never leaves
// the client; tool execution hits our own session-gated APIs. Multi-turn loop:
//   model -> JSON {tool, args} -> we execute -> feed result back -> repeat
//   until model emits {final: "..."}.

const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type Tool =
  | "search_logs"
  | "aggregate_time"
  | "get_commits"
  | "list_today";

interface ToolDef {
  name: Tool;
  description: string;
  argsHint: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "search_logs",
    description: "Free-text search over the user's tracked work summaries. Use for questions like 'when did I work on X', 'what did I do yesterday', 'find sessions about Y'.",
    argsHint: '{ "q"?: string, "from"?: ISO datetime, "to"?: ISO datetime, "app"?: string, "project"?: string, "limit"?: number (<=100) }',
    execute: async (args) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) if (v != null) p.set(k, String(v));
      const r = await fetch(`/api/rag/search?${p}`);
      return r.json();
    },
  },
  {
    name: "aggregate_time",
    description: "Sum tracked time grouped by project, app, or day. Use for 'how many hours on X', timesheet questions, breakdowns.",
    argsHint: '{ "groupBy": "project" | "app" | "day", "from"?: ISO datetime, "to"?: ISO datetime }',
    execute: async (args) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) if (v != null) p.set(k, String(v));
      const r = await fetch(`/api/timesheet?${p}`);
      return r.json();
    },
  },
  {
    name: "get_commits",
    description: "List git commits authored by the user in a date range. Source is the local gh CLI captured during tracking.",
    argsHint: '{ "from"?: ISO datetime, "to"?: ISO datetime }',
    execute: async (args) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) if (v != null) p.set(k, String(v));
      const r = await fetch(`/api/commits?${p}`);
      return r.json();
    },
  },
  {
    name: "list_today",
    description: "Get a quick summary of today's tracked sessions and commits.",
    argsHint: "{}",
    execute: async () => {
      const [s, c] = await Promise.all([
        fetch("/api/summaries").then((r) => r.json()),
        fetch("/api/commits").then((r) => r.json()),
      ]);
      return { summaries: s.summaries ?? [], commits: c.commits ?? [] };
    },
  },
];

function systemPrompt(): string {
  const tools = TOOLS.map(
    (t) => `- ${t.name}: ${t.description}\n  args: ${t.argsHint}`,
  ).join("\n");
  return `You are a work-history assistant. Today's date is ${new Date().toISOString()}.

You have access to these tools to retrieve data from the user's local work tracker:

${tools}

On EVERY turn, return ONLY a single JSON object — no prose, no markdown fences. One of:
{ "thought": string, "tool": "<name>", "args": { ... } }   // to call a tool
{ "final": string }                                        // to end the conversation

Guidelines:
- Prefer narrow date ranges. If the user says "yesterday" / "this week", compute ISO datetimes yourself.
- Chain multiple tool calls when needed (e.g. search first, then aggregate).
- Cite specific sessions, projects, and commits in your final answer.
- If no relevant data exists, say so plainly.`;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TraceStep {
  thought?: string;
  tool?: Tool;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  final?: string;
}

export interface AgentRunOptions {
  apiKey: string;
  model: string;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  maxSteps?: number;
  onStep?: (step: TraceStep) => void;
}

export interface AgentRunResult {
  answer: string;
  trace: TraceStep[];
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const max = opts.maxSteps ?? 8;
  const trace: TraceStep[] = [];

  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userMessage },
  ];

  for (let step = 0; step < max; step++) {
    const reply = await callModel(opts.apiKey, opts.model, messages);
    messages.push({ role: "assistant", content: reply });

    const parsed = extractJson(reply);
    if (!parsed) {
      const s: TraceStep = { error: "model returned non-JSON; treating as final", final: reply };
      trace.push(s);
      opts.onStep?.(s);
      return { answer: reply, trace };
    }

    if (typeof parsed.final === "string") {
      const s: TraceStep = { thought: typeof parsed.thought === "string" ? parsed.thought : undefined, final: parsed.final };
      trace.push(s);
      opts.onStep?.(s);
      return { answer: parsed.final, trace };
    }

    const toolName = parsed.tool as Tool | undefined;
    const args = (parsed.args ?? {}) as Record<string, unknown>;
    const def = TOOLS.find((t) => t.name === toolName);
    if (!def) {
      const s: TraceStep = { error: `unknown tool: ${String(toolName)}`, thought: typeof parsed.thought === "string" ? parsed.thought : undefined };
      trace.push(s);
      opts.onStep?.(s);
      messages.push({
        role: "user",
        content: `Tool "${String(toolName)}" does not exist. Available: ${TOOLS.map((t) => t.name).join(", ")}. Respond with a valid tool call or { "final": "..." }.`,
      });
      continue;
    }

    const stepRec: TraceStep = {
      thought: typeof parsed.thought === "string" ? parsed.thought : undefined,
      tool: def.name,
      args,
    };
    try {
      const result = await def.execute(args);
      stepRec.result = result;
      trace.push(stepRec);
      opts.onStep?.(stepRec);
      messages.push({
        role: "user",
        content: `Tool result for ${def.name}:\n${truncate(JSON.stringify(result), 6000)}\n\nContinue with another tool call or final answer.`,
      });
    } catch (e) {
      stepRec.error = String(e);
      trace.push(stepRec);
      opts.onStep?.(stepRec);
      messages.push({
        role: "user",
        content: `Tool ${def.name} failed: ${String(e)}. Try a different approach or finalize.`,
      });
    }
  }

  return { answer: "(stopped: max steps reached without final answer)", trace };
}

async function callModel(apiKey: string, model: string, messages: Message[]): Promise<string> {
  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
      "X-Title": "work-tracker",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    return typeof v === "object" && v ? (v as Record<string, unknown>) : null;
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        const v = JSON.parse(text.slice(a, b + 1));
        return typeof v === "object" && v ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…(truncated)`;
}
