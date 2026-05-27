CREATE TABLE IF NOT EXISTS "capture_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"runtime" text NOT NULL,
	"processes" jsonb,
	"system" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capture_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"jpeg_base64" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commits_seen" (
	"user_id" text NOT NULL,
	"repo" text NOT NULL,
	"sha" text NOT NULL,
	"message" text NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commits_seen_user_id_repo_sha_pk" PRIMARY KEY("user_id","repo","sha")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
	"summary_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"vlm_model" text DEFAULT 'google/gemini-2.0-flash-exp:free' NOT NULL,
	"chat_model" text DEFAULT 'google/gemini-2.0-flash-exp:free' NOT NULL,
	"capture_interval_sec" integer DEFAULT 30 NOT NULL,
	"batch_interval_sec" integer DEFAULT 300 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vlm_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"activity" text NOT NULL,
	"app" text,
	"project_guess" text,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"focus_score" real DEFAULT 0 NOT NULL,
	"model" text NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vlm_summaries_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capture_events" ADD CONSTRAINT "capture_events_batch_id_capture_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."capture_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commits_seen" ADD CONSTRAINT "commits_seen_batch_id_capture_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."capture_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_summary_id_vlm_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."vlm_summaries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vlm_summaries" ADD CONSTRAINT "vlm_summaries_batch_id_capture_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."capture_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_batches_user_time_idx" ON "capture_batches" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_events_batch_idx" ON "capture_events" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commits_seen_user_time_idx" ON "commits_seen" USING btree ("user_id","committed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_user_idx" ON "embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vlm_summaries_user_idx" ON "vlm_summaries" USING btree ("user_id","created_at");