import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error("NEON_DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);
const db = drizzle(sql);

await sql`CREATE EXTENSION IF NOT EXISTS vector`;
await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("migrations applied");
