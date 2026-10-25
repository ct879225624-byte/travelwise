import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => instant("created_at").notNull().defaultNow();
const updatedAt = () => instant("updated_at").notNull().defaultNow();

export const programKind = pgEnum("program_kind", ["hotel", "airline", "bank"]);
export const publicationStatus = pgEnum("publication_status", ["draft", "pending_review", "published", "withdrawn", "archived"]);
export const verificationStatus = pgEnum("verification_status", ["official_verified", "community", "unverified", "conflict", "reverify"]);
export const lifecycleStatus = pgEnum("lifecycle_status", ["scheduled", "active", "ended", "archived", "unknown"]);
export const sourceKind = pgEnum("source_kind", ["official", "community", "other"]);
export const qualification = pgEnum("qualification", ["unknown", "verified", "ineligible"]);
export const stacking = pgEnum("stacking", ["unknown", "allowed", "disallowed"]);
export const actionStatus = pgEnum("action_status", ["saved", "planned", "registered", "participating", "in_progress", "likely_qualified", "qualified", "awaiting_reward", "claimed", "reward_credited", "completed", "abandoned", "failed", "expired", "cancelled"]);
export const pointTransactionKind = pgEnum("point_transaction_kind", ["credit", "debit", "expire", "adjustment"]);
export const rewardRecordKind = pgEnum("reward_record_kind", ["expected", "acquired", "realized"]);
export const rewardRecordType = pgEnum("reward_record_type", ["cash_saving", "points", "coupon"]);
export const taskDeadlineSource = pgEnum("task_deadline_source", ["official", "rule-derived", "manual", "unconfirmed"]);
export const taskStatus = pgEnum("task_status", ["todo", "completed", "cancelled"]);
export const monitorSourceType = pgEnum("monitor_source_type", ["web", "rss", "atom", "announcement", "help", "bank"]);
export const monitorRunStatus = pgEnum("monitor_run_status", ["success", "unchanged", "changed", "error", "blocked"]);
export const radarReviewStatus = pgEnum("radar_review_status", ["pending", "confirmed", "ignored", "duplicate"]);
export const aiInputType = pgEnum("ai_input_type", ["url", "text", "image", "radar"]);
export const aiTaskStatus = pgEnum("ai_task_status", ["ready_for_review", "completed", "blocked", "failed"]);

export const programs = pgTable("programs", {
  id: id(), code: text("code").notNull().unique(), name: text("name").notNull(), kind: programKind("kind").notNull(),
  pointsName: text("points_name").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [check("program_code_format", sql`${t.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)]);

export const rules = pgTable("rules", {
  id: id(), programId: uuid("program_id").notNull().references(() => programs.id), code: text("code").notNull(),
  name: text("name").notNull(), type: text("type").notNull().default("general"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [unique("rule_program_code").on(t.programId, t.code), unique("rule_id_program").on(t.id, t.programId)]);

export const ruleVersions = pgTable("rule_versions", {
  id: id(), ruleId: uuid("rule_id").notNull(), programId: uuid("program_id").notNull(), version: integer("version").notNull(),
  terms: jsonb("terms").$type<string[]>().notNull(), structuredContent: jsonb("structured_content").$type<Record<string, unknown>>().notNull().default({}),
  applicability: jsonb("applicability").$type<string[]>().notNull().default([]), validFrom: instant("valid_from").notNull(),
  validUntil: instant("valid_until"), timeZone: text("time_zone").notNull(),
  verificationStatus: verificationStatus("verification_status").notNull().default("unverified"),
  publicationStatus: publicationStatus("publication_status").notNull().default("draft"),
  revisionReason: text("revision_reason").notNull().default("首次录入"), publishedAt: instant("published_at"),
  isDemo: boolean("is_demo").notNull().default(false), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ columns: [t.ruleId, t.programId], foreignColumns: [rules.id, rules.programId], name: "version_rule_program_fk" }),
  unique("rule_version_number").on(t.ruleId, t.version), unique("version_id_program").on(t.id, t.programId),
  check("version_positive", sql`${t.version} > 0`), check("version_valid_range", sql`${t.validUntil} IS NULL OR ${t.validUntil} > ${t.validFrom}`),
  check("version_terms_array", sql`jsonb_typeof(${t.terms}) = 'array'`), check("version_applicability_array", sql`jsonb_typeof(${t.applicability}) = 'array'`),
  check("version_timezone", sql`${t.timeZone} = 'UTC' OR ${t.timeZone} ~ '^[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+$'`),
]);

export const promotions = pgTable("promotions", {
  id: id(), programId: uuid("program_id").notNull().references(() => programs.id), ruleVersionId: uuid("rule_version_id"),
  slug: text("slug").notNull().unique(), title: text("title").notNull(), summary: text("summary").notNull(),
  category: text("category").notNull(), platform: text("platform").notNull().default("锦江荟"),
  publicationStatus: publicationStatus("publication_status").notNull().default("draft"),
  lifecycleStatus: lifecycleStatus("lifecycle_status").notNull().default("unknown"),
  verificationStatus: verificationStatus("verification_status").notNull().default("unverified"),
  isSuspended: boolean("is_suspended").notNull().default(false), isDemo: boolean("is_demo").notNull().default(false),
  eligibility: jsonb("eligibility").$type<string[]>().notNull().default([]), rewardType: text("reward_type"),
  rewardAmount: bigint("reward_amount", { mode: "bigint" }), rewardUnit: text("reward_unit"),
  enrollmentStartsAt: instant("enrollment_starts_at"), enrollmentEndsAt: instant("enrollment_ends_at"),
  startsAt: instant("starts_at"), endsAt: instant("ends_at"), bookingStartsAt: instant("booking_starts_at"),
  bookingEndsAt: instant("booking_ends_at"), stayStartsAt: instant("stay_starts_at"), stayEndsAt: instant("stay_ends_at"),
  claimStartsAt: instant("claim_starts_at"), claimEndsAt: instant("claim_ends_at"), otherDeadlineAt: instant("other_deadline_at"),
  timeZone: text("time_zone").notNull(), brands: jsonb("brands").$type<string[]>().notNull().default([]),
  channels: jsonb("channels").$type<string[]>().notNull().default([]), regions: jsonb("regions").$type<string[]>().notNull().default([]),
  steps: jsonb("steps").$type<string[]>().notNull().default([]), notes: jsonb("notes").$type<string[]>().notNull().default([]),
  qualification: qualification("qualification").notNull().default("unknown"), stacking: stacking("stacking").notNull().default("unknown"),
  publishedAt: instant("published_at"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ columns: [t.ruleVersionId, t.programId], foreignColumns: [ruleVersions.id, ruleVersions.programId], name: "promotion_version_program_fk" }),
  unique("promotion_id_program").on(t.id, t.programId), check("promotion_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("promotion_valid_range", sql`${t.endsAt} IS NULL OR ${t.startsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
  check("promotion_demo_title", sql`NOT ${t.isDemo} OR ${t.title} LIKE 'DEMO%'`),
  check("promotion_timezone", sql`${t.timeZone} = 'UTC' OR ${t.timeZone} ~ '^[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+$'`),
  check("promotion_reward_nonnegative", sql`${t.rewardAmount} IS NULL OR ${t.rewardAmount} >= 0`), index("promotion_publication_start").on(t.publicationStatus, t.startsAt),
]);

export const promotionVersions = pgTable("promotion_versions", {
  id: id(), promotionId: uuid("promotion_id").notNull().references(() => promotions.id), version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(), revisionReason: text("revision_reason").notNull(), actor: text("actor").notNull(), createdAt: createdAt(),
}, (t) => [unique("promotion_version_number").on(t.promotionId, t.version), unique("promotion_version_id_promotion").on(t.id, t.promotionId), check("promotion_version_positive", sql`${t.version} > 0`)]);

export const promotionRules = pgTable("promotion_rules", {
  promotionId: uuid("promotion_id").notNull().references(() => promotions.id), ruleVersionId: uuid("rule_version_id").notNull().references(() => ruleVersions.id), createdAt: createdAt(),
}, (t) => [unique("promotion_rule_unique").on(t.promotionId, t.ruleVersionId)]);

export const evidence = pgTable("evidence", {
  id: id(), ruleVersionId: uuid("rule_version_id").references(() => ruleVersions.id), sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"), sourceKind: sourceKind("source_kind").notNull().default("other"), originalPublishedAt: instant("original_published_at"),
  capturedAt: instant("captured_at").notNull(), verifiedAt: instant("verified_at"),
  verificationStatus: verificationStatus("verification_status").notNull().default("unverified"), excerpt: text("excerpt").notNull(),
  scope: text("scope"), isDemo: boolean("is_demo").notNull().default(false), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  check("evidence_url_scheme", sql`${t.sourceUrl} IS NULL OR ${t.sourceUrl} ~ '^https?://'`),
  check("evidence_real_source", sql`${t.isDemo} OR ${t.sourceUrl} IS NOT NULL`), check("evidence_verified_time", sql`${t.verifiedAt} IS NULL OR ${t.verifiedAt} >= ${t.capturedAt}`),
  index("evidence_version").on(t.ruleVersionId),
]);

export const promotionEvidence = pgTable("promotion_evidence", {
  promotionId: uuid("promotion_id").notNull().references(() => promotions.id), evidenceId: uuid("evidence_id").notNull().references(() => evidence.id), createdAt: createdAt(),
}, (t) => [unique("promotion_evidence_unique").on(t.promotionId, t.evidenceId)]);

export const guideCategories = pgTable("guide_categories", {
  id: id(), slug: text("slug").notNull().unique(), name: text("name").notNull(), position: integer("position").notNull(), createdAt: createdAt(),
}, (t) => [check("guide_category_position", sql`${t.position} > 0`)]);

export const guides = pgTable("guides", {
  id: id(), programId: uuid("program_id").notNull().references(() => programs.id), categoryId: uuid("category_id").notNull().references(() => guideCategories.id),
  slug: text("slug").notNull().unique(), title: text("title").notNull(), summary: text("summary").notNull(), body: text("body").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]), publicationStatus: publicationStatus("publication_status").notNull().default("draft"),
  verificationStatus: verificationStatus("verification_status").notNull().default("unverified"), isDemo: boolean("is_demo").notNull().default(false),
  publishedAt: instant("published_at"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [check("guide_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`), check("guide_demo_title", sql`NOT ${t.isDemo} OR ${t.title} LIKE 'DEMO%'`)]);

export const guideVersions = pgTable("guide_versions", {
  id: id(), guideId: uuid("guide_id").notNull().references(() => guides.id), version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(), revisionReason: text("revision_reason").notNull(), actor: text("actor").notNull(), createdAt: createdAt(),
}, (t) => [unique("guide_version_number").on(t.guideId, t.version), check("guide_version_positive", sql`${t.version} > 0`)]);

export const guideRuleVersions = pgTable("guide_rule_versions", {
  guideId: uuid("guide_id").notNull().references(() => guides.id), ruleVersionId: uuid("rule_version_id").notNull().references(() => ruleVersions.id), createdAt: createdAt(),
}, (t) => [unique("guide_rule_unique").on(t.guideId, t.ruleVersionId)]);

export const guidePromotions = pgTable("guide_promotions", {
  guideId: uuid("guide_id").notNull().references(() => guides.id), promotionId: uuid("promotion_id").notNull().references(() => promotions.id), createdAt: createdAt(),
}, (t) => [unique("guide_promotion_unique").on(t.guideId, t.promotionId)]);

export const guideEvidence = pgTable("guide_evidence", {
  guideId: uuid("guide_id").notNull().references(() => guides.id), evidenceId: uuid("evidence_id").notNull().references(() => evidence.id), createdAt: createdAt(),
}, (t) => [unique("guide_evidence_unique").on(t.guideId, t.evidenceId)]);

// Owner IDs reserve tenant scope; this table is not an authentication system.
export const owners = pgTable("owners", {
  id: id(), authSubject: text("auth_subject").unique(), createdAt: createdAt(),
});

export const wallets = pgTable("wallets", {
  id: id(), ownerId: uuid("owner_id").notNull().references(() => owners.id), programId: uuid("program_id").notNull().references(() => programs.id),
  membershipTier: text("membership_tier"), pointsValidUntil: instant("points_valid_until"), tierExpiresAt: instant("tier_expires_at"),
  benefits: jsonb("benefits").$type<Array<{ name: string; kind: string; expiresAt: string | null; usedAt: string | null }>>().notNull().default([]),
  cardHeld: boolean("card_held"), cardType: text("card_type"), notes: text("notes"), lastVerifiedAt: instant("last_verified_at"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [unique("wallet_owner_program").on(t.ownerId, t.programId), unique("wallet_id_owner").on(t.id, t.ownerId), unique("wallet_id_program").on(t.id, t.programId)]);

export const pointBatches = pgTable("point_batches", {
  id: id(), walletId: uuid("wallet_id").notNull(), ownerId: uuid("owner_id").notNull(), source: text("source").notNull(),
  earnedPoints: bigint("earned_points", { mode: "bigint" }).notNull(), remainingPoints: bigint("remaining_points", { mode: "bigint" }).notNull(),
  sourceType: text("source_type").notNull().default("other"), creditedAt: instant("credited_at").notNull().defaultNow(),
  earnedAt: instant("earned_at").notNull(), expiresAt: instant("expires_at"), expiryStatus: text("expiry_status").notNull().default("unknown"), promotionId: uuid("promotion_id"), programId: uuid("program_id"), evidenceNote: text("evidence_note"),
  idempotencyKey: text("idempotency_key"), updatedAt: updatedAt(), createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.walletId, t.ownerId], foreignColumns: [wallets.id, wallets.ownerId], name: "batch_wallet_owner_fk" }),
  foreignKey({ columns: [t.promotionId, t.programId], foreignColumns: [promotions.id, promotions.programId], name: "batch_promotion_program_fk" }),
  foreignKey({ columns: [t.walletId, t.programId], foreignColumns: [wallets.id, wallets.programId], name: "batch_wallet_program_fk" }),
  unique("batch_owner_key").on(t.ownerId, t.idempotencyKey), check("batch_expiry_status", sql`(${t.expiryStatus} = 'known' AND ${t.expiresAt} IS NOT NULL) OR (${t.expiryStatus} IN ('unknown', 'never') AND ${t.expiresAt} IS NULL)`),
  check("point_amounts_valid", sql`${t.earnedPoints} >= 0 AND ${t.remainingPoints} >= 0 AND ${t.remainingPoints} <= ${t.earnedPoints}`),
  check("point_expiry_valid", sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.earnedAt}`), unique("point_batch_id_wallet").on(t.id, t.walletId), unique("point_batch_id_owner").on(t.id, t.ownerId), index("batch_owner_expiry").on(t.ownerId, t.expiresAt),
]);

export const actions = pgTable("actions", {
  id: id(), ownerId: uuid("owner_id").notNull().references(() => owners.id), promotionId: uuid("promotion_id").notNull(), walletId: uuid("wallet_id").notNull(),
  programId: uuid("program_id").notNull(), promotionVersionId: uuid("promotion_version_id"), ruleVersionId: uuid("rule_version_id"),
  cycleKey: text("cycle_key").notNull().default("default"), status: actionStatus("status").notNull().default("saved"), participationAt: instant("participation_at"),
  progress: jsonb("progress").$type<Record<string, unknown>>().notNull().default({}), expectedRewardPoints: bigint("expected_reward_points", { mode: "bigint" }),
  actualRewardPoints: bigint("actual_reward_points", { mode: "bigint" }), claimDeadline: instant("claim_deadline"), claimedAt: instant("claimed_at"), rewardCreditedAt: instant("reward_credited_at"),
  notes: text("notes"), realizedSavingMinor: bigint("realized_saving_minor", { mode: "bigint" }), currency: text("currency").notNull().default("CNY"), updatedAt: updatedAt(), createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.promotionId, t.programId], foreignColumns: [promotions.id, promotions.programId], name: "action_promotion_program_fk" }),
  foreignKey({ columns: [t.walletId, t.ownerId], foreignColumns: [wallets.id, wallets.ownerId], name: "action_wallet_owner_fk" }),
  foreignKey({ columns: [t.walletId, t.programId], foreignColumns: [wallets.id, wallets.programId], name: "action_wallet_program_fk" }),
  foreignKey({ columns: [t.promotionVersionId, t.promotionId], foreignColumns: [promotionVersions.id, promotionVersions.promotionId], name: "action_promotion_version_fk" }),
  foreignKey({ columns: [t.ruleVersionId, t.programId], foreignColumns: [ruleVersions.id, ruleVersions.programId], name: "action_rule_version_fk" }),
  unique("action_owner_promotion_cycle").on(t.ownerId, t.promotionId, t.cycleKey),
  check("action_currency", sql`${t.currency} = 'CNY'`), check("realized_saving_valid", sql`${t.realizedSavingMinor} IS NULL OR (${t.status} = 'completed' AND ${t.realizedSavingMinor} >= 0)`),
  check("action_reward_nonnegative", sql`${t.expectedRewardPoints} IS NULL OR ${t.expectedRewardPoints} >= 0`),
  check("action_actual_reward_nonnegative", sql`${t.actualRewardPoints} IS NULL OR ${t.actualRewardPoints} >= 0`),
  unique("action_id_owner").on(t.id, t.ownerId), index("action_owner_deadline").on(t.ownerId, t.claimDeadline),
]);

export const auditLogs = pgTable("audit_logs", {
  id: id(), actorOwnerId: uuid("actor_owner_id").references(() => owners.id), actor: text("actor"), operation: text("operation").notNull(),
  entityType: text("entity_type").notNull(), entityId: uuid("entity_id").notNull(), occurredAt: createdAt(), changedFields: jsonb("changed_fields").$type<string[]>().notNull(),
}, (t) => [check("audit_fields_array", sql`jsonb_typeof(${t.changedFields}) = 'array'`)]);

export const pointTransactions = pgTable("point_transactions", {
  id: id(), ownerId: uuid("owner_id").notNull().references(() => owners.id), walletId: uuid("wallet_id").notNull(), batchId: uuid("batch_id"),
  kind: pointTransactionKind("kind").notNull(), points: bigint("points", { mode: "bigint" }).notNull(), idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(), allocations: jsonb("allocations").$type<Array<{ batchId: string; delta: string; remainingAfter: string }>>().notNull().default([]),
  referenceType: text("reference_type"), referenceId: uuid("reference_id"), note: text("note"), createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.walletId, t.ownerId], foreignColumns: [wallets.id, wallets.ownerId], name: "point_tx_wallet_owner_fk" }),
  foreignKey({ columns: [t.batchId, t.walletId], foreignColumns: [pointBatches.id, pointBatches.walletId], name: "point_tx_batch_wallet_fk" }),
  unique("point_tx_id_owner").on(t.id, t.ownerId), unique("point_tx_idempotency").on(t.ownerId, t.idempotencyKey), check("point_tx_direction", sql`(${t.kind} = 'credit' AND ${t.points} > 0) OR (${t.kind} IN ('debit', 'expire') AND ${t.points} < 0) OR (${t.kind} = 'adjustment' AND ${t.points} <> 0)`),
]);

export const actionTasks = pgTable("action_tasks", {
  id: id(), ownerId: uuid("owner_id").notNull().references(() => owners.id), actionId: uuid("action_id"), pointBatchId: uuid("point_batch_id"),
  draftKey: text("draft_key"),
  title: text("title").notNull(), deadlineAt: instant("deadline_at"), deadlineSource: taskDeadlineSource("deadline_source").notNull().default("unconfirmed"),
  status: taskStatus("status").notNull().default("todo"), priority: integer("priority").notNull().default(2), notes: text("notes"), completedAt: instant("completed_at"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ columns: [t.actionId, t.ownerId], foreignColumns: [actions.id, actions.ownerId], name: "task_action_owner_fk" }),
  foreignKey({ columns: [t.pointBatchId, t.ownerId], foreignColumns: [pointBatches.id, pointBatches.ownerId], name: "task_batch_owner_fk" }),
  check("task_deadline_source", sql`${t.deadlineSource} = 'unconfirmed' OR ${t.deadlineAt} IS NOT NULL`), check("task_priority_range", sql`${t.priority} BETWEEN 1 AND 3`), unique("task_owner_draft").on(t.ownerId, t.draftKey), index("task_owner_deadline").on(t.ownerId, t.status, t.deadlineAt),
]);

export const savedScenarios = pgTable("saved_scenarios", {
  id: id(), ownerId: uuid("owner_id").notNull().references(() => owners.id), name: text("name").notNull(), notes: text("notes"),
  calculatorType: text("calculator_type").notNull(), inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>().notNull(),
  quotedAt: instant("quoted_at"), quoteSource: text("quote_source"), pointValueMicros: bigint("point_value_micros", { mode: "bigint" }),
  ruleVersionIds: jsonb("rule_version_ids").$type<string[]>().notNull().default([]), result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  ruleSnapshots: jsonb("rule_snapshots").$type<Record<string, unknown>[]>().notNull().default([]), membershipSnapshot: jsonb("membership_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  idempotencyKey: text("idempotency_key").notNull(), requestHash: text("request_hash").notNull(),
  assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]), unresolved: jsonb("unresolved").$type<string[]>().notNull().default([]),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [unique("scenario_owner_key").on(t.ownerId, t.idempotencyKey), check("scenario_type", sql`${t.calculatorType} IN ('rate-comparison', 'offer-comparison', 'activity-reward')`), index("scenario_owner_created").on(t.ownerId, t.createdAt)]);

export const opportunityProfiles = pgTable("opportunity_profiles", {
  id: id(), ownerId: uuid("owner_id").notNull().references(() => owners.id), promotionId: uuid("promotion_id").notNull().references(() => promotions.id),
  facts: jsonb("facts").$type<Record<string, unknown>>().notNull().default({}), ruleFingerprint: text("rule_fingerprint").notNull(), confirmedAt: instant("confirmed_at"),
}, (t) => [unique("opportunity_profile_owner_promotion").on(t.ownerId, t.promotionId)]);

export const personalReminders = pgTable("personal_reminders", {
  id: id(), ownerId: uuid("owner_id").notNull().references(() => owners.id), sourceKey: text("source_key").notNull(), kind: text("kind").notNull(),
  title: text("title").notNull(), detail: text("detail").notNull(), href: text("href").notNull(), deadlineAt: instant("deadline_at"), timeZone: text("time_zone").notNull(),
  status: text("status").notNull().default("pending"), snoozedUntil: instant("snoozed_until"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [unique("reminder_owner_source").on(t.ownerId, t.sourceKey), index("reminder_owner_active").on(t.ownerId, t.active, t.status),
  check("reminder_status", sql`${t.status} IN ('pending', 'read', 'completed', 'ignored', 'snoozed')`),
  check("reminder_snooze", sql`(${t.status} = 'snoozed') = (${t.snoozedUntil} IS NOT NULL)`),
]);

export const rewardRecords = pgTable("reward_records", {
  id: id(), ownerId: uuid("owner_id").notNull().references(() => owners.id), walletId: uuid("wallet_id"), actionId: uuid("action_id"),
  kind: rewardRecordKind("kind").notNull(), type: rewardRecordType("type").notNull(), points: bigint("points", { mode: "bigint" }),
  cashMinor: bigint("cash_minor", { mode: "bigint" }), pointValueMicros: bigint("point_value_micros", { mode: "bigint" }), costMinor: bigint("cost_minor", { mode: "bigint" }),
  foregoneValueMinor: bigint("foregone_value_minor", { mode: "bigint" }), transactionId: uuid("transaction_id"), requestHash: text("request_hash").notNull(),
  source: text("source").notNull(), idempotencyKey: text("idempotency_key").notNull(), occurredAt: instant("occurred_at").notNull().defaultNow(), notes: text("notes"), createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.walletId, t.ownerId], foreignColumns: [wallets.id, wallets.ownerId], name: "reward_wallet_owner_fk" }),
  foreignKey({ columns: [t.actionId, t.ownerId], foreignColumns: [actions.id, actions.ownerId], name: "reward_action_owner_fk" }),
  foreignKey({ columns: [t.transactionId, t.ownerId], foreignColumns: [pointTransactions.id, pointTransactions.ownerId], name: "reward_transaction_owner_fk" }),
  uniqueIndex("reward_action_acquired_once").on(t.ownerId, t.actionId).where(sql`${t.kind} = 'acquired' AND ${t.type} = 'points'`),
  unique("reward_idempotency").on(t.ownerId, t.idempotencyKey),
  check("reward_value_present", sql`${t.points} IS NOT NULL OR ${t.cashMinor} IS NOT NULL`),
  check("reward_nonnegative", sql`(${t.points} IS NULL OR ${t.points} >= 0) AND (${t.cashMinor} IS NULL OR ${t.cashMinor} >= 0) AND (${t.pointValueMicros} IS NULL OR ${t.pointValueMicros} >= 0) AND (${t.costMinor} IS NULL OR ${t.costMinor} >= 0) AND (${t.foregoneValueMinor} IS NULL OR ${t.foregoneValueMinor} >= 0)`),
]);

// V1.1 radar data is private operational data. It never participates in public DTO queries.
export const monitorSources = pgTable("monitor_sources", {
  id: id(), programId: uuid("program_id").references(() => programs.id), name: text("name").notNull(),
  url: text("url").notNull(), sourceType: monitorSourceType("source_type").notNull().default("web"),
  enabled: boolean("enabled").notNull().default(true), frequencyHours: integer("frequency_hours").notNull().default(12),
  selector: text("selector"), etag: text("etag"), lastModified: text("last_modified"), latestFingerprint: text("latest_fingerprint"),
  lastCheckedAt: instant("last_checked_at"), lastSuccessAt: instant("last_success_at"), errorMessage: text("error_message"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [unique("monitor_source_url").on(t.url), check("monitor_frequency_range", sql`${t.frequencyHours} BETWEEN 1 AND 168`), check("monitor_url_scheme", sql`${t.url} ~ '^https?://'`), index("monitor_source_due").on(t.enabled, t.lastCheckedAt)]);

export const monitorVersions = pgTable("monitor_versions", {
  id: id(), sourceId: uuid("source_id").notNull().references(() => monitorSources.id), version: integer("version").notNull(),
  fingerprint: text("fingerprint").notNull(), normalizedContent: text("normalized_content").notNull(), title: text("title"),
  httpStatus: integer("http_status").notNull(), contentType: text("content_type"), etag: text("etag"), lastModified: text("last_modified"),
  fetchedAt: instant("fetched_at").notNull(), createdAt: createdAt(),
}, (t) => [unique("monitor_version_number").on(t.sourceId, t.version), unique("monitor_source_fingerprint").on(t.sourceId, t.fingerprint), check("monitor_http_status", sql`${t.httpStatus} BETWEEN 100 AND 599`), index("monitor_versions_source").on(t.sourceId, t.createdAt)]);

export const monitorRuns = pgTable("monitor_runs", {
  id: id(), sourceId: uuid("source_id").notNull().references(() => monitorSources.id), status: monitorRunStatus("status").notNull(),
  httpStatus: integer("http_status"), attempt: integer("attempt").notNull().default(1), errorMessage: text("error_message"),
  startedAt: instant("started_at").notNull(), finishedAt: instant("finished_at"), createdAt: createdAt(),
}, (t) => [index("monitor_runs_source_time").on(t.sourceId, t.startedAt)]);

export const radarEvents = pgTable("radar_events", {
  id: id(), sourceId: uuid("source_id").notNull().references(() => monitorSources.id), previousVersionId: uuid("previous_version_id").references(() => monitorVersions.id),
  newVersionId: uuid("new_version_id").notNull().references(() => monitorVersions.id), status: radarReviewStatus("status").notNull().default("pending"),
  summary: text("summary").notNull(), diff: jsonb("diff").$type<{ added: string[]; removed: string[]; changed: string[] }>().notNull().default({ added: [], removed: [], changed: [] }),
  detectedAt: instant("detected_at").notNull(), reviewedAt: instant("reviewed_at"), reviewedBy: text("reviewed_by"), duplicateOf: uuid("duplicate_of"), promotionId: uuid("promotion_id").references(() => promotions.id),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [unique("radar_event_version").on(t.sourceId, t.newVersionId), index("radar_events_status").on(t.status, t.detectedAt)]);

export const aiExtractionTasks = pgTable("ai_extraction_tasks", {
  id: id(), sourceId: uuid("source_id").references(() => monitorSources.id), radarEventId: uuid("radar_event_id").references(() => radarEvents.id), promotionId: uuid("promotion_id").references(() => promotions.id),
  inputType: aiInputType("input_type").notNull(), sourceUrl: text("source_url"), sourceText: text("source_text"), sourceMime: text("source_mime"),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}), status: aiTaskStatus("status").notNull().default("ready_for_review"),
  provider: text("provider"), model: text("model"), errorMessage: text("error_message"), createdBy: text("created_by").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("ai_tasks_status").on(t.status, t.createdAt), check("ai_source_required", sql`${t.sourceUrl} IS NOT NULL OR ${t.sourceText} IS NOT NULL OR ${t.sourceMime} IS NOT NULL`)]);
