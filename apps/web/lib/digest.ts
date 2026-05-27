/**
 * Builds a natural-language digest of today's activity that we hand to the
 * chat agent as a primer — so it can answer "what did I do today" style
 * questions without making any tool calls.
 */
export async function fetchTodayDigest(): Promise<string> {
  const [s, c] = await Promise.all([
    fetch("/api/summaries").then((r) => r.json()),
    fetch("/api/commits").then((r) => r.json()),
  ]);
  return formatDigest(s.summaries ?? [], c.commits ?? []);
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

export function formatDigest(summaries: Summary[], commits: Commit[]): string {
  if (summaries.length === 0 && commits.length === 0) {
    return "No tracked activity today yet.";
  }

  const lines: string[] = [];

  // Per-project totals.
  const byProject = new Map<string, number>();
  for (const s of summaries) {
    const d =
      (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000;
    const key = s.projectGuess ?? "(unknown project)";
    byProject.set(key, (byProject.get(key) ?? 0) + Math.max(0, d));
  }
  if (byProject.size > 0) {
    lines.push("Today's time by project:");
    for (const [p, sec] of [...byProject.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${p}: ${formatHm(sec)}`);
    }
    lines.push("");
  }

  // Sessions in chronological order.
  if (summaries.length > 0) {
    lines.push("Today's sessions (chronological):");
    for (const s of summaries) {
      const start = fmtTime(s.startedAt);
      const end = fmtTime(s.endedAt);
      const tags = [s.projectGuess, s.app].filter(Boolean).join(" / ");
      const focus = `focus ${(s.focusScore * 100).toFixed(0)}%`;
      lines.push(`- ${start}–${end} (${tags || "—"}, ${focus}): ${s.activity}`);
      if (s.tasks.length > 0) {
        for (const t of s.tasks.slice(0, 4)) lines.push(`    · ${t}`);
      }
    }
    lines.push("");
  }

  // Today's commits.
  if (commits.length > 0) {
    lines.push("Today's commits:");
    for (const c of commits.slice(0, 30)) {
      lines.push(`- ${c.repo} ${c.sha.slice(0, 7)} — ${c.message}`);
    }
  }

  return lines.join("\n").trim();
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHm(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
