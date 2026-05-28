DROP TABLE "capture_events" CASCADE;--> statement-breakpoint
ALTER TABLE "capture_batches" ADD COLUMN "frame_count" integer DEFAULT 0 NOT NULL;