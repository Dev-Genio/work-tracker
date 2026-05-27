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

// Keys we strip from any tool result before sending back to the model. These
// are internal UUIDs we never want the model to surface in its answer.
const STRIP_KEYS = new Set([
  "id",
  "batchId",
  "summaryId",
  "userId",
  "rawJson",
  "jpegBase64",
]);

function sanitize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (STRIP_KEYS.has(k)) continue;
      out[k] = sanitize(val);
    }
    return out;
  }
  return v;
}

const TOOLS: ToolDef[] = [
  {
    name: "search_logs",
    description:
      "Free-text search over the user's tracked work summaries OUTSIDE of today. Use only when the user asks about past days, weeks, specific topics not in today's primer, or other apps/projects.",
    argsHint:
      '{ "q"?: string, "from"?: ISO datetime, "to"?: ISO datetime, "app"?: string, "project"?: string, "limit"?: number (<=100) }',
    execute: async (args) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) if (v != null) p.set(k, String(v));
      const r = await fetch(`/api/rag/search?${p}`);
      return sanitize(await r.json());
    },
  },
  {
    name: "aggregate_time",
    description:
      "Sum tracked time grouped by project, app, or day. Use for 'how many hours on X this week', timesheet questions, breakdowns spanning more than today.",
    argsHint:
      '{ "groupBy": "project" | "app" | "day", "from"?: ISO datetime, "to"?: ISO datetime }',
    execute: async (args) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) if (v != null) p.set(k, String(v));
      const r = await fetch(`/api/timesheet?${p}`);
      return sanitize(await r.json());
    },
  },
  {
    name: "get_commits",
    description:
      "List git commits authored by the user in a date range OTHER than today. Today's commits are already in the primer.",
    argsHint: '{ "from"?: ISO datetime, "to"?: ISO datetime }',
    execute: async (args) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) if (v != null) p.set(k, String(v));
      const r = await fetch(`/api/commits?${p}`);
      return sanitize(await r.json());
    },
  },
];

function systemPrompt(primer: string | undefined): string {
  const tools = TOOLS.map(
    (t) => `- ${t.name}: ${t.description}\n  args: ${t.argsHint}`,
  ).join("\n");

  const primerBlock = primer
    ? `\n--- TODAY'S ACTIVITY (already known, no tool call needed for these) ---\n${primer}\n--- END TODAY ---\n`
    : "";

  return `You are a work-history assistant. Today's date is ${new Date().toLocaleDateString()}.
${primerBlock}
You have access to these tools to retrieve data BEYOND what's in today's primer:

${tools}

On EVERY turn, return ONLY a single JSON object — no prose, no markdown fences. One of:
{ "thought": string, "tool": "<name>", "args": { ... } }   // to call a tool
{ "final": string }                                        // to end the conversation

Strict rules for the FINAL answer:
- Write in plain natural language. No JSON, no markdown fences.
- NEVER mention internal IDs, UUIDs, or "session" / "batch" identifiers. Reference work by project, app, time of day, or commit message instead.
- Prefer concrete times ("2:15 PM"), date ranges ("Monday morning", "this week"), and project names.
- If today's primer already answers the question, answer directly with NO tool call.
- Only call tools when the question is about other days, broader time ranges, or details not in the primer.
- Chain tool calls only when truly needed. Stop and answer as soon as you have enough.
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
  /** Pre-fetched digest of today's activity, inlined into the system prompt. */
  primer?: string;
  maxSteps?: number;
  onStep?: (step: TraceStep) => void;
}

export interface AgentRunResult {
  answer: string;
  trace: TraceStep[];
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const max = opts.maxSteps ?? 6;
  const trace: TraceStep[] = [];

  const messages: Message[] = [
    { role: "system", content: systemPrompt(opts.primer) },
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userMessage },
  ];

  for (let step = 0; step < max; step++) {
    const reply = await callModel(opts.apiKey, opts.model, messages);
    messages.push({ role: "assistant", content: reply });

    const parsed = extractJson(reply);
    if (!parsed) {
      const s: TraceStep = { final: reply };
      trace.push(s);
      opts.onStep?.(s);
      return { answer: reply, trace };
    }

    if (typeof parsed.final === "string") {
      const s: TraceStep = {
        thought: typeof parsed.thought === "string" ? parsed.thought : undefined,
        final: parsed.final,
      };
      trace.push(s);
      opts.onStep?.(s);
      return { answer: parsed.final, trace };
    }

    const toolName = parsed.tool as Tool | undefined;
    const args = (parsed.args ?? {}) as Record<string, unknown>;
    const def = TOOLS.find((t) => t.name === toolName);
    if (!def) {
      const s: TraceStep = {
        error: `unknown tool: ${String(toolName)}`,
        thought: typeof parsed.thought === "string" ? parsed.thought : undefined,
      };
      trace.push(s);
      opts.onStep?.(s);
      messages.push({
        role: "user",
        content: `Tool "${String(
          toolName,
        )}" does not exist. Available: ${TOOLS.map((t) => t.name).join(
          ", ",
        )}. Respond with a valid tool call or { "final": "..." }.`,
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
        content: `Tool result for ${def.name}:\n${truncate(
          JSON.stringify(result),
          6000,
        )}\n\nContinue with another tool call or final answer (remember: natural language, no IDs).`,
      });
    } catch (e) {
      stepRec.error = String(e);
      trace.push(stepRec);
      opts.onStep?.(stepRec);
      messages.push({
        role: "user",
        content: `Tool ${def.name} failed: ${String(
          e,
        )}. Try a different approach or finalize.`,
      });
    }
  }

  return { answer: "(stopped: max steps reached without final answer)", trace };
}

async function callModel(
  apiKey: string,
  model: string,
  messages: Message[],
): Promise<string> {
  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        typeof window !== "undefined" ? window.location.origin : "",
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
