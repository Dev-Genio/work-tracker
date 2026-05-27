import { NextResponse } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";
import { parseRange } from "@/lib/time";

export async function GET(req: Request) {
  const session = await auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = parseRange(url.searchParams);
  const userId = session.user.id;

  const rows = await db
    .select()
    .from(schema.commitsSeen)
    .where(
      and(
        eq(schema.commitsSeen.userId, userId),
        gte(schema.commitsSeen.committedAt, from),
        lte(schema.commitsSeen.committedAt, to),
      ),
    )
    .orderBy(desc(schema.commitsSeen.committedAt));

  return NextResponse.json({ commits: rows });
}
