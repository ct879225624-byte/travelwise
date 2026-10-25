CREATE TABLE "opportunity_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rule_fingerprint" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "opportunity_profile_owner_promotion" UNIQUE("owner_id","promotion_id")
);
--> statement-breakpoint
CREATE TABLE "personal_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"href" text NOT NULL,
	"deadline_at" timestamp with time zone,
	"time_zone" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_owner_source" UNIQUE("owner_id","source_key"),
	CONSTRAINT "reminder_status" CHECK ("personal_reminders"."status" IN ('pending', 'read', 'completed', 'ignored', 'snoozed')),
	CONSTRAINT "reminder_snooze" CHECK (("personal_reminders"."status" = 'snoozed') = ("personal_reminders"."snoozed_until" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "opportunity_profiles" ADD CONSTRAINT "opportunity_profiles_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_profiles" ADD CONSTRAINT "opportunity_profiles_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_reminders" ADD CONSTRAINT "personal_reminders_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminder_owner_active" ON "personal_reminders" USING btree ("owner_id","active","status");