"use client";

import { createAuthClient } from "@neondatabase/neon-js/auth";

const url = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
if (!url) {
  // Surface misconfig early in dev rather than at first auth call.
  // eslint-disable-next-line no-console
  console.warn("NEXT_PUBLIC_NEON_AUTH_URL is not set");
}

export const authClient = createAuthClient(url ?? "");
