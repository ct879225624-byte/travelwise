ALTER TABLE "point_transactions" ADD CONSTRAINT "point_tx_id_owner" UNIQUE("id","owner_id");--> statement-breakpoint
ALTER TABLE "point_batches" DROP CONSTRAINT "batch_expiry_status";--> statement-breakpoint
ALTER TABLE "reward_records" DROP CONSTRAINT "reward_records_transaction_id_point_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "reward_records" ADD CONSTRAINT "reward_transaction_owner_fk" FOREIGN KEY ("transaction_id","owner_id") REFERENCES "public"."point_transactions"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_action_acquired_once" ON "reward_records" USING btree ("owner_id","action_id") WHERE "reward_records"."kind" = 'acquired' AND "reward_records"."type" = 'points';--> statement-breakpoint
ALTER TABLE "action_tasks" ADD CONSTRAINT "task_deadline_source" CHECK ("action_tasks"."deadline_source" = 'unconfirmed' OR "action_tasks"."deadline_at" IS NOT NULL);--> statement-breakpoint
-- Existing explicit dates remain dates; do not infer a uniform expiry policy.
UPDATE point_batches SET expiry_status = 'known' WHERE expires_at IS NOT NULL AND expiry_status = 'unknown';--> statement-breakpoint
ALTER TABLE "point_batches" ADD CONSTRAINT "batch_expiry_status" CHECK (("point_batches"."expiry_status" = 'known' AND "point_batches"."expires_at" IS NOT NULL) OR ("point_batches"."expiry_status" IN ('unknown', 'never') AND "point_batches"."expires_at" IS NULL));
--> statement-breakpoint
-- Preserve legacy Phase 1 balances as an opening ledger, without changing assets.
UPDATE point_batches b SET program_id = w.program_id FROM wallets w WHERE b.wallet_id = w.id AND b.program_id IS NULL;
--> statement-breakpoint
INSERT INTO point_transactions (owner_id, wallet_id, batch_id, kind, points, idempotency_key, request_hash, reference_type, note, allocations)
SELECT b.owner_id, b.wallet_id, b.id, 'credit', b.remaining_points,
       'legacy-opening:' || b.id::text, 'migration-phase5-opening', 'legacy_opening',
       'Phase 5 迁移：既有剩余积分期初登记，原批次和历史初始数量保持不变',
       jsonb_build_array(jsonb_build_object('batchId', b.id, 'delta', b.remaining_points::text, 'remainingAfter', b.remaining_points::text))
FROM point_batches b WHERE b.remaining_points > 0 AND NOT EXISTS
  (SELECT 1 FROM point_transactions t WHERE t.batch_id = b.id OR t.allocations @> jsonb_build_array(jsonb_build_object('batchId', b.id)));
