import { NextResponse } from "next/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { parseRange } from "@/lib/time";

/**
 * Per-day activity totals over a range: tracked seconds (from capture
 * batches) and commit counts (from commits_seen). Drives the contribution
 * heatmap + daily-totals chart on the dashboard.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const userId = user.id;

  // Bucket days in the user's timezone (passed by the client). Without this we
  // group by the server's tz (UTC on Vercel), so near local midnight a session
  // lands on the "wrong" day cell and the heatmap looks stale. Falls back to
  // UTC if not supplied. Validated to a conservative IANA-ish charset.
  const tzRaw = url.searchParams.get("tz") ?? "UTC";
  const tz = /^[A-Za-z0-9_+\-/]{1,64}$/.test(tzRaw) ? tzRaw : "UTC";

  const [trackRows, commitRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${schema.captureBatches.startedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
        seconds: sql<number>`coalesce(extract(epoch from sum(${schema.captureBatches.endedAt} - ${schema.captureBatches.startedAt})), 0)`,
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
      // Group by the first select column (the day expression). Referencing
      // the expression directly would re-bind ${tz} as a separate param, which
      // Postgres treats as a different expression.
      .groupBy(sql`1`),
    db
      .select({
        day: sql<string>`to_char(${schema.commitsSeen.committedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
        commits: sql<number>`count(*)::int`,
      })
      .from(schema.commitsSeen)
      .where(
        and(
          eq(schema.commitsSeen.userId, userId),
          gte(schema.commitsSeen.committedAt, from),
          lte(schema.commitsSeen.committedAt, to),
        ),
      )
      .groupBy(sql`1`),
  ]);

  const byDay = new Map<string, { seconds: number; commits: number }>();
  for (const r of trackRows) {
    const e = byDay.get(r.day) ?? { seconds: 0, commits: 0 };
    e.seconds = Number(r.seconds ?? 0);
    byDay.set(r.day, e);
  }
  for (const r of commitRows) {
    const e = byDay.get(r.day) ?? { seconds: 0, commits: 0 };
    e.commits = Number(r.commits ?? 0);
    byDay.set(r.day, e);
  }

  const days = [...byDay.entries()].map(([date, v]) => ({
    date,
    seconds: v.seconds,
    commits: v.commits,
  }));

  return NextResponse.json({
    days,
    from: from.toISOString(),
    to: to.toISOString(),
  });
}
