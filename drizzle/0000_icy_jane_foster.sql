CREATE TYPE "public"."action_status" AS ENUM('saved', 'participating', 'awaiting_reward', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."program_kind" AS ENUM('hotel', 'airline', 'bank');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."qualification" AS ENUM('unknown', 'verified', 'ineligible');--> statement-breakpoint
CREATE TYPE "public"."stacking" AS ENUM('unknown', 'allowed', 'disallowed');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"status" "action_status" DEFAULT 'saved' NOT NULL,
	"claim_deadline" timestamp with time zone,
	"realized_saving_minor" bigint,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_currency" CHECK ("actions"."currency" = 'CNY'),
	CONSTRAINT "realized_saving_valid" CHECK ("actions"."realized_saving_minor" IS NULL OR ("actions"."status" = 'completed' AND "actions"."realized_saving_minor" >= 0))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_owner_id" uuid,
	"operation" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_fields" jsonb NOT NULL,
	CONSTRAINT "audit_fields_array" CHECK (jsonb_typeof("audit_logs"."changed_fields") = 'array')
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text,
	"excerpt" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_url_scheme" CHECK ("evidence"."source_url" IS NULL OR "evidence"."source_url" ~ '^https?://'),
	CONSTRAINT "evidence_real_source" CHECK ("evidence"."is_demo" OR "evidence"."source_url" IS NOT NULL),
	CONSTRAINT "evidence_verified_time" CHECK ("evidence"."verified_at" IS NULL OR "evidence"."verified_at" >= "evidence"."captured_at")
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"source" text NOT NULL,
	"earned_points" bigint NOT NULL,
	"remaining_points" bigint NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_amounts_valid" CHECK ("point_batches"."earned_points" >= 0 AND "point_batches"."remaining_points" >= 0 AND "point_batches"."remaining_points" <= "point_batches"."earned_points"),
	CONSTRAINT "point_expiry_valid" CHECK ("point_batches"."expires_at" IS NULL OR "point_batches"."expires_at" > "point_batches"."earned_at")
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "program_kind" NOT NULL,
	"points_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_code_unique" UNIQUE("code"),
	CONSTRAINT "program_code_format" CHECK ("programs"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"category" text NOT NULL,
	"publication_status" "publication_status" DEFAULT 'draft' NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"qualification" "qualification" DEFAULT 'unknown' NOT NULL,
	"stacking" "stacking" DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "promotion_id_program" UNIQUE("id","program_id"),
	CONSTRAINT "promotion_slug_format" CHECK ("promotions"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "promotion_valid_range" CHECK ("promotions"."ends_at" > "promotions"."starts_at"),
	CONSTRAINT "promotion_demo_title" CHECK (NOT "promotions"."is_demo" OR "promotions"."title" LIKE 'DEMO%'),
	CONSTRAINT "promotion_timezone" CHECK ("promotions"."time_zone" = 'UTC' OR "promotions"."time_zone" ~ '^[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+$')
);
--> statement-breakpoint
CREATE TABLE "rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"terms" jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"time_zone" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_version_number" UNIQUE("rule_id","version"),
	CONSTRAINT "version_id_program" UNIQUE("id","program_id"),
	CONSTRAINT "version_positive" CHECK ("rule_versions"."version" > 0),
	CONSTRAINT "version_valid_range" CHECK ("rule_versions"."valid_until" IS NULL OR "rule_versions"."valid_until" > "rule_versions"."valid_from"),
	CONSTRAINT "version_terms_array" CHECK (jsonb_typeof("rule_versions"."terms") = 'array'),
	CONSTRAINT "version_timezone" CHECK ("rule_versions"."time_zone" = 'UTC' OR "rule_versions"."time_zone" ~ '^[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+$')
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_program_code" UNIQUE("program_id","code"),
	CONSTRAINT "rule_id_program" UNIQUE("id","program_id")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"membership_tier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_owner_program" UNIQUE("owner_id","program_id"),
	CONSTRAINT "wallet_id_owner" UNIQUE("id","owner_id"),
	CONSTRAINT "wallet_id_program" UNIQUE("id","program_id")
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_promotion_program_fk" FOREIGN KEY ("promotion_id","program_id") REFERENCES "public"."promotions"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_wallet_owner_fk" FOREIGN KEY ("wallet_id","owner_id") REFERENCES "public"."wallets"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_wallet_program_fk" FOREIGN KEY ("wallet_id","program_id") REFERENCES "public"."wallets"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_owner_id_owners_id_fk" FOREIGN KEY ("actor_owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_rule_version_id_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_batches" ADD CONSTRAINT "batch_wallet_owner_fk" FOREIGN KEY ("wallet_id","owner_id") REFERENCES "public"."wallets"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotion_version_program_fk" FOREIGN KEY ("rule_version_id","program_id") REFERENCES "public"."rule_versions"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD CONSTRAINT "version_rule_program_fk" FOREIGN KEY ("rule_id","program_id") REFERENCES "public"."rules"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_owner_deadline" ON "actions" USING btree ("owner_id","claim_deadline");--> statement-breakpoint
CREATE INDEX "evidence_version" ON "evidence" USING btree ("rule_version_id");--> statement-breakpoint
CREATE INDEX "batch_owner_expiry" ON "point_batches" USING btree ("owner_id","expires_at");--> statement-breakpoint
CREATE INDEX "promotion_publication_start" ON "promotions" USING btree ("publication_status","starts_at");