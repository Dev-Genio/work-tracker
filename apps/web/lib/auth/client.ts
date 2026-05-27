"use client";

import { createAuthClient } from "@neondatabase/neon-js/auth";

// Important: the client must hit OUR /api/auth proxy (not the Neon Auth
// domain directly), so the Set-Cookie response lands on our origin where
// the server-side auth.getSession() can read it. Hitting Neon Auth directly
// sets cookies on a different domain and they never reach our backend.
const baseUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/auth`
    : "/api/auth";

export const authClient = createAuthClient(baseUrl);
