import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { parseRange } from "@/lib/time";

/**
 * Complete, condensed digest of a day (or small range) in ONE response — so
 * the agent never has to page through hundreds of ~1-minute sessions. Returns
 * totals, project/app breakdowns, merged activity blocks, and commits.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const userId = user.id;

  const rows = await db
    .select({
      startedAt: schema.captureBatches.startedAt,
      endedAt: schema.captureBatches.endedAt,
      activity: schema.vlmSummaries.activity,
      app: schema.vlmSummaries.app,
      projectGuess: schema.vlmSummaries.projectGuess,
      focusScore: schema.vlmSummaries.focusScore,
    })
    .from(schema.vlmSummaries)
    .innerJoin(
      schema.captureBatches,
      eq(schema.vlmSummaries.batchId, schema.captureBatches.id),
    )
    .where(
      and(
        eq(schema.vlmSummaries.userId, userId),
        gte(schema.captureBatches.startedAt, from),
        lte(schema.captureBatches.startedAt, to),
      ),
    )
    .orderBy(asc(schema.captureBatches.startedAt));

  const commits = await db
    .select({
      repo: schema.commitsSeen.repo,
      sha: schema.commitsSeen.sha,
      message: schema.commitsSeen.message,
      additions: schema.commitsSeen.additions,
      deletions: schema.commitsSeen.deletions,
      committedAt: schema.commitsSeen.committedAt,
    })
    .from(schema.commitsSeen)
    .where(
      and(
        eq(schema.commitsSeen.userId, userId),
        gte(schema.commitsSeen.committedAt, from),
        lte(schema.commitsSeen.committedAt, to),
      ),
    )
    .orderBy(desc(schema.commitsSeen.committedAt));

  // Totals + breakdowns
  let totalSeconds = 0;
  let focusSum = 0;
  const byProject = new Map<string, number>();
  const byApp = new Map<string, number>();
  for (const r of rows) {
    const d = Math.max(0, ((r.endedAt as Date).getTime() - (r.startedAt as Date).getTime()) / 1000);
    totalSeconds += d;
    focusSum += r.focusScore;
    byProject.set(r.projectGuess ?? "(unknown)", (byProject.get(r.projectGuess ?? "(unknown)") ?? 0) + d);
    byApp.set(r.app ?? "(unknown)", (byApp.get(r.app ?? "(unknown)") ?? 0) + d);
  }

  // Merge consecutive sessions into blocks: same project AND <10min gap.
  const GAP_MS = 10 * 60 * 1000;
  interface Block {
    start: string;
    end: string;
    project: string | null;
    apps: Set<string>;
    activities: string[];
    seconds: number;
  }
  const blocks: Block[] = [];
  for (const r of rows) {
    const start = r.startedAt as Date;
    const end = r.endedAt as Date;
    const last = blocks[blocks.length - 1];
    const sameProject = last && last.project === (r.projectGuess ?? null);
    const closeInTime = last && start.getTime() - new Date(last.end).getTime() <= GAP_MS;
    if (last && sameProject && closeInTime) {
      last.end = end.toISOString();
      last.seconds += Math.max(0, (end.getTime() - start.getTime()) / 1000);
      if (r.app) last.apps.add(r.app);
      if (r.activity && !last.activities.includes(r.activity)) {
        if (last.activities.length < 6) last.activities.push(r.activity);
      }
    } else {
      blocks.push({
        start: start.toISOString(),
        end: end.toISOString(),
        project: r.projectGuess ?? null,
        apps: new Set(r.app ? [r.app] : []),
        activities: r.activity ? [r.activity] : [],
        seconds: Math.max(0, (end.getTime() - start.getTime()) / 1000),
      });
    }
  }

  return NextResponse.json({
    totalSeconds: Math.round(totalSeconds),
    focusAvg: rows.length > 0 ? focusSum / rows.length : 0,
    sessions: rows.length,
    byProject: [...byProject.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, seconds]) => ({ key, seconds: Math.round(seconds) })),
    byApp: [...byApp.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, seconds]) => ({ key, seconds: Math.round(seconds) })),
    blocks: blocks.map((b) => ({
      start: b.start,
      end: b.end,
      project: b.project,
      apps: [...b.apps],
      activities: b.activities,
      seconds: Math.round(b.seconds),
    })),
    commits,
  });
}
