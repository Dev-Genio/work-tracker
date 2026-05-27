import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { parseRange } from "@/lib/time";

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const q = (url.searchParams.get("q") ?? "").trim();
  const app = url.searchParams.get("app");
  const project = url.searchParams.get("project");
  const limit = clamp(Number(url.searchParams.get("limit") ?? 20), 1, 100);
  const userId = user.id;

  const conds = [
    eq(schema.vlmSummaries.userId, userId),
    gte(schema.captureBatches.startedAt, from),
    lte(schema.captureBatches.startedAt, to),
  ];
  if (q) {
    const like = `%${q}%`;
    conds.push(
      or(
        ilike(schema.vlmSummaries.activity, like),
        ilike(schema.vlmSummaries.app, like),
        ilike(schema.vlmSummaries.projectGuess, like),
        sql`${schema.vlmSummaries.tasks}::text ilike ${like}`,
      )!,
    );
  }
  if (app) conds.push(ilike(schema.vlmSummaries.app, `%${app}%`));
  if (project) conds.push(ilike(schema.vlmSummaries.projectGuess, `%${project}%`));

  const rows = await db
    .select({
      id: schema.vlmSummaries.id,
      startedAt: schema.captureBatches.startedAt,
      endedAt: schema.captureBatches.endedAt,
      activity: schema.vlmSummaries.activity,
      app: schema.vlmSummaries.app,
      projectGuess: schema.vlmSummaries.projectGuess,
      tasks: schema.vlmSummaries.tasks,
      focusScore: schema.vlmSummaries.focusScore,
    })
    .from(schema.vlmSummaries)
    .innerJoin(schema.captureBatches, eq(schema.vlmSummaries.batchId, schema.captureBatches.id))
    .where(and(...conds))
    .orderBy(desc(schema.captureBatches.startedAt))
    .limit(limit);

  return NextResponse.json({ results: rows });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

// Silence unused imports if Drizzle inlines them in future revisions.
void asc;
