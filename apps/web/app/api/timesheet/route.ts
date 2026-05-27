import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { parseRange, isoDate } from "@/lib/time";

type GroupBy = "project" | "app" | "day";

export interface TimesheetRow {
  key: string;
  seconds: number;
  focusAvg: number;
  entries: number;
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const groupBy = (url.searchParams.get("groupBy") ?? "project") as GroupBy;
  const userId = user.id;

  const rows = await db
    .select({
      startedAt: schema.captureBatches.startedAt,
      endedAt: schema.captureBatches.endedAt,
      app: schema.vlmSummaries.app,
      projectGuess: schema.vlmSummaries.projectGuess,
      focusScore: schema.vlmSummaries.focusScore,
    })
    .from(schema.vlmSummaries)
    .innerJoin(schema.captureBatches, eq(schema.vlmSummaries.batchId, schema.captureBatches.id))
    .where(
      and(
        eq(schema.vlmSummaries.userId, userId),
        gte(schema.captureBatches.startedAt, from),
        lte(schema.captureBatches.startedAt, to),
      ),
    )
    .orderBy(asc(schema.captureBatches.startedAt));

  const buckets = new Map<string, { seconds: number; focusSum: number; entries: number }>();
  for (const r of rows) {
    const key =
      groupBy === "project"
        ? r.projectGuess ?? "(unknown project)"
        : groupBy === "app"
          ? r.app ?? "(unknown app)"
          : isoDate(r.startedAt as Date);
    const dur =
      ((r.endedAt as Date).getTime() - (r.startedAt as Date).getTime()) / 1000;
    const b = buckets.get(key) ?? { seconds: 0, focusSum: 0, entries: 0 };
    b.seconds += Math.max(0, dur);
    b.focusSum += r.focusScore;
    b.entries += 1;
    buckets.set(key, b);
  }

  const out: TimesheetRow[] = [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      seconds: Math.round(b.seconds),
      focusAvg: b.entries > 0 ? b.focusSum / b.entries : 0,
      entries: b.entries,
    }))
    .sort((a, b) =>
      groupBy === "day" ? a.key.localeCompare(b.key) : b.seconds - a.seconds,
    );

  return NextResponse.json({ rows: out, groupBy, from, to });
}
