import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { DEFAULT_SETTINGS } from "@/lib/settings-store";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const userId = user.id;
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  if (row.length === 0) {
    return NextResponse.json({ ...DEFAULT_SETTINGS, isDefault: true });
  }

  const r = row[0];
  return NextResponse.json({
    vlmModel: r.vlmModel,
    chatModel: r.chatModel,
    captureIntervalSec: r.captureIntervalSec,
    batchIntervalSec: r.batchIntervalSec,
    isDefault: false,
  });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Partial<{
    vlmModel: string;
    chatModel: string;
    captureIntervalSec: number;
    batchIntervalSec: number;
  }>;

  const capture = clamp(body.captureIntervalSec ?? DEFAULT_SETTINGS.captureIntervalSec, 5, 600);
  const batch = clamp(body.batchIntervalSec ?? DEFAULT_SETTINGS.batchIntervalSec, 30, 3600);
  const vlmModel = (body.vlmModel ?? DEFAULT_SETTINGS.vlmModel).trim();
  const chatModel = (body.chatModel ?? vlmModel).trim();
  if (!vlmModel || !chatModel) {
    return NextResponse.json({ error: "vlmModel and chatModel required" }, { status: 400 });
  }

  const userId = user.id;
  await db
    .insert(schema.settings)
    .values({
      userId,
      vlmModel,
      chatModel,
      captureIntervalSec: capture,
      batchIntervalSec: batch,
    })
    .onConflictDoUpdate({
      target: schema.settings.userId,
      set: {
        vlmModel,
        chatModel,
        captureIntervalSec: capture,
        batchIntervalSec: batch,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
