import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

// Lazy singleton so a missing env doesn't crash the build — only runtime calls.
let _auth: ReturnType<typeof createNeonAuth> | null = null;

function getAuth(): ReturnType<typeof createNeonAuth> {
  if (_auth) return _auth;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl) throw new Error("NEON_AUTH_BASE_URL is not set");
  if (!cookieSecret) throw new Error("NEON_AUTH_COOKIE_SECRET is not set");
  _auth = createNeonAuth({ baseUrl, cookies: { secret: cookieSecret } });
  return _auth;
}

// Proxy so existing call sites (`auth.getSession()`, `auth.handler()`) keep working.
export const auth = new Proxy({} as ReturnType<typeof createNeonAuth>, {
  get(_t, prop) {
    const a = getAuth() as unknown as Record<string | symbol, unknown>;
    return a[prop];
  },
});
