"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatHm, isoDate, startOfWeek } from "@/lib/time";
import { dataGet } from "@/lib/data-client";
import { isLocalMode } from "@/lib/storage-mode";
import { localExportCsv } from "@/lib/csv";

interface Row { key: string; seconds: number; focusAvg: number; entries: number; }
type GroupBy = "project" | "app" | "day";

export default function Timesheet() {
  const today = useMemo(() => isoDate(new Date()), []);
  const weekStart = useMemo(() => isoDate(startOfWeek()), []);
  const [from, setFrom] = useState(weekStart);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await dataGet<{ rows: Row[] }>("timesheet", {
      from: new Date(from + "T00:00:00").toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
      groupBy,
    });
    setRows(data.rows ?? []);
    setLoading(false);
  }, [from, to, groupBy]);

  useEffect(() => { void load(); }, [load]);

  const total = rows.reduce((a, r) => a + r.seconds, 0);
  const exportParams = new URLSearchParams({
    from: new Date(from + "T00:00:00").toISOString(),
    to: new Date(to + "T23:59:59").toISOString(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Timesheet</h1>
        <p className="text-sm text-muted-foreground">Aggregate tracked time across projects, apps, or days.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label>Group by</Label>
              <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <TabsList>
                  <TabsTrigger value="project">Project</TabsTrigger>
                  <TabsTrigger value="app">App</TabsTrigger>
                  <TabsTrigger value="day">Day</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex-1" />
            {isLocalMode() ? (
              <Button
                variant="secondary"
                onClick={() =>
                  localExportCsv(
                    new Date(from + "T00:00:00").toISOString(),
                    new Date(to + "T23:59:59").toISOString(),
                  )
                }
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <a href={`/api/export/csv?${exportParams}`}>
                  <Download className="h-4 w-4" /> CSV
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{rows.length} row{rows.length === 1 ? "" : "s"}</span>
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              Total: <span className="text-foreground font-medium">{formatHm(total)}</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No entries in range.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labelFor(groupBy)}</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Focus</TableHead>
                  <TableHead className="text-right w-28">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const pct = total > 0 ? (r.seconds / total) * 100 : 0;
                  return (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.key}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatHm(r.seconds)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.entries}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.focusAvg * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <style>{`
        @media print {
          aside, header.sticky, button, .no-print { display: none !important; }
          body { background: white; color: black; }
          [class*="bg-card"], [class*="border"] { background: white !important; border-color: #ddd !important; }
        }
      `}</style>
    </div>
  );
}

function labelFor(g: GroupBy) {
  return g === "project" ? "Project" : g === "app" ? "App" : "Day";
}
