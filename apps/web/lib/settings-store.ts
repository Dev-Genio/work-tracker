"use client";

// The OpenRouter API key lives ONLY in the client (localStorage on web,
// Tauri webview localStorage on desktop). It is never sent to our server.

const KEY = "wt.openrouter.key";

export function getOpenRouterKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setOpenRouterKey(value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, value);
}

export function clearOpenRouterKey(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export interface ServerSettings {
  vlmModel: string;
  chatModel: string;
  captureIntervalSec: number;
  batchIntervalSec: number;
}

export const DEFAULT_SETTINGS: ServerSettings = {
  vlmModel: "google/gemini-2.0-flash-exp:free",
  chatModel: "google/gemini-2.0-flash-exp:free",
  captureIntervalSec: 30,
  batchIntervalSec: 300,
};
