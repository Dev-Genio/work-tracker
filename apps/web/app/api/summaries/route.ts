import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { parseRange } from "@/lib/time";

function clampInt(v: string | null, def: number, lo: number, hi: number): number {
  const n = v === null ? def : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const limit = clampInt(url.searchParams.get("limit"), 1000, 1, 1000);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100_000);
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";
  const userId = user.id;

  const where = and(
    eq(schema.vlmSummaries.userId, userId),
    gte(schema.captureBatches.startedAt, from),
    lte(schema.captureBatches.startedAt, to),
  );

  const [rows, totalRow, aggRow] = await Promise.all([
    db
      .select({
        id: schema.vlmSummaries.id,
        batchId: schema.vlmSummaries.batchId,
        startedAt: schema.captureBatches.startedAt,
        endedAt: schema.captureBatches.endedAt,
        activity: schema.vlmSummaries.activity,
        app: schema.vlmSummaries.app,
        projectGuess: schema.vlmSummaries.projectGuess,
        tasks: schema.vlmSummaries.tasks,
        focusScore: schema.vlmSummaries.focusScore,
        model: schema.vlmSummaries.model,
      })
      .from(schema.vlmSummaries)
      .innerJoin(
        schema.captureBatches,
        eq(schema.vlmSummaries.batchId, schema.captureBatches.id),
      )
      .where(where)
      .orderBy(
        order === "asc"
          ? asc(schema.captureBatches.startedAt)
          : desc(schema.captureBatches.startedAt),
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.vlmSummaries)
      .innerJoin(
        schema.captureBatches,
        eq(schema.vlmSummaries.batchId, schema.captureBatches.id),
      )
      .where(where),
    // Range-wide aggregates — independent of pagination — so the dashboard
    // KPIs reflect the whole selected period, not just the current page.
    db
      .select({
        totalSeconds: sql<number>`coalesce(extract(epoch from sum(${schema.captureBatches.endedAt} - ${schema.captureBatches.startedAt})), 0)`,
        focusAvg: sql<number>`coalesce(avg(${schema.vlmSummaries.focusScore}), 0)`,
      })
      .from(schema.vlmSummaries)
      .innerJoin(
        schema.captureBatches,
        eq(schema.vlmSummaries.batchId, schema.captureBatches.id),
      )
      .where(where),
  ]);

  return NextResponse.json({
    summaries: rows,
    total: Number(totalRow[0]?.count ?? 0),
    totalSeconds: Number(aggRow[0]?.totalSeconds ?? 0),
    focusAvg: Number(aggRow[0]?.focusAvg ?? 0),
    limit,
    offset,
    order,
  });
}
