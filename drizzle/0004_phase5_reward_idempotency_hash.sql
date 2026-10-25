ALTER TABLE "reward_records" ADD COLUMN "request_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "reward_records" ALTER COLUMN "request_hash" DROP DEFAULT;
