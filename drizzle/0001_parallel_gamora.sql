CREATE TYPE "public"."lifecycle_status" AS ENUM('scheduled', 'active', 'ended', 'archived', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('official', 'community', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('official_verified', 'community', 'unverified', 'conflict', 'reverify');--> statement-breakpoint
ALTER TYPE "public"."publication_status" ADD VALUE 'pending_review' BEFORE 'published';--> statement-breakpoint
ALTER TYPE "public"."publication_status" ADD VALUE 'withdrawn' BEFORE 'archived';--> statement-breakpoint
CREATE TABLE "guide_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "guide_category_position" CHECK ("guide_categories"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "guide_evidence" (
	"guide_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_evidence_unique" UNIQUE("guide_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "guide_promotions" (
	"guide_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_promotion_unique" UNIQUE("guide_id","promotion_id")
);
--> statement-breakpoint
CREATE TABLE "guide_rule_versions" (
	"guide_id" uuid NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_rule_unique" UNIQUE("guide_id","rule_version_id")
);
--> statement-breakpoint
CREATE TABLE "guide_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"revision_reason" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_version_number" UNIQUE("guide_id","version"),
	CONSTRAINT "guide_version_positive" CHECK ("guide_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publication_status" "publication_status" DEFAULT 'draft' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guides_slug_unique" UNIQUE("slug"),
	CONSTRAINT "guide_slug_format" CHECK ("guides"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "guide_demo_title" CHECK (NOT "guides"."is_demo" OR "guides"."title" LIKE 'DEMO%')
);
--> statement-breakpoint
CREATE TABLE "promotion_evidence" (
	"promotion_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_evidence_unique" UNIQUE("promotion_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "promotion_rules" (
	"promotion_id" uuid NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_rule_unique" UNIQUE("promotion_id","rule_version_id")
);
--> statement-breakpoint
CREATE TABLE "promotion_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"revision_reason" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_version_number" UNIQUE("promotion_id","version"),
	CONSTRAINT "promotion_version_positive" CHECK ("promotion_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "promotions" DROP CONSTRAINT "promotion_valid_range";--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "rule_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ALTER COLUMN "rule_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ALTER COLUMN "starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ALTER COLUMN "ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "source_kind" "source_kind" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "original_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "verification_status" "verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "platform" text DEFAULT '锦江荟' NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "lifecycle_status" "lifecycle_status" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "verification_status" "verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "eligibility" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "reward_type" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "reward_amount" bigint;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "reward_unit" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "enrollment_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "enrollment_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "booking_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "booking_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "stay_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "stay_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "claim_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "claim_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "other_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "brands" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "regions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "notes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "structured_content" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "applicability" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "verification_status" "verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "publication_status" "publication_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "revision_reason" text DEFAULT '首次录入' NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "type" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_evidence" ADD CONSTRAINT "guide_evidence_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_evidence" ADD CONSTRAINT "guide_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_promotions" ADD CONSTRAINT "guide_promotions_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_promotions" ADD CONSTRAINT "guide_promotions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_rule_versions" ADD CONSTRAINT "guide_rule_versions_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_rule_versions" ADD CONSTRAINT "guide_rule_versions_rule_version_id_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_versions" ADD CONSTRAINT "guide_versions_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_category_id_guide_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."guide_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_evidence" ADD CONSTRAINT "promotion_evidence_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_evidence" ADD CONSTRAINT "promotion_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_rule_version_id_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_versions" ADD CONSTRAINT "promotion_versions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_url" UNIQUE("source_url");--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotion_reward_nonnegative" CHECK ("promotions"."reward_amount" IS NULL OR "promotions"."reward_amount" >= 0);--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotion_valid_range" CHECK ("promotions"."ends_at" IS NULL OR "promotions"."starts_at" IS NULL OR "promotions"."ends_at" > "promotions"."starts_at");--> statement-breakpoint
ALTER TABLE "rule_versions" ADD CONSTRAINT "version_applicability_array" CHECK (jsonb_typeof("rule_versions"."applicability") = 'array');