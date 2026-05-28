"use client";

import { db } from "@/lib/db-local";
import { formatHm } from "@/lib/time";

function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Builds and downloads a CSV of local sessions in range — mirrors the
 *  server /api/export/csv output for cloud mode. */
export async function localExportCsv(fromIso: string, toIso: string): Promise<void> {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const rows = (await db().sessions.where("startedAtMs").between(fromMs, toMs, true, true).toArray()).sort(
    (a, b) => a.startedAtMs - b.startedAtMs,
  );

  const header = ["date", "start", "end", "duration", "project", "app", "activity", "tasks", "focus"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const dur = Math.max(0, (new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 1000);
    lines.push(
      [
        isoDate(new Date(r.startedAt)),
        r.startedAt,
        r.endedAt,
        formatHm(dur),
        r.projectGuess ?? "",
        r.app ?? "",
        r.activity,
        (r.tasks ?? []).join("; "),
        r.focusScore.toFixed(2),
      ]
        .map(cell)
        .join(","),
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `work-tracker-${isoDate(new Date(fromIso))}_${isoDate(new Date(toIso))}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
