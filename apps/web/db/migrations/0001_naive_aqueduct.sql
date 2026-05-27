ALTER TABLE "commits_seen" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "commits_seen" ADD COLUMN "additions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commits_seen" ADD COLUMN "deletions" integer DEFAULT 0 NOT NULL;