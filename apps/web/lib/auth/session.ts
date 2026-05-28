import "server-only";
import { cookies } from "next/headers";
import { auth } from "./server";
import { STORAGE_MODE_COOKIE } from "@/lib/storage-mode";

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

/**
 * For protected PAGES: in local-only mode there's no account, so return a
 * synthetic local user instead of requiring a Neon Auth session. Otherwise
 * defer to the real session.
 */
export async function requirePageUser(): Promise<SessionUser | null> {
  const store = await cookies();
  if (store.get(STORAGE_MODE_COOKIE)?.value === "local") {
    return { id: "local", email: "Local device" };
  }
  return requireUser();
}
