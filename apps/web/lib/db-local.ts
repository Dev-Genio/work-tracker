"use client";

import Dexie, { type Table } from "dexie";

// Local mirror of the Neon schema. Sessions denormalize batch+summary (1:1).
export interface LocalSession {
  id: string;
  startedAt: string; // ISO
  endedAt: string; // ISO
  startedAtMs: number; // indexed for range queries
  runtime: string;
  frameCount: number;
  activity: string;
  app: string | null;
  projectGuess: string | null;
  tasks: string[];
  focusScore: number;
  model: string;
  processes: unknown; // ProcessInfo[] | null
  system: unknown; // SystemStats | null
}

export interface LocalCommit {
  id: string; // `${repo}@${sha}`
  repo: string;
  sha: string;
  message: string;
  body: string | null;
  additions: number;
  deletions: number;
  committedAt: string; // ISO
  committedAtMs: number;
}

export interface LocalSettings {
  id: string; // "singleton"
  vlmModel: string;
  chatModel: string;
  captureIntervalSec: number;
  batchIntervalSec: number;
}

class LocalDB extends Dexie {
  sessions!: Table<LocalSession, string>;
  commits!: Table<LocalCommit, string>;
  settings!: Table<LocalSettings, string>;

  constructor() {
    super("work-tracker-local");
    this.version(1).stores({
      sessions: "id, startedAtMs",
      commits: "id, committedAtMs",
      settings: "id",
    });
  }
}

let _db: LocalDB | null = null;
export function db(): LocalDB {
  if (!_db) _db = new LocalDB();
  return _db;
}

// ---- helpers --------------------------------------------------------------

