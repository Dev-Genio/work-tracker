"use client";

import { isLocalMode } from "@/lib/storage-mode";
import * as local from "@/lib/db-local";

// Routes data access to either the server API (cloud mode) or the local
// IndexedDB layer (local mode). Both return identical JSON shapes, so callers
// don't care which backend is active.

type Resource =
  | "summaries"
  | "commits"
  | "timesheet"
  | "heatmap"
  | "projects"
  | "rag/search"
  | "rag/day";

const LOCAL_HANDLERS: Record<Resource, (p: URLSearchParams) => Promise<unknown>> = {
  summaries: local.localSummaries,
  commits: local.localCommits,
  timesheet: local.localTimesheet,
  heatmap: local.localHeatmap,
  projects: local.localProjects,
  "rag/search": local.localRagSearch,
  "rag/day": local.localRagDay,
};

/** GET a data resource with query params, from API or IndexedDB. */
export async function dataGet<T = unknown>(
  resource: Resource,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) sp.set(k, String(v));

  if (isLocalMode()) {
    return (await LOCAL_HANDLERS[resource](sp)) as T;
  }
  const res = await fetch(`/api/${resource}?${sp.toString()}`);
  if (!res.ok) throw new Error(`${resource}: ${res.status}`);
  return (await res.json()) as T;
}

/** Persist a captured batch. rawJson is forwarded to the cloud API only. */
export async function dataIngest(
  body: Parameters<typeof local.localIngest>[0] & { rawJson?: unknown },
): Promise<void> {
  if (isLocalMode()) {
    await local.localIngest(body);
    return;
  }
  const res = await fetch("/api/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ingest: ${res.status}`);
}

export interface ClientSettings {
  vlmModel: string;
  chatModel: string;
  captureIntervalSec: number;
  batchIntervalSec: number;
}

export async function dataGetSettings(): Promise<ClientSettings & { isDefault?: boolean }> {
  if (isLocalMode()) return local.localGetSettings();
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`settings: ${res.status}`);
  return res.json();
}

export async function dataPutSettings(body: Partial<ClientSettings>): Promise<void> {
  if (isLocalMode()) {
    await local.localPutSettings(body);
    return;
  }
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`settings: ${res.status}`);
}
