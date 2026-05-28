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

// ---- LLM provider (device-local) -----------------------------------------

export type LlmProvider = "openrouter" | "lmstudio";

const PROVIDER_KEY = "wt.llm.provider";
const LMSTUDIO_URL_KEY = "wt.lmstudio.url";
export const DEFAULT_LMSTUDIO_URL = "http://localhost:1234/v1";

export function getProvider(): LlmProvider {
  if (typeof window === "undefined") return "openrouter";
  const v = window.localStorage.getItem(PROVIDER_KEY);
  return v === "lmstudio" ? "lmstudio" : "openrouter";
}
export function setProvider(p: LlmProvider): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROVIDER_KEY, p);
}

export function getLmStudioUrl(): string {
  if (typeof window === "undefined") return DEFAULT_LMSTUDIO_URL;
  return window.localStorage.getItem(LMSTUDIO_URL_KEY) || DEFAULT_LMSTUDIO_URL;
}
export function setLmStudioUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LMSTUDIO_URL_KEY, url.trim().replace(/\/+$/, ""));
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
