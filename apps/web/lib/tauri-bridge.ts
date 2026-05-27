"use client";

import type {
  GhCommit,
  GhTodayResult,
  ProcessInfo,
  SystemStats,
} from "@work-tracker/shared";
import { isTauri } from "@work-tracker/shared";

// Lazy-load the Tauri API so the bundle still works in the browser.
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("not in tauri");
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);
}

export async function listProcesses(top = 25): Promise<ProcessInfo[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<ProcessInfo[]>("list_processes", { top });
  } catch {
    return [];
  }
}

export async function systemStats(): Promise<SystemStats | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<SystemStats>("system_stats");
  } catch {
    return null;
  }
}

export async function isAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("autostart_status");
  } catch {
    return false;
  }
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke<void>("set_autostart", { enabled });
}

export async function onTrayToggle(cb: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const mod = await import("@tauri-apps/api/event");
  const unlisten = await mod.listen("tray:toggle-tracking", () => cb());
  return unlisten;
}

/** Detailed result so callers can surface verbose error info to the user. */
export async function ghTodayDetailed(since?: string): Promise<GhTodayResult> {
  if (!isTauri()) return { commits: [], warnings: [] };
  try {
    return await invoke<GhTodayResult>("gh_today_commits", { since });
  } catch (e) {
    // Invoke-level failure (e.g. spawn-failed) — surface as a warning.
    return { commits: [], warnings: [String(e)] };
  }
}

/** Convenience wrapper for callers that just want the commit list. */
export async function ghTodayCommits(since?: string): Promise<GhCommit[]> {
  const r = await ghTodayDetailed(since);
  return r.commits;
}

/** Output of `gh auth status` for diagnostics in Settings. */
export async function ghAuthStatus(): Promise<string> {
  if (!isTauri()) return "Not running in Tauri — gh diagnostics unavailable.";
  return invoke<string>("gh_auth_status");
}
