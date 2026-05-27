export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    image?: string;
  };
}

const MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function fetchModels(apiKey: string): Promise<OpenRouterModel[]> {
  const res = await fetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: OpenRouterModel[] };
  return json.data ?? [];
}

export function isFree(m: OpenRouterModel): boolean {
  if (m.id.endsWith(":free")) return true;
  const p = m.pricing;
  return !!p && p.prompt === "0" && p.completion === "0";
}

export function isVision(m: OpenRouterModel): boolean {
  const mods = m.architecture?.input_modalities ?? [];
  return mods.includes("image");
}

export async function fetchFreeVisionModels(
  apiKey: string,
): Promise<OpenRouterModel[]> {
  const all = await fetchModels(apiKey);
  return all
    .filter((m) => isFree(m) && isVision(m))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchFreeChatModels(
  apiKey: string,
): Promise<OpenRouterModel[]> {
  const all = await fetchModels(apiKey);
  return all
    .filter((m) => isFree(m))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function validateKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
