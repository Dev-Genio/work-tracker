import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";

interface IngestBody {
  runtime: "tauri" | "browser";
  startedAt: string;
  endedAt: string;
  frames: { takenAt: string; jpegBase64: string }[];
  processes?: unknown;
  system?: unknown;
  commits?: {
    repo: string;
    sha: string;
    message: string;
    committedAt: string;
  }[];
  model: string;
  summary: {
    activity: string;
    app: string | null;
    projectGuess: string | null;
    tasks: string[];
    focusScore: number;
  };
  rawJson?: unknown;
}

export async function POST(req: Request) {
  const session = await auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.startedAt || !body.endedAt || !Array.isArray(body.frames) || !body.summary) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const userId = session.user.id;

  const [batch] = await db
    .insert(schema.captureBatches)
    .values({
      userId,
      startedAt: new Date(body.startedAt),
      endedAt: new Date(body.endedAt),
      runtime: body.runtime,
      processes: body.processes ?? null,
      system: body.system ?? null,
    })
    .returning({ id: schema.captureBatches.id });

  if (body.frames.length > 0) {
    await db.insert(schema.captureEvents).values(
      body.frames.map((f) => ({
        batchId: batch.id,
        takenAt: new Date(f.takenAt),
        jpegBase64: f.jpegBase64,
      })),
    );
  }

  await db.insert(schema.vlmSummaries).values({
    batchId: batch.id,
    userId,
    activity: body.summary.activity,
    app: body.summary.app,
    projectGuess: body.summary.projectGuess,
    tasks: body.summary.tasks,
    focusScore: body.summary.focusScore,
    model: body.model,
    rawJson: body.rawJson ?? null,
  });

  if (body.commits && body.commits.length > 0) {
    // Dedup against commits_seen so the same sha doesn't bind to multiple batches.
    await db
      .insert(schema.commitsSeen)
      .values(
        body.commits.map((c) => ({
          userId,
          repo: c.repo,
          sha: c.sha,
          message: c.message,
          committedAt: new Date(c.committedAt),
          batchId: batch.id,
        })),
      )
      .onConflictDoNothing({
        target: [schema.commitsSeen.userId, schema.commitsSeen.repo, schema.commitsSeen.sha],
      });
  }

  return NextResponse.json({ ok: true, batchId: batch.id });
}

// Keep the route handler away from edge — base64 payloads are heavy.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Silence unused-import warning in case sql helper is removed later.
void sql;
