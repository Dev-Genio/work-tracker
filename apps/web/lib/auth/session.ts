import "server-only";
import { auth } from "./server";

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Unwraps Neon Auth's `Data<>`-shaped getSession() response into a plain user
 * object (or null). Centralized here so route handlers stay tidy.
 */
export async function requireUser(): Promise<SessionUser | null> {
  const result = (await auth.getSession()) as unknown;
  if (!result || typeof result !== "object") return null;

  // Possible shapes: { data: { user } } | { user } | null
  const r = result as Record<string, unknown>;
  const data = (r.data ?? r) as Record<string, unknown>;
  const user = data?.user as Record<string, unknown> | undefined;
  if (!user || typeof user.id !== "string") return null;

  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : undefined,
    name: typeof user.name === "string" ? user.name : undefined,
  };
}
