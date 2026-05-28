"use client";

import type { CaptureBatch, VlmSummary } from "@work-tracker/shared";
import { chatCompletion, resolveTarget } from "@/lib/llm";

const SYSTEM_PROMPT = `You analyze a short series of screenshots from a user's work session, plus optional context (running processes, recent git commits, CPU/memory).
Return ONE JSON object describing what the user was working on, matching this TypeScript type EXACTLY:

{
  "activity": string,           // 1-2 sentence description of what they were doing
  "app": string | null,         // primary app/window (e.g. "VS Code", "Chrome - Gmail")
  "projectGuess": string | null,// best guess at project/repo name
  "tasks": string[],            // concrete tasks observed (commits, files edited, tickets, messages)
  "focusScore": number          // 0..1, how focused vs scattered the session looked
}

Return ONLY the JSON. No prose, no markdown fences.`;

export interface VlmCallOptions {
  /** Ignored unless using OpenRouter (the provider/target is resolved from
   *  device settings). Kept for backwards-compatible call sites. */
  apiKey?: string;
  model: string;
  batch: CaptureBatch;
  maxFrames?: number; // cap to keep payload small; default 6
}

export interface VlmResult {
  summary: VlmSummary;
  /** The model's raw structured response (parsed JSON, or { text } if it
   *  wasn't valid JSON). Persisted to vlm_summaries.raw_json. */
  raw: unknown;
}

export async function callVlm(opts: VlmCallOptions): Promise<VlmResult> {
  const max = opts.maxFrames ?? 6;
  // Sample evenly across the batch to keep payload bounded.
  const picks = sampleEvenly(opts.batch.frames, max);

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: buildUserText(opts.batch),
    },
    ...picks.map((f) => ({
      type: "image_url" as const,
      image_url: { url: `data:image/jpeg;base64,${f.jpegBase64}` },
    })),
  ];

  const text = await chatCompletion({
    target: resolveTarget(),
    model: opts.model,
    jsonObject: true,
    jsonSchema: {
      name: "work_summary",
      strict: true,
      schema: {
        type: "object",
        properties: {
          activity: { type: "string" },
          app: { type: ["string", "null"] },
          projectGuess: { type: ["string", "null"] },
          tasks: { type: "array", items: { type: "string" } },
          focusScore: { type: "number" },
        },
        required: ["activity", "app", "projectGuess", "tasks", "focusScore"],
        additionalProperties: false,
      },
    },
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
  });

  const summary = parseSummary(text);
  const raw = extractJson(text) ?? { text };
  return { summary, raw };
}

function buildUserText(batch: CaptureBatch): string {
  const lines: string[] = [];
  lines.push(`Time window: ${batch.startedAt} → ${batch.endedAt}`);
  lines.push(`Frame count attached: see images below.`);
  if (batch.system) {
    lines.push(
      `System: CPU ${batch.system.cpuPercent.toFixed(0)}%, mem ${batch.system.memUsedMb}/${batch.system.memTotalMb} MB`,
    );
  }
  if (batch.processes && batch.processes.length > 0) {
    const top = batch.processes.slice(0, 12).map((p) => p.name).join(", ");
    lines.push(`Top processes: ${top}`);
  }
  if (batch.commits && batch.commits.length > 0) {
    lines.push(`Recent commits:`);
    for (const c of batch.commits.slice(0, 10)) {
      lines.push(`- [${c.repo}] ${c.sha.slice(0, 7)} ${c.message}`);
    }
  }
  return lines.join("\n");
}

function sampleEvenly<T>(arr: T[], k: number): T[] {
  if (arr.length <= k) return arr;
  const step = (arr.length - 1) / (k - 1);
  const out: T[] = [];
  for (let i = 0; i < k; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

function parseSummary(text: string): VlmSummary {
  const json = extractJson(text);
  const obj = typeof json === "object" && json ? (json as Record<string, unknown>) : {};
  return {
    activity: str(obj.activity) ?? "(no activity)",
    app: str(obj.app),
    projectGuess: str(obj.projectGuess),
    tasks: Array.isArray(obj.tasks) ? obj.tasks.filter((x): x is string => typeof x === "string") : [],
    focusScore: clamp01(num(obj.focusScore)),
  };
}

function extractJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
