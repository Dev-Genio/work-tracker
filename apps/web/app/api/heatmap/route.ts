import { NextResponse } from "next/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { parseRange } from "@/lib/time";

/**
 * Per-day activity totals (in seconds + session counts) over a range.
 * Used to draw the GitHub-style contribution heatmap and a daily-totals
 * line chart on the dashboard.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const userId = user.id;

  // Aggregate at the user's local-day granularity. We use the server's TZ
  // here for simplicity; for a more polished UX we'd pass a tz param.
  const rows = await db
    .select({
      day: sql<string>`to_char(${schema.captureBatches.startedAt}, 'YYYY-MM-DD')`,
      seconds: sql<number>`coalesce(extract(epoch from sum(${schema.captureBatches.endedAt} - ${schema.captureBatches.startedAt})), 0)`,
      sessions: sql<number>`count(*)::int`,
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
    .groupBy(sql`to_char(${schema.captureBatches.startedAt}, 'YYYY-MM-DD')`);

  return NextResponse.json({
    days: rows.map((r) => ({
      date: r.day,
      seconds: Number(r.seconds ?? 0),
      sessions: Number(r.sessions ?? 0),
    })),
    from: from.toISOString(),
    to: to.toISOString(),
  });
}
