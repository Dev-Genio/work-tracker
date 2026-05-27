import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy so a missing NEON_DATABASE_URL fails at runtime, not build time.
function makeDb() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

type DB = ReturnType<typeof makeDb>;
let _db: DB | null = null;
export const db = new Proxy({} as DB, {
  get(_t, prop) {
    if (!_db) _db = makeDb();
    return (_db as unknown as Record<string | symbol, unknown>)[prop];
  },
});
export { schema };
