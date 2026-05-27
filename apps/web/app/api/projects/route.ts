import { NextResponse } from "next/server";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { parseRange } from "@/lib/time";

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);

  const rows = await db
    .select({
      project: schema.vlmSummaries.projectGuess,
      seconds: sql<number>`extract(epoch from sum(${schema.captureBatches.endedAt} - ${schema.captureBatches.startedAt}))`,
    })
    .from(schema.vlmSummaries)
    .innerJoin(
      schema.captureBatches,
      eq(schema.vlmSummaries.batchId, schema.captureBatches.id),
    )
    .where(
      and(
        eq(schema.vlmSummaries.userId, user.id),
        isNotNull(schema.vlmSummaries.projectGuess),
        gte(schema.captureBatches.startedAt, from),
        lte(schema.captureBatches.startedAt, to),
      ),
    )
    .groupBy(schema.vlmSummaries.projectGuess);

  const projects = rows
    .filter((r) => r.project)
    .map((r) => ({ project: r.project as string, seconds: Number(r.seconds ?? 0) }))
    .sort((a, b) => b.seconds - a.seconds);

  return NextResponse.json({ projects });
}
