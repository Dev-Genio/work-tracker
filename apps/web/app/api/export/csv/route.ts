import { and, asc, eq, gte, lte } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";
import { parseRange, isoDate, formatHm } from "@/lib/time";

export async function GET(req: Request) {
  const session = await auth.getSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const userId = session.user.id;

  const rows = await db
    .select({
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
    .where(
      and(
        eq(schema.vlmSummaries.userId, userId),
        gte(schema.captureBatches.startedAt, from),
        lte(schema.captureBatches.startedAt, to),
      ),
    )
    .orderBy(asc(schema.captureBatches.startedAt));

  const header = [
    "date",
    "start",
    "end",
    "duration",
    "project",
    "app",
    "activity",
    "tasks",
    "focus",
  ];
  const lines: string[] = [header.join(",")];
  for (const r of rows) {
    const start = r.startedAt as Date;
    const end = r.endedAt as Date;
    const dur = Math.max(0, (end.getTime() - start.getTime()) / 1000);
    const tasks = Array.isArray(r.tasks) ? (r.tasks as string[]).join("; ") : "";
    lines.push(
      [
        isoDate(start),
        start.toISOString(),
        end.toISOString(),
        formatHm(dur),
        r.projectGuess ?? "",
        r.app ?? "",
        r.activity,
        tasks,
        r.focusScore.toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="work-tracker-${isoDate(from)}_${isoDate(to)}.csv"`,
    },
  });
}

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
