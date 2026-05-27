"use client";

import type { GhCommit, ProcessInfo, SystemStats } from "@work-tracker/shared";
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

export async function ghTodayCommits(since?: string): Promise<GhCommit[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<GhCommit[]>("gh_today_commits", { since });
  } catch {
    // Likely: gh not installed, not logged in, or no network. Treat as empty.
    return [];
  }
}