function isoDay(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function secs(startIso: string, endIso: string): number {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
}
function clampInt(v: unknown, def: number, lo: number, hi: number): number {
  const n = v == null ? def : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

async function sessionsInRange(fromMs: number, toMs: number): Promise<LocalSession[]> {
  return db().sessions.where("startedAtMs").between(fromMs, toMs, true, true).toArray();
}

// ---- ingest ---------------------------------------------------------------

export async function localIngest(body: {
  runtime: string;
  startedAt: string;
  endedAt: string;
  frameCount?: number;
  processes?: unknown;
  system?: unknown;
  model: string;
  summary: { activity: string; app: string | null; projectGuess: string | null; tasks: string[]; focusScore: number };
  commits?: { repo: string; sha: string; message: string; body?: string; additions?: number; deletions?: number; committedAt: string }[];
}): Promise<{ ok: true }> {
  const id = crypto.randomUUID();
  await db().sessions.add({
    id,
    startedAt: body.startedAt,
    endedAt: body.endedAt,
    startedAtMs: new Date(body.startedAt).getTime(),
    runtime: body.runtime,
    frameCount: body.frameCount ?? 0,
    activity: body.summary.activity,
    app: body.summary.app,
    projectGuess: body.summary.projectGuess,
    tasks: body.summary.tasks ?? [],
    focusScore: body.summary.focusScore ?? 0,
    model: body.model,
    processes: body.processes ?? null,
    system: body.system ?? null,
  });
  if (body.commits?.length) {
    await db().commits.bulkPut(
      body.commits.map((c) => ({
        id: `${c.repo}@${c.sha}`,
        repo: c.repo,
        sha: c.sha,
        message: c.message,
        body: c.body ?? null,
        additions: c.additions ?? 0,
        deletions: c.deletions ?? 0,
        committedAt: c.committedAt,
        committedAtMs: new Date(c.committedAt).getTime(),
      })),
    );
  }
  return { ok: true };
}

// ---- reads (shapes mirror the /api routes) --------------------------------

export async function localSummaries(p: URLSearchParams) {
  const from = new Date(p.get("from") ?? 0).getTime();
  const to = new Date(p.get("to") ?? Date.now()).getTime();
  const limit = clampInt(p.get("limit"), 1000, 1, 1000);
  const offset = clampInt(p.get("offset"), 0, 0, 1_000_000);
  const order = p.get("order") === "asc" ? "asc" : "desc";

  const all = await sessionsInRange(from, to);
  all.sort((a, b) =>
    order === "asc" ? a.startedAtMs - b.startedAtMs : b.startedAtMs - a.startedAtMs,
  );
  const totalSeconds = all.reduce((s, r) => s + secs(r.startedAt, r.endedAt), 0);
  const focusAvg = all.length ? all.reduce((s, r) => s + r.focusScore, 0) / all.length : 0;
  const page = all.slice(offset, offset + limit).map((r) => ({
    id: r.id,
    batchId: r.id,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    activity: r.activity,
    app: r.app,
    projectGuess: r.projectGuess,
    tasks: r.tasks,
    focusScore: r.focusScore,
    model: r.model,
  }));
  return { summaries: page, total: all.length, totalSeconds: Math.round(totalSeconds), focusAvg, limit, offset, order };
}

export async function localCommits(p: URLSearchParams) {
  const from = new Date(p.get("from") ?? 0).getTime();
  const to = new Date(p.get("to") ?? Date.now()).getTime();
  const rows = await db().commits.where("committedAtMs").between(from, to, true, true).toArray();
  rows.sort((a, b) => b.committedAtMs - a.committedAtMs);
  return { commits: rows };
}

export async function localTimesheet(p: URLSearchParams) {
  const from = new Date(p.get("from") ?? 0).getTime();
  const to = new Date(p.get("to") ?? Date.now()).getTime();
  const groupBy = (p.get("groupBy") ?? "project") as "project" | "app" | "day";
  const all = await sessionsInRange(from, to);
  const buckets = new Map<string, { seconds: number; focusSum: number; entries: number }>();
  for (const r of all) {
    const key =
      groupBy === "project" ? r.projectGuess ?? "(unknown project)"
      : groupBy === "app" ? r.app ?? "(unknown app)"
      : isoDay(r.startedAt);
    const b = buckets.get(key) ?? { seconds: 0, focusSum: 0, entries: 0 };
    b.seconds += secs(r.startedAt, r.endedAt);
    b.focusSum += r.focusScore;
    b.entries += 1;
    buckets.set(key, b);
  }
  const rows = [...buckets.entries()]
    .map(([key, b]) => ({ key, seconds: Math.round(b.seconds), focusAvg: b.entries ? b.focusSum / b.entries : 0, entries: b.entries }))
    .sort((a, b) => (groupBy === "day" ? a.key.localeCompare(b.key) : b.seconds - a.seconds));
  return { rows, groupBy };
}

export async function localHeatmap(p: URLSearchParams) {
  const from = new Date(p.get("from") ?? 0).getTime();
  const to = new Date(p.get("to") ?? Date.now()).getTime();
  const all = await sessionsInRange(from, to);
  const commits = await db().commits.where("committedAtMs").between(from, to, true, true).toArray();
  const byDay = new Map<string, { seconds: number; commits: number }>();
  for (const r of all) {
    const k = isoDay(r.startedAt);
    const e = byDay.get(k) ?? { seconds: 0, commits: 0 };
    e.seconds += secs(r.startedAt, r.endedAt);
    byDay.set(k, e);
  }
  for (const c of commits) {
    const k = isoDay(c.committedAt);
    const e = byDay.get(k) ?? { seconds: 0, commits: 0 };
    e.commits += 1;
    byDay.set(k, e);
  }
  const days = [...byDay.entries()].map(([date, v]) => ({ date, seconds: Math.round(v.seconds), commits: v.commits }));
  return { days };
}

export async function localProjects(p: URLSearchParams) {
  const from = new Date(p.get("from") ?? 0).getTime();
  const to = new Date(p.get("to") ?? Date.now()).getTime();
  const all = await sessionsInRange(from, to);
  const m = new Map<string, number>();
  for (const r of all) {
    if (!r.projectGuess) continue;
    m.set(r.projectGuess, (m.get(r.projectGuess) ?? 0) + secs(r.startedAt, r.endedAt));
  }
  const projects = [...m.entries()].map(([project, seconds]) => ({ project, seconds: Math.round(seconds) })).sort((a, b) => b.seconds - a.seconds);
  return { projects };
}

export async function localRagSearch(p: URLSearchParams) {
  const from = new Date(p.get("from") ?? 0).getTime();
  const to = new Date(p.get("to") ?? Date.now()).getTime();
  const q = (p.get("q") ?? "").trim().toLowerCase();
  const app = p.get("app")?.toLowerCase();
  const project = p.get("project")?.toLowerCase();
  const limit = clampInt(p.get("limit"), 20, 1, 100);
  let all = await sessionsInRange(from, to);
  all.sort((a, b) => b.startedAtMs - a.startedAtMs);
  all = all.filter((r) => {
    if (q) {
      const hay = `${r.activity} ${r.app ?? ""} ${r.projectGuess ?? ""} ${r.tasks.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (app && !(r.app ?? "").toLowerCase().includes(app)) return false;
    if (project && !(r.projectGuess ?? "").toLowerCase().includes(project)) return false;
    return true;
  });
  const results = all.slice(0, limit).map((r) => ({
    id: r.id, startedAt: r.startedAt, endedAt: r.endedAt, activity: r.activity,
    app: r.app, projectGuess: r.projectGuess, tasks: r.tasks, focusScore: r.focusScore,
  }));
  return { results };
}

export async function localRagDay(p: URLSearchParams) {
  const from = new Date(p.get("from") ?? 0).getTime();
  const to = new Date(p.get("to") ?? Date.now()).getTime();
  const rows = (await sessionsInRange(from, to)).sort((a, b) => a.startedAtMs - b.startedAtMs);
  const commits = (await db().commits.where("committedAtMs").between(from, to, true, true).toArray())
    .sort((a, b) => b.committedAtMs - a.committedAtMs)
    .map((c) => ({ repo: c.repo, sha: c.sha, message: c.message, additions: c.additions, deletions: c.deletions, committedAt: c.committedAt }));

  let totalSeconds = 0, focusSum = 0;
  const byProject = new Map<string, number>();
  const byApp = new Map<string, number>();
  let cpuSum = 0, cpuPeak = 0, cpuN = 0, memUsedSum = 0, memUsedPeak = 0, memN = 0, memTotal = 0;
  const procAgg = new Map<string, { seen: number; cpuSum: number; memPeak: number }>();

  for (const r of rows) {
    const d = secs(r.startedAt, r.endedAt);
    totalSeconds += d; focusSum += r.focusScore;
    byProject.set(r.projectGuess ?? "(unknown)", (byProject.get(r.projectGuess ?? "(unknown)") ?? 0) + d);
    byApp.set(r.app ?? "(unknown)", (byApp.get(r.app ?? "(unknown)") ?? 0) + d);
    const sys = r.system as { cpuPercent?: number; memUsedMb?: number; memTotalMb?: number } | null;
    if (sys && typeof sys.cpuPercent === "number") { cpuSum += sys.cpuPercent; cpuPeak = Math.max(cpuPeak, sys.cpuPercent); cpuN++; }
    if (sys && typeof sys.memUsedMb === "number") { memUsedSum += sys.memUsedMb; memUsedPeak = Math.max(memUsedPeak, sys.memUsedMb); memN++; if (typeof sys.memTotalMb === "number") memTotal = Math.max(memTotal, sys.memTotalMb); }
    const procs = (r.processes as { name?: string; cpu?: number; memMb?: number }[] | null) ?? [];
    for (const pr of procs) {
      if (!pr.name) continue;
      const e = procAgg.get(pr.name) ?? { seen: 0, cpuSum: 0, memPeak: 0 };
      e.seen += 1; e.cpuSum += pr.cpu ?? 0; e.memPeak = Math.max(e.memPeak, pr.memMb ?? 0);
      procAgg.set(pr.name, e);
    }
  }

  const GAP = 10 * 60 * 1000;
  interface Block { start: string; end: string; project: string | null; apps: Set<string>; activities: string[]; seconds: number }
  const blocks: Block[] = [];
  for (const r of rows) {
    const last = blocks[blocks.length - 1];
    const same = last && last.project === (r.projectGuess ?? null);
    const close = last && new Date(r.startedAt).getTime() - new Date(last.end).getTime() <= GAP;
    if (last && same && close) {
      last.end = r.endedAt; last.seconds += secs(r.startedAt, r.endedAt);
      if (r.app) last.apps.add(r.app);
      if (r.activity && !last.activities.includes(r.activity) && last.activities.length < 6) last.activities.push(r.activity);
    } else {
      blocks.push({ start: r.startedAt, end: r.endedAt, project: r.projectGuess ?? null, apps: new Set(r.app ? [r.app] : []), activities: r.activity ? [r.activity] : [], seconds: secs(r.startedAt, r.endedAt) });
    }
  }

  return {
    totalSeconds: Math.round(totalSeconds),
    focusAvg: rows.length ? focusSum / rows.length : 0,
    sessions: rows.length,
    systemUsage: cpuN > 0 || memN > 0 ? {
      cpuAvgPercent: cpuN ? Math.round((cpuSum / cpuN) * 10) / 10 : null,
      cpuPeakPercent: cpuN ? Math.round(cpuPeak * 10) / 10 : null,
      memAvgMb: memN ? Math.round(memUsedSum / memN) : null,
      memPeakMb: memN ? memUsedPeak : null,
      memTotalMb: memTotal || null,
      samples: cpuN,
    } : null,
    topProcesses: [...procAgg.entries()].sort((a, b) => b[1].seen - a[1].seen).slice(0, 12)
      .map(([name, v]) => ({ name, seen: v.seen, cpuAvgPercent: v.seen ? Math.round((v.cpuSum / v.seen) * 10) / 10 : 0, memPeakMb: v.memPeak })),
    byProject: [...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([key, s]) => ({ key, seconds: Math.round(s) })),
    byApp: [...byApp.entries()].sort((a, b) => b[1] - a[1]).map(([key, s]) => ({ key, seconds: Math.round(s) })),
    blocks: blocks.map((b) => ({ start: b.start, end: b.end, project: b.project, apps: [...b.apps], activities: b.activities, seconds: Math.round(b.seconds) })),
    commits,
  };
}

// ---- settings -------------------------------------------------------------

const DEFAULTS: Omit<LocalSettings, "id"> = {
  vlmModel: "google/gemini-2.0-flash-exp:free",
  chatModel: "google/gemini-2.0-flash-exp:free",
  captureIntervalSec: 30,
  batchIntervalSec: 300,
};

export async function localGetSettings() {
  const row = await db().settings.get("singleton");
  return { ...(row ?? DEFAULTS), isDefault: !row };
}

export async function localPutSettings(body: Partial<Omit<LocalSettings, "id">>) {
  const cur = (await db().settings.get("singleton")) ?? { id: "singleton", ...DEFAULTS };
  await db().settings.put({
    id: "singleton",
    vlmModel: (body.vlmModel ?? cur.vlmModel).trim(),
    chatModel: (body.chatModel ?? cur.chatModel).trim(),
    captureIntervalSec: clampInt(body.captureIntervalSec, cur.captureIntervalSec, 5, 600),
    batchIntervalSec: clampInt(body.batchIntervalSec, cur.batchIntervalSec, 30, 3600),
  });
  return { ok: true };
}

// ---- maintenance: export / import / clear / usage -------------------------

export async function localExport(): Promise<string> {
  const [sessions, commits, settings] = await Promise.all([
    db().sessions.toArray(),
    db().commits.toArray(),
    db().settings.toArray(),
  ]);
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), sessions, commits, settings }, null, 2);
}

export async function localImport(json: string): Promise<{ sessions: number; commits: number }> {
  const data = JSON.parse(json) as { sessions?: LocalSession[]; commits?: LocalCommit[]; settings?: LocalSettings[] };
  await db().transaction("rw", db().sessions, db().commits, db().settings, async () => {
    if (data.sessions?.length) await db().sessions.bulkPut(data.sessions);
    if (data.commits?.length) await db().commits.bulkPut(data.commits);
    if (data.settings?.length) await db().settings.bulkPut(data.settings);
  });
  return { sessions: data.sessions?.length ?? 0, commits: data.commits?.length ?? 0 };
}

export async function localClear(): Promise<void> {
  await db().transaction("rw", db().sessions, db().commits, async () => {
    await db().sessions.clear();
    await db().commits.clear();
  });
}

export async function localUsage(): Promise<{ sessions: number; commits: number; estBytes: number }> {
  const [sessions, commits] = await Promise.all([db().sessions.count(), db().commits.count()]);
  let estBytes = 0;
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    estBytes = est.usage ?? 0;
  }
  return { sessions, commits, estBytes };
}
