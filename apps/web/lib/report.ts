"use client";

import { formatDigest } from "@/lib/digest";
import { dataGet } from "@/lib/data-client";

const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ReportRequest {
  apiKey: string;
  model: string;
  fromIso: string;
  toIso: string;
  projects: string[]; // empty = all
  customContext: string;
}

interface Summary {
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

const SYSTEM = `You are a concise technical writer producing a work report from raw activity logs.

Output Markdown ONLY. No JSON, no code fences around the whole document.

Structure:
# Work Report — <date range>
## Summary
A 3-5 sentence overview of what was accomplished.
## By Project
For each project, a short paragraph + bulleted highlights.
## Commits
A compact list of notable commits, grouped by repo if helpful.
## Notes
Anything the user added in "Custom context" goes here, rephrased.

Rules:
- Use natural language. Reference times, projects, apps, and commit messages.
- NEVER include UUIDs, batch IDs, or session IDs.
- Skip noise. If activity was small, keep it short.
- Don't hallucinate work that isn't in the data.`;

export async function generateReport(req: ReportRequest): Promise<string> {
    const q = { from: req.fromIso, to: req.toIso, limit: 1000 };
  const [{ summaries = [] }, { commits = [] }] = await Promise.all([
    dataGet<{ summaries: Summary[] }>("summaries", q),
    dataGet<{ commits: Commit[] }>("commits", q),
  ]);

  const filtered =
    req.projects.length === 0
      ? summaries
      : summaries.filter((s) =>
          req.projects.includes(s.projectGuess ?? "(unknown project)"),
        );

  const digest = formatDigest(filtered, commits);
  const range = `${req.fromIso.slice(0, 10)} → ${req.toIso.slice(0, 10)}`;

  const userMsg = [
    `Date range: ${range}`,
    req.projects.length > 0
      ? `Filter to projects: ${req.projects.join(", ")}`
      : "Include all projects.",
    "",
    "ACTIVITY DATA:",
    digest,
    "",
    req.customContext.trim()
      ? `CUSTOM CONTEXT FROM USER (incorporate naturally in the Notes section):\n${req.customContext.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
      "X-Title": "work-tracker",
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const md: string = json?.choices?.[0]?.message?.content ?? "";
  // Strip leading/trailing ``` fences if the model wrapped the whole thing.
  return md.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}
