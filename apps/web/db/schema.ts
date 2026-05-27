import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  uuid,
  index,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";

// pgvector custom type — dimension matches the embedding model we pick later.
// 1024 is a safe default for most OpenRouter embedding models; resize as needed.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
});

// `user_id` columns hold the Neon Auth user id (managed in the `neon_auth`
// schema). We don't mirror users locally; we just index by id.

export const settings = pgTable("settings", {
  userId: text("user_id").primaryKey(),
  vlmModel: text("vlm_model").notNull().default("google/gemini-2.0-flash-exp:free"),
  chatModel: text("chat_model").notNull().default("google/gemini-2.0-flash-exp:free"),
  captureIntervalSec: integer("capture_interval_sec").notNull().default(30),
  batchIntervalSec: integer("batch_interval_sec").notNull().default(300),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const captureBatches = pgTable(
  "capture_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    runtime: text("runtime").notNull(), // "tauri" | "browser"
    processes: jsonb("processes"),
    system: jsonb("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userTimeIdx: index("capture_batches_user_time_idx").on(t.userId, t.startedAt),
  }),
);

export const captureEvents = pgTable(
  "capture_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .references(() => captureBatches.id, { onDelete: "cascade" })
      .notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    jpegBase64: text("jpeg_base64").notNull(),
  },
  (t) => ({
    batchIdx: index("capture_events_batch_idx").on(t.batchId),
  }),
);

export const vlmSummaries = pgTable(
  "vlm_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .references(() => captureBatches.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    userId: text("user_id").notNull(),
    activity: text("activity").notNull(),
    app: text("app"),
    projectGuess: text("project_guess"),
    tasks: jsonb("tasks").notNull().default(sql`'[]'::jsonb`),
    focusScore: real("focus_score").notNull().default(0),
    model: text("model").notNull(),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("vlm_summaries_user_idx").on(t.userId, t.createdAt),
  }),
);

export const embeddings = pgTable(
  "embeddings",
  {
    summaryId: uuid("summary_id")
      .references(() => vlmSummaries.id, { onDelete: "cascade" })
      .primaryKey(),
    userId: text("user_id").notNull(),
    embedding: vector("embedding").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("embeddings_user_idx").on(t.userId),
  }),
);

export const commitsSeen = pgTable(
  "commits_seen",
  {
    userId: text("user_id").notNull(),
    repo: text("repo").notNull(),
    sha: text("sha").notNull(),
    message: text("message").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull(),
    batchId: uuid("batch_id").references(() => captureBatches.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.repo, t.sha] }),
    userTimeIdx: index("commits_seen_user_time_idx").on(t.userId, t.committedAt),
  }),
);
