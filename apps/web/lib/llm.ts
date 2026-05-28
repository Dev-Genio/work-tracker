"use client";

import {
  getLmStudioUrl,
  getOpenRouterKey,
  getProvider,
  type LlmProvider,
} from "@/lib/settings-store";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export interface LlmTarget {
  provider: LlmProvider;
  baseUrl: string; // includes /v1
  apiKey: string | null; // null for unauthenticated LM Studio
}

/** Resolve the active provider + endpoint from device-local settings. */
export function resolveTarget(): LlmTarget {
  const provider = getProvider();
  if (provider === "lmstudio") {
    return { provider, baseUrl: getLmStudioUrl(), apiKey: null };
  }
  return { provider: "openrouter", baseUrl: OPENROUTER_BASE, apiKey: getOpenRouterKey() };
}

function headers(target: LlmTarget): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (target.apiKey) h.Authorization = `Bearer ${target.apiKey}`;
  if (target.provider === "openrouter") {
    h["HTTP-Referer"] = typeof window !== "undefined" ? window.location.origin : "";
    h["X-Title"] = "work-tracker";
  }
  return h;
}

export type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

export interface JsonSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface ChatOptions {
  target?: LlmTarget;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Request JSON output. On OpenRouter we use response_format json_object;
   *  on LM Studio (which rejects json_object) we use json_schema when a
   *  schema is supplied. */
  jsonObject?: boolean;
  /** JSON schema for structured output — used by LM Studio (and any provider
   *  that prefers schema-constrained output). */
  jsonSchema?: JsonSchema;
}

/** OpenAI-compatible chat completion. Works for both OpenRouter and LM Studio
 *  (/v1/chat/completions). Returns the assistant message string. */
export async function chatCompletion(opts: ChatOptions): Promise<string> {
  const target = opts.target ?? resolveTarget();
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
  };
  // OpenRouter supports response_format: json_object (broad model support).
  // LM Studio rejects json_object but supports json_schema, so we send the
  // schema there to get structured output (needed for VLM tracking).
  if (target.provider === "openrouter") {
    if (opts.jsonObject) body.response_format = { type: "json_object" };
  } else if (opts.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: opts.jsonSchema.name,
        strict: opts.jsonSchema.strict ?? false,
        schema: opts.jsonSchema.schema,
      },
    };
  }

  const res = await fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(target),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${target.provider} ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

export interface ProviderModel {
  id: string;
  name: string;
  vision: boolean;
  free: boolean;
}

/** List models for the active (or given) provider. */
export async function listModels(target?: LlmTarget): Promise<ProviderModel[]> {
  const t = target ?? resolveTarget();
  const res = await fetch(`${t.baseUrl}/models`, { headers: headers(t) });
  if (!res.ok) throw new Error(`${t.provider} ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: unknown[] };
  const data = json.data ?? [];

  if (t.provider === "openrouter") {
    return (data as Array<{
      id: string;
      name?: string;
      architecture?: { input_modalities?: string[] };
      pricing?: { prompt?: string; completion?: string };
    }>).map((m) => {
      const free = m.id.endsWith(":free") || (m.pricing?.prompt === "0" && m.pricing?.completion === "0");
      const vision = (m.architecture?.input_modalities ?? []).includes("image");
      return { id: m.id, name: m.name ?? m.id, vision, free };
    });
  }

  // LM Studio: minimal OpenAI model objects. We can't reliably tell vision
  // capability from the list, so expose all; the user picks appropriately.
  return (data as Array<{ id: string }>).map((m) => ({
    id: m.id,
    name: m.id,
    vision: true,
    free: true,
  }));
}

/** Whether the active provider is configured enough to make a call. */
export function providerReady(): { ok: boolean; reason?: string } {
  const t = resolveTarget();
  if (t.provider === "openrouter" && !t.apiKey) {
    return { ok: false, reason: "Set your OpenRouter key in Settings, or switch to LM Studio." };
  }
  return { ok: true };
}

/** Quick reachability/auth check for the active provider. */
export async function pingProvider(target?: LlmTarget): Promise<boolean> {
  try {
    await listModels(target);
    return true;
  } catch {
    return false;
  }
}
