"use client";

import { createAuthClient } from "@neondatabase/neon-js/auth";

// The client must hit OUR /api/auth proxy so cookies land on our origin.
// Better Auth rejects relative URLs at module init, so we build an absolute
// one from window.location.origin. On the server (SSR / build) `window` is
// undefined; we use a localhost placeholder there — the client is never
// actually invoked server-side because all consumers are "use client".
const origin =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

export const authClient = createAuthClient(`${origin}/api/auth`);
