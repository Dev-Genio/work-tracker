"use client";

import { createAuthClient } from "@neondatabase/neon-js/auth";

// Important: the client must hit OUR /api/auth proxy (not the Neon Auth
// domain directly), so the Set-Cookie response lands on our origin where
// the server-side auth.getSession() can read it.

type AuthClient = ReturnType<typeof createAuthClient>;
let _client: AuthClient | null = null;

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/auth`;
  }
  // SSR placeholder — never actually used since this file is "use client",
  // but Better Auth validates the URL eagerly and rejects relative paths.
  return "http://localhost:3000/api/auth";
}

function ensure(): AuthClient {
  if (!_client) _client = createAuthClient(getBaseUrl());
  return _client;
}

// Proxy so existing `authClient.signIn.email(...)` style calls keep working,
// while construction is deferred until first access (post-hydration).
export const authClient = new Proxy({} as AuthClient, {
  get(_t, prop) {
    return (ensure() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
