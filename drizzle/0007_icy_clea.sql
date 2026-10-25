CREATE TYPE "public"."ai_input_type" AS ENUM('url', 'text', 'image', 'radar');--> statement-breakpoint
CREATE TYPE "public"."ai_task_status" AS ENUM('ready_for_review', 'completed', 'blocked', 'failed');--> statement-breakpoint
CREATE TYPE "public"."monitor_run_status" AS ENUM('success', 'unchanged', 'changed', 'error', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."monitor_source_type" AS ENUM('web', 'rss', 'atom', 'announcement', 'help', 'bank');--> statement-breakpoint
CREATE TYPE "public"."radar_review_status" AS ENUM('pending', 'confirmed', 'ignored', 'duplicate');--> statement-breakpoint
CREATE TABLE "ai_extraction_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"radar_event_id" uuid,
	"promotion_id" uuid,
	"input_type" "ai_input_type" NOT NULL,
	"source_url" text,
	"source_text" text,
	"source_mime" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "ai_task_status" DEFAULT 'ready_for_review' NOT NULL,
	"provider" text,
	"model" text,
	"error_message" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_source_required" CHECK ("ai_extraction_tasks"."source_url" IS NOT NULL OR "ai_extraction_tasks"."source_text" IS NOT NULL OR "ai_extraction_tasks"."source_mime" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "monitor_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "monitor_run_status" NOT NULL,
	"http_status" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"source_type" "monitor_source_type" DEFAULT 'web' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"frequency_hours" integer DEFAULT 12 NOT NULL,
	"selector" text,
	"etag" text,
	"last_modified" text,
	"latest_fingerprint" text,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitor_source_url" UNIQUE("url"),
	CONSTRAINT "monitor_frequency_range" CHECK ("monitor_sources"."frequency_hours" BETWEEN 1 AND 168),
	CONSTRAINT "monitor_url_scheme" CHECK ("monitor_sources"."url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "monitor_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"normalized_content" text NOT NULL,
	"title" text,
	"http_status" integer NOT NULL,
	"content_type" text,
	"etag" text,
	"last_modified" text,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitor_version_number" UNIQUE("source_id","version"),
	CONSTRAINT "monitor_source_fingerprint" UNIQUE("source_id","fingerprint"),
	CONSTRAINT "monitor_http_status" CHECK ("monitor_versions"."http_status" BETWEEN 100 AND 599)
);
--> statement-breakpoint
CREATE TABLE "radar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"previous_version_id" uuid,
	"new_version_id" uuid NOT NULL,
	"status" "radar_review_status" DEFAULT 'pending' NOT NULL,
	"summary" text NOT NULL,
	"diff" jsonb DEFAULT '{"added":[],"removed":[],"changed":[]}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"duplicate_of" uuid,
	"promotion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radar_event_version" UNIQUE("source_id","new_version_id")
);
--> statement-breakpoint
ALTER TABLE "ai_extraction_tasks" ADD CONSTRAINT "ai_extraction_tasks_source_id_monitor_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."monitor_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extraction_tasks" ADD CONSTRAINT "ai_extraction_tasks_radar_event_id_radar_events_id_fk" FOREIGN KEY ("radar_event_id") REFERENCES "public"."radar_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extraction_tasks" ADD CONSTRAINT "ai_extraction_tasks_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_source_id_monitor_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."monitor_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_sources" ADD CONSTRAINT "monitor_sources_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_versions" ADD CONSTRAINT "monitor_versions_source_id_monitor_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."monitor_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_events" ADD CONSTRAINT "radar_events_source_id_monitor_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."monitor_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_events" ADD CONSTRAINT "radar_events_previous_version_id_monitor_versions_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."monitor_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_events" ADD CONSTRAINT "radar_events_new_version_id_monitor_versions_id_fk" FOREIGN KEY ("new_version_id") REFERENCES "public"."monitor_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_events" ADD CONSTRAINT "radar_events_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tasks_status" ON "ai_extraction_tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "monitor_runs_source_time" ON "monitor_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "monitor_source_due" ON "monitor_sources" USING btree ("enabled","last_checked_at");--> statement-breakpoint
CREATE INDEX "monitor_versions_source" ON "monitor_versions" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "radar_events_status" ON "radar_events" USING btree ("status","detected_at");