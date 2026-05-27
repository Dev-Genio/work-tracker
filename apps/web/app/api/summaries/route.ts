import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { parseRange } from "@/lib/time";

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const userId = user.id;

  const rows = await db
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
    .innerJoin(schema.captureBatches, eq(schema.vlmSummaries.batchId, schema.captureBatches.id))
    .where(
      and(
        eq(schema.vlmSummaries.userId, userId),
        gte(schema.captureBatches.startedAt, from),
        lte(schema.captureBatches.startedAt, to),
      ),
    )
    .orderBy(asc(schema.captureBatches.startedAt));

  return NextResponse.json({ summaries: rows });
}
