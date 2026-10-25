CREATE TYPE "public"."point_transaction_kind" AS ENUM('credit', 'debit', 'expire', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."reward_record_kind" AS ENUM('expected', 'acquired', 'realized');--> statement-breakpoint
CREATE TYPE "public"."reward_record_type" AS ENUM('cash_saving', 'points', 'coupon');--> statement-breakpoint
CREATE TYPE "public"."task_deadline_source" AS ENUM('official', 'rule-derived', 'manual', 'unconfirmed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'planned' BEFORE 'participating';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'registered' BEFORE 'participating';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'in_progress' BEFORE 'awaiting_reward';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'likely_qualified' BEFORE 'awaiting_reward';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'qualified' BEFORE 'awaiting_reward';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'claimed' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'reward_credited' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'abandoned' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'failed' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."action_status" ADD VALUE 'expired' BEFORE 'cancelled';--> statement-breakpoint
CREATE TABLE "action_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"action_id" uuid,
	"point_batch_id" uuid,
	"draft_key" text,
	"title" text NOT NULL,
	"deadline_at" timestamp with time zone,
	"deadline_source" "task_deadline_source" DEFAULT 'unconfirmed' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_owner_draft" UNIQUE("owner_id","draft_key"),
	CONSTRAINT "task_priority_range" CHECK ("action_tasks"."priority" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "point_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"batch_id" uuid,
	"kind" "point_transaction_kind" NOT NULL,
	"points" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_tx_idempotency" UNIQUE("owner_id","idempotency_key"),
	CONSTRAINT "point_tx_direction" CHECK (("point_transactions"."kind" = 'credit' AND "point_transactions"."points" > 0) OR ("point_transactions"."kind" IN ('debit', 'expire') AND "point_transactions"."points" < 0) OR ("point_transactions"."kind" = 'adjustment' AND "point_transactions"."points" <> 0))
);
--> statement-breakpoint
CREATE TABLE "reward_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"wallet_id" uuid,
	"action_id" uuid,
	"kind" "reward_record_kind" NOT NULL,
	"type" "reward_record_type" NOT NULL,
	"points" bigint,
	"cash_minor" bigint,
	"point_value_micros" bigint,
	"cost_minor" bigint,
	"foregone_value_minor" bigint,
	"transaction_id" uuid,
	"source" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_idempotency" UNIQUE("owner_id","idempotency_key"),
	CONSTRAINT "reward_value_present" CHECK ("reward_records"."points" IS NOT NULL OR "reward_records"."cash_minor" IS NOT NULL),
	CONSTRAINT "reward_nonnegative" CHECK (("reward_records"."points" IS NULL OR "reward_records"."points" >= 0) AND ("reward_records"."cash_minor" IS NULL OR "reward_records"."cash_minor" >= 0) AND ("reward_records"."point_value_micros" IS NULL OR "reward_records"."point_value_micros" >= 0) AND ("reward_records"."cost_minor" IS NULL OR "reward_records"."cost_minor" >= 0) AND ("reward_records"."foregone_value_minor" IS NULL OR "reward_records"."foregone_value_minor" >= 0))
);
--> statement-breakpoint
CREATE TABLE "saved_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"calculator_type" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"quoted_at" timestamp with time zone,
	"quote_source" text,
	"point_value_micros" bigint,
	"rule_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"rule_snapshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"membership_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unresolved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_owner_key" UNIQUE("owner_id","idempotency_key"),
	CONSTRAINT "scenario_type" CHECK ("saved_scenarios"."calculator_type" IN ('rate-comparison', 'offer-comparison', 'activity-reward'))
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "promotion_version_id" uuid;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "rule_version_id" uuid;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "cycle_key" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "participation_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "progress" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "expected_reward_points" bigint;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "actual_reward_points" bigint;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "reward_credited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "auth_subject" text;--> statement-breakpoint
ALTER TABLE "point_batches" ADD COLUMN "source_type" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "point_batches" ADD COLUMN "credited_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Preserve the former earned_at as the actual credit time of existing batches.
UPDATE point_batches SET credited_at = earned_at;--> statement-breakpoint
ALTER TABLE "point_batches" ADD COLUMN "expiry_status" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "point_batches" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "point_batches" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "point_batches" ADD COLUMN "evidence_note" text;--> statement-breakpoint
ALTER TABLE "point_batches" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "point_batches" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "points_valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "tier_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "benefits" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "card_held" boolean;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "card_type" text;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_id_owner" UNIQUE("id", "owner_id");--> statement-breakpoint
ALTER TABLE "point_batches" ADD CONSTRAINT "point_batch_id_wallet" UNIQUE("id", "wallet_id");--> statement-breakpoint
ALTER TABLE "point_batches" ADD CONSTRAINT "point_batch_id_owner" UNIQUE("id", "owner_id");--> statement-breakpoint
ALTER TABLE "promotion_versions" ADD CONSTRAINT "promotion_version_id_promotion" UNIQUE("id", "promotion_id");--> statement-breakpoint
ALTER TABLE "action_tasks" ADD CONSTRAINT "action_tasks_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_tasks" ADD CONSTRAINT "task_action_owner_fk" FOREIGN KEY ("action_id","owner_id") REFERENCES "public"."actions"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_tasks" ADD CONSTRAINT "task_batch_owner_fk" FOREIGN KEY ("point_batch_id","owner_id") REFERENCES "public"."point_batches"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_tx_wallet_owner_fk" FOREIGN KEY ("wallet_id","owner_id") REFERENCES "public"."wallets"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_tx_batch_wallet_fk" FOREIGN KEY ("batch_id","wallet_id") REFERENCES "public"."point_batches"("id","wallet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_records" ADD CONSTRAINT "reward_records_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_records" ADD CONSTRAINT "reward_records_transaction_id_point_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."point_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_records" ADD CONSTRAINT "reward_wallet_owner_fk" FOREIGN KEY ("wallet_id","owner_id") REFERENCES "public"."wallets"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_records" ADD CONSTRAINT "reward_action_owner_fk" FOREIGN KEY ("action_id","owner_id") REFERENCES "public"."actions"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_scenarios" ADD CONSTRAINT "saved_scenarios_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_owner_deadline" ON "action_tasks" USING btree ("owner_id","status","deadline_at");--> statement-breakpoint
CREATE INDEX "scenario_owner_created" ON "saved_scenarios" USING btree ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_promotion_version_fk" FOREIGN KEY ("promotion_version_id","promotion_id") REFERENCES "public"."promotion_versions"("id","promotion_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_rule_version_fk" FOREIGN KEY ("rule_version_id","program_id") REFERENCES "public"."rule_versions"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_batches" ADD CONSTRAINT "batch_promotion_program_fk" FOREIGN KEY ("promotion_id","program_id") REFERENCES "public"."promotions"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_batches" ADD CONSTRAINT "batch_wallet_program_fk" FOREIGN KEY ("wallet_id","program_id") REFERENCES "public"."wallets"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Keep distinct pre-Phase-5 actions instead of collapsing repeated participation.
WITH legacy AS (SELECT id, row_number() OVER (PARTITION BY owner_id, promotion_id, cycle_key ORDER BY created_at, id) AS rn FROM actions)
UPDATE actions SET cycle_key = 'legacy-' || actions.id::text FROM legacy WHERE actions.id = legacy.id AND legacy.rn > 1;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_owner_promotion_cycle" UNIQUE("owner_id","promotion_id","cycle_key");--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_auth_subject_unique" UNIQUE("auth_subject");--> statement-breakpoint
ALTER TABLE "point_batches" ADD CONSTRAINT "batch_owner_key" UNIQUE("owner_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_reward_nonnegative" CHECK ("actions"."expected_reward_points" IS NULL OR "actions"."expected_reward_points" >= 0);--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "action_actual_reward_nonnegative" CHECK ("actions"."actual_reward_points" IS NULL OR "actions"."actual_reward_points" >= 0);--> statement-breakpoint
ALTER TABLE "point_batches" ADD CONSTRAINT "batch_expiry_status" CHECK ("point_batches"."expiry_status" IN ('unknown', 'known', 'never') AND ("point_batches"."expiry_status" <> 'never' OR "point_batches"."expires_at" IS NULL));
