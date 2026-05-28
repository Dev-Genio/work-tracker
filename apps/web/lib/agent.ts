"use client";

// Agentic RAG over the user's tracked work. The OpenRouter key never leaves
// the client; tool execution hits our own session-gated APIs. Multi-turn loop:
//   model -> JSON {tool, args} -> we execute -> feed result back -> repeat
//   until model emits {final: "..."}.

import { dataGet } from "@/lib/data-client";
import { chatCompletion } from "@/lib/llm";

export type Tool =
  | "day_digest"
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

// Matches ISO-8601 datetimes like 2026-05-27T16:11:00.000Z or with offset.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

let LOCAL_TZ = "UTC";

function localizeIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Format in the user's tz so the model never does timezone math itself.
  const s = d.toLocaleString("en-US", {
    timeZone: LOCAL_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${s} (${LOCAL_TZ})`;
}

function sanitize(v: unknown): unknown {
  if (typeof v === "string") {
    return ISO_RE.test(v) ? localizeIso(v) : v;
  }
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
    name: "day_digest",
    description:
      "THE PRIMARY TOOL for 'what did I do on <day/range>' AND for system resource questions. Returns the COMPLETE day condensed in one call: total time, focus, project & app breakdowns, merged activity time-blocks, commits, plus systemUsage (avg/peak CPU %, avg/peak memory MB, total memory) and topProcesses (most-seen process names with avg CPU and peak memory). systemUsage/topProcesses come from the desktop tracker and are null/empty for days tracked only in the browser. Use this instead of paging search_logs.",
    argsHint:
      '{ "from": ISO datetime (local day start, e.g. 2026-05-27T00:00:00+05:30), "to": ISO datetime (local day end) }',
    execute: async (args) => sanitize(await dataGet("rag/day", args as Record<string, string>)),
  },
  {
    name: "search_logs",
    description:
      "Free-text search over the user's tracked work summaries OUTSIDE of today. Use only when the user asks about past days, weeks, specific topics not in today's primer, or other apps/projects.",
    argsHint:
      '{ "q"?: string, "from"?: ISO datetime, "to"?: ISO datetime, "app"?: string, "project"?: string, "limit"?: number (<=100) }',
    execute: async (args) => sanitize(await dataGet("rag/search", args as Record<string, string>)),
  },
  {
    name: "aggregate_time",
    description:
      "Sum tracked time grouped by project, app, or day. Use for 'how many hours on X this week', timesheet questions, breakdowns spanning more than today.",
    argsHint:
      '{ "groupBy": "project" | "app" | "day", "from"?: ISO datetime, "to"?: ISO datetime }',
    execute: async (args) => sanitize(await dataGet("timesheet", args as Record<string, string>)),
  },
  {
    name: "get_commits",
    description:
      "List git commits authored by the user in a date range OTHER than today. Today's commits are already in the primer.",
    argsHint: '{ "from"?: ISO datetime, "to"?: ISO datetime }',
    execute: async (args) => sanitize(await dataGet("commits", args as Record<string, string>)),
  },
];

function systemPrompt(primer: string | undefined, tz: string): string {
  const tools = TOOLS.map(
    (t) => `- ${t.name}: ${t.description}\n  args: ${t.argsHint}`,
  ).join("\n");

  const primerBlock = primer
    ? `\n--- TODAY'S ACTIVITY (already known, no tool call needed for these) ---\n${primer}\n--- END TODAY ---\n`
    : "";

  // Provide the user's local "now" with offset so the model can compute
  // correct day boundaries without doing timezone math in its head.
  const now = new Date();
  const localNow = now.toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  });
  const offsetMin = -now.getTimezoneOffset(); // browser is in user's tz
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;

  return `You are a work-history assistant.

TIMEZONE:
- The user's timezone is ${tz} (UTC${offset}).
- Right now it is: ${localNow}.
- All timestamps in tool results are ALREADY converted to ${tz} local time — read and report them as-is. Do NOT shift them.
- When you pass "from"/"to" to a tool, use the user's LOCAL day boundaries written with their offset, e.g. "2026-05-27T00:00:00${offset}" for the start of that local day. Never use Z/UTC boundaries — that would miss early-morning or late-night sessions.
${primerBlock}
You have access to these tools to retrieve data BEYOND what's in today's primer:

${tools}

On EVERY turn, return ONLY a single JSON object — no prose, no markdown fences. One of:
{ "thought": string, "tool": "<name>", "args": { ... } }   // to call a tool
{ "final": string }                                        // to end the conversation

Notes on data shape & tool choice:
- A "session" is a short captured batch (~1 min). A busy day has 100-300 of them, so NEVER try to reconstruct a day by paging search_logs — it's capped and returns only the newest matches, and you will loop without ever seeing the morning.
- For "what did I do on <day>" → use day_digest. It returns the whole day already condensed into time-blocks + breakdowns + commits in ONE call.
- For "how long / how many hours" → use aggregate_time (or read totalSeconds from day_digest).
- For CPU / memory / RAM / "which processes were running / using resources" → use day_digest and read systemUsage + topProcesses. This data IS available (captured by the desktop tracker). Only say it's unavailable if systemUsage is null/empty for the asked range (e.g. browser-only tracking).
- Use search_logs ONLY for keyword lookups ("find sessions about X"); treat its output as a sample, never the complete set.

Strict rules for the FINAL answer:
- Write in clear natural language. Markdown is allowed and encouraged (headings, bullet lists, bold) — it will be rendered.
- NEVER mention internal IDs, UUIDs, or "batch" identifiers. Reference work by project, app, time of day (in ${tz}), or commit message.
- Use concrete local times ("2:15 PM"), date ranges, and project names.
- If today's primer already answers the question, answer directly with NO tool call.
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
  /** IANA timezone (e.g. "Asia/Kolkata"). Used to localize all times. */
  timezone?: string;
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

  // Set the module-level tz used by sanitize()/localizeIso() for this run.
  LOCAL_TZ =
    opts.timezone ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC") ||
    "UTC";

  const messages: Message[] = [
    { role: "system", content: systemPrompt(opts.primer, LOCAL_TZ) },
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
  // Provider/endpoint resolved from device settings (OpenRouter or LM Studio).
  // apiKey is unused here but kept for the existing call signature.
  void apiKey;
  return chatCompletion({
    model,
    messages,
    jsonObject: true,
    // For LM Studio: schema-constrain the control object. Loose (strict:false)
    // because it's a union — either a tool call {thought,tool,args} or {final}.
    jsonSchema: {
      name: "agent_step",
      strict: false,
      schema: {
        type: "object",
        properties: {
          thought: { type: "string" },
          tool: { type: "string" },
          args: { type: "object", additionalProperties: true },
          final: { type: "string" },
        },
        additionalProperties: true,
      },
    },
    temperature: 0.2,
  });
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
