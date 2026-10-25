import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDatabase, type Database } from "@/db/client";
import { actionTasks, actions, auditLogs, owners, pointBatches, pointTransactions, programs, promotionVersions, promotions, rewardRecords, savedScenarios, wallets } from "@/db/schema";
import { requireOwner } from "./auth";
import { z } from "zod";
import { evaluateQualification } from "@/modules/decision/qualification";
import { scenarioOpportunityBasis } from "./opportunity-service";

const integerString = z.string().regex(/^\d{1,19}$/).refine((v) => BigInt(v) <= 9223372036854775807n);
const positiveBigInt = integerString.transform((value) => BigInt(value)).refine((v) => v > 0n);
const calculatorType = z.enum(["rate-comparison", "offer-comparison", "activity-reward"]);

const benefitSchema = z.object({ name: z.string().min(1).max(200), kind: z.string().min(1).max(80), expiresAt: z.string().datetime({ offset: true }).nullable().default(null), usedAt: z.string().datetime({ offset: true }).nullable().default(null) });
export const membershipInputSchema = z.object({
  programCode: z.string().min(1).max(80), membershipTier: z.string().max(80).nullable().optional(),
  pointsValidUntil: z.string().datetime({ offset: true }).nullable().optional(), tierExpiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  benefits: z.array(benefitSchema).max(50).optional(), cardHeld: z.boolean().nullable().optional(), cardType: z.string().max(120).nullable().optional(), notes: z.string().max(2000).nullable().optional(),
});

export const pointsInputSchema = z.object({
  programCode: z.string().min(1).max(80), source: z.string().min(1).max(200), sourceType: z.string().max(80).default("other"),
  points: positiveBigInt, earnedAt: z.string().datetime({ offset: true }).optional(), expiresAt: z.string().datetime({ offset: true }).nullable().optional(), expiryStatus: z.enum(["unknown", "known", "never"]).default("unknown"),
  promotionId: z.string().uuid().nullable().optional(), evidenceNote: z.string().max(2000).nullable().optional(), idempotencyKey: z.string().min(1).max(160),
});

export const consumeInputSchema = z.object({ programCode: z.string().min(1).max(80), points: positiveBigInt, idempotencyKey: z.string().min(1).max(160), note: z.string().max(2000).optional(), referenceId: z.string().uuid().nullable().optional() });
export const adjustmentInputSchema = z.object({ programCode: z.string().min(1).max(80), points: z.string().regex(/^-?\d{1,19}$/).transform((value) => BigInt(value)).refine((value) => value !== 0n && value >= -9223372036854775807n && value <= 9223372036854775807n), source: z.string().min(1).max(200), idempotencyKey: z.string().min(1).max(160), note: z.string().max(2000).optional() });
export const expireInputSchema = z.object({ batchId: z.string().uuid(), idempotencyKey: z.string().min(1).max(160) });
export const actionInputSchema = z.object({ promotionId: z.string().uuid(), cycleKey: z.string().min(1).max(80).default("default"), status: z.enum(["saved", "planned", "registered", "participating"]).default("planned"), notes: z.string().max(2000).nullable().optional() });
export const taskInputSchema = z.object({ title: z.string().min(1).max(240), actionId: z.string().uuid().nullable().optional(), pointBatchId: z.string().uuid().nullable().optional(), deadlineAt: z.string().datetime({ offset: true }).nullable().optional(), deadlineSource: z.enum(["official", "rule-derived", "manual", "unconfirmed"]).default("unconfirmed"), priority: z.number().int().min(1).max(3).default(2), notes: z.string().max(2000).nullable().optional(), draftKey: z.string().min(1).max(200).nullable().optional() });
export const scenarioInputSchema = z.object({ name: z.string().min(1).max(160), notes: z.string().max(2000).nullable().optional(), calculatorType, inputSnapshot: z.record(z.string(), z.unknown()), quotedAt: z.string().datetime({ offset: true }).nullable().optional(), quoteSource: z.string().max(240).nullable().optional(), pointValueMicros: integerString.nullable().optional(), ruleVersionIds: z.array(z.string().uuid()).max(50).default([]), ruleSnapshots: z.array(z.record(z.string(), z.unknown())).max(50).default([]), membershipSnapshot: z.record(z.string(), z.unknown()).default({}), result: z.record(z.string(), z.unknown()), assumptions: z.array(z.string().max(500)).max(100).default([]), unresolved: z.array(z.string().max(500)).max(100).default([]), idempotencyKey: z.string().min(1).max(160).optional() });
export const scenarioMetadataSchema = z.object({ name: z.string().min(1).max(160), notes: z.string().max(2000).nullable().optional() });
export const membershipCheckSchema = z.object({ programCode: z.string().min(1).max(80), requiredTiers: z.array(z.string().min(1).max(80)).max(20), cardRequired: z.boolean().default(false) });
export const realizedInputSchema = z.object({ programCode: z.string().min(1).max(80), actionId: z.string().uuid().nullable().optional(), points: integerString.transform(BigInt), cashMinor: integerString.nullable().optional(), pointValueMicros: integerString.nullable().optional(), costMinor: integerString.nullable().optional(), foregoneValueMinor: integerString.nullable().optional(), source: z.string().min(1).max(200).default("积分兑换"), idempotencyKey: z.string().min(1).max(160), note: z.string().max(2000).nullable().optional() });

function date(value?: string | null) { return value ? new Date(value) : null; }
function requestHash(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (typeof item === "bigint") return item.toString();
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return item;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function assertSameRequest(existingHash: string | null | undefined, value: unknown) {
  if (existingHash !== requestHash(value)) throw new Error("幂等键已用于不同请求");
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
// All ledger mutations lock the Owner first, before any wallet/action/batch.
// This also serializes different operation types using the same idempotency key.
async function ownerTransaction<T>(db: Database, ownerId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.select({ id: owners.id }).from(owners).where(eq(owners.id, ownerId)).for("update");
    return work(tx);
  });
}
async function audit(tx: Tx, ownerId: string, operation: string, entityType: string, entityId: string, changedFields: string[]) {
  await tx.insert(auditLogs).values({ actorOwnerId: ownerId, operation, entityType, entityId, changedFields });
}

async function walletFor(tx: Tx, ownerId: string, programCode: string) {
  const program = (await tx.select().from(programs).where(eq(programs.code, programCode)).limit(1))[0];
  if (!program) throw new Error("会员计划不存在");
  await tx.insert(wallets).values({ ownerId, programId: program.id }).onConflictDoNothing({ target: [wallets.ownerId, wallets.programId] });
  const wallet = (await tx.select().from(wallets).where(and(eq(wallets.ownerId, ownerId), eq(wallets.programId, program.id))).limit(1))[0];
  if (!wallet) throw new Error("无法创建会员钱包");
  return { wallet, program };
}

export async function checkMembershipConditions(input: z.input<typeof membershipCheckSchema>) {
  const owner = await requireOwner(); const value = membershipCheckSchema.parse(input);
  const current = (await getDatabase().select({ wallet: wallets }).from(wallets).innerJoin(programs, eq(wallets.programId, programs.id)).where(and(eq(wallets.ownerId, owner.id), eq(programs.code, value.programCode))).limit(1))[0]?.wallet;
  const tier = current?.membershipTier;
  const membershipTier = !tier || tier === "未知" || (current?.tierExpiresAt && current.tierExpiresAt <= new Date()) ? undefined : tier;
  const facts = { membershipTier, cardHeld: current?.cardHeld ?? undefined };
  const result = evaluateQualification(facts, { membershipTiers: value.requiredTiers, cardRequired: value.cardRequired });
  if (!value.requiredTiers.length && !value.cardRequired) return { status: "information-insufficient", reasons: ["尚未填写需要核对的条件"], facts };
  return { ...result, facts, limitation: "仅核对本次列出的会员条件，其他酒店、渠道、报名和消费条件仍需核实；未经锦江官方账户验证。" };
}

export async function upsertMembership(input: z.input<typeof membershipInputSchema>) {
  const owner = await requireOwner(); const value = membershipInputSchema.parse(input); const db = getDatabase();
  const result = await ownerTransaction(db, owner.id, async (tx) => {
    const { wallet, program } = await walletFor(tx, owner.id, value.programCode);
    const updated = (await tx.update(wallets).set({ membershipTier: value.membershipTier, pointsValidUntil: value.pointsValidUntil === undefined ? undefined : date(value.pointsValidUntil), tierExpiresAt: value.tierExpiresAt === undefined ? undefined : date(value.tierExpiresAt), benefits: value.benefits, cardHeld: value.cardHeld, cardType: value.cardType, notes: value.notes, lastVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(wallets.id, wallet.id)).returning())[0];
    await audit(tx, owner.id, "update", "wallet", wallet.id, Object.keys(value));
    return { wallet: updated, program };
  });
  return result;
}

function validateExpiry(input: z.output<typeof pointsInputSchema>) {
  if ((input.expiryStatus === "known") !== Boolean(input.expiresAt)) throw new Error("仅已确认到期的积分可以且必须填写到期日");
  if (input.expiresAt && new Date(input.expiresAt) <= new Date(input.earnedAt ?? Date.now())) throw new Error("到期日必须晚于到账日");
  if (input.earnedAt && new Date(input.earnedAt).getTime() > Date.now() + 60_000) throw new Error("预计到账不能登记为实际到账");
}
async function creditPointsTx(tx: Tx, ownerId: string, input: z.output<typeof pointsInputSchema>, extra?: { actionId?: string; kind?: "credit" | "adjustment"; referenceType?: string; requestValue?: unknown }) {
  validateExpiry(input);
  const request = { operation: extra?.referenceType ?? extra?.kind ?? "credit", input: extra?.requestValue ?? input };
  const existing = (await tx.select().from(pointTransactions).where(and(eq(pointTransactions.ownerId, ownerId), eq(pointTransactions.idempotencyKey, input.idempotencyKey))).limit(1))[0];
  if (existing) {
    assertSameRequest(existing.requestHash, request);
    const batch = (await tx.select().from(pointBatches).where(and(eq(pointBatches.ownerId, ownerId), eq(pointBatches.id, existing.batchId!))).limit(1))[0];
    if (!batch) throw new Error("到账关联批次缺失");
    return { batch, transaction: existing, idempotent: true };
  }
  const { wallet, program } = await walletFor(tx, ownerId, input.programCode);
  const creditedAt = date(input.earnedAt) ?? new Date();
  const batch = (await tx.insert(pointBatches).values({ ownerId, walletId: wallet.id, programId: program.id, promotionId: input.promotionId ?? null, source: input.source, sourceType: input.sourceType, earnedPoints: input.points, remainingPoints: input.points, earnedAt: creditedAt, creditedAt, expiresAt: date(input.expiresAt), expiryStatus: input.expiryStatus, evidenceNote: input.evidenceNote ?? null, idempotencyKey: input.idempotencyKey }).returning())[0];
  const transaction = (await tx.insert(pointTransactions).values({ ownerId, walletId: wallet.id, batchId: batch.id, kind: extra?.kind ?? "credit", points: input.points, requestHash: requestHash(request), idempotencyKey: input.idempotencyKey, referenceType: extra?.referenceType ?? "credit", referenceId: extra?.actionId ?? input.promotionId ?? null, note: input.evidenceNote ?? input.source, allocations: [{ batchId: batch.id, delta: input.points.toString(), remainingAfter: input.points.toString() }] }).returning())[0];
  await audit(tx, ownerId, "credit", "point_batch", batch.id, ["earnedPoints", "remainingPoints", "expiryStatus", "expiresAt"]);
  return { batch, transaction, idempotent: false };
}

export async function addPoints(input: z.input<typeof pointsInputSchema>) {
  const owner = await requireOwner(); const value = pointsInputSchema.parse(input);
  validateExpiry(value);
  return ownerTransaction(getDatabase(), owner.id, (tx) => creditPointsTx(tx, owner.id, value));
}

export async function adjustPoints(input: z.input<typeof adjustmentInputSchema>) {
  const owner = await requireOwner(); const value = adjustmentInputSchema.parse(input); const db = getDatabase();
  if (value.points > 0n) {
    const credit = pointsInputSchema.parse({ programCode: value.programCode, source: value.source, sourceType: "manual_adjustment", points: value.points.toString(), expiryStatus: "unknown", evidenceNote: value.note ?? "手动正向调整", idempotencyKey: value.idempotencyKey });
    return ownerTransaction(db, owner.id, (tx) => creditPointsTx(tx, owner.id, credit, { kind: "adjustment", referenceType: "manual_adjustment", requestValue: value }));
  }
  return ownerTransaction(db, owner.id, async (tx) => {
    const { wallet } = await walletFor(tx, owner.id, value.programCode);
    const consumed = await consumePointsTx({ programCode: value.programCode, points: (-value.points).toString(), idempotencyKey: value.idempotencyKey, note: value.note ?? value.source }, tx, owner.id, wallet.id, { kind: "adjustment", requestValue: value });
    return { points: value.points, idempotent: consumed.idempotent, allocations: consumed.allocations };
  });
}

export async function consumePoints(input: z.input<typeof consumeInputSchema>) {
  const owner = await requireOwner(); const value = consumeInputSchema.parse(input); const db = getDatabase();
  return ownerTransaction(db, owner.id, async (tx) => {
    const { wallet } = await walletFor(tx, owner.id, value.programCode);
    return { points: value.points, ...await consumePointsTx({ ...value, points: value.points.toString() }, tx, owner.id, wallet.id) };
  });
}

export async function expirePoints(input: z.input<typeof expireInputSchema>) {
  const owner = await requireOwner(); const value = expireInputSchema.parse(input); const request = { operation: "expire", batchId: value.batchId };
  return ownerTransaction(getDatabase(), owner.id, async (tx) => {
    const existing = (await tx.select().from(pointTransactions).where(and(eq(pointTransactions.ownerId, owner.id), eq(pointTransactions.idempotencyKey, value.idempotencyKey))).limit(1))[0];
    if (existing) { assertSameRequest(existing.requestHash, request); return { points: -existing.points, idempotent: true }; }
    const batch = (await tx.select().from(pointBatches).where(and(eq(pointBatches.id, value.batchId), eq(pointBatches.ownerId, owner.id))).for("update"))[0];
    if (!batch) throw new Error("积分批次不存在");
    if (batch.expiryStatus !== "known" || !batch.expiresAt || batch.expiresAt > new Date()) throw new Error("只有已确认且已到期的积分批次可以登记过期");
    const points = batch.remainingPoints; if (points === 0n) return { points, idempotent: true };
    const record = (await tx.insert(pointTransactions).values({ ownerId: owner.id, walletId: batch.walletId, batchId: batch.id, kind: "expire", points: -points, requestHash: requestHash(request), idempotencyKey: value.idempotencyKey, referenceType: "expiry", note: "积分到期", allocations: [{ batchId: batch.id, delta: (-points).toString(), remainingAfter: "0" }] }).returning())[0];
    await tx.update(pointBatches).set({ remainingPoints: 0n, updatedAt: new Date() }).where(eq(pointBatches.id, batch.id));
    await audit(tx, owner.id, "expire", "point_transaction", record.id, ["points", "allocations"]);
    return { points, idempotent: false };
  });
}

export async function createPromotionAction(input: z.input<typeof actionInputSchema>) {
  const owner = await requireOwner(); const value = actionInputSchema.parse(input); const db = getDatabase();
  return ownerTransaction(db, owner.id, async (tx) => {
    const promotion = (await tx.select().from(promotions).where(and(eq(promotions.id, value.promotionId), eq(promotions.publicationStatus, "published"))).limit(1))[0];
    if (!promotion) throw new Error("活动不存在或未发布"); const program = (await tx.select().from(programs).where(eq(programs.id, promotion.programId)).limit(1))[0];
    if (!program) throw new Error("会员计划不存在"); const { wallet } = await walletFor(tx, owner.id, program.code);
    const version = (await tx.select().from(promotionVersions).where(eq(promotionVersions.promotionId, promotion.id)).orderBy(desc(promotionVersions.version)).limit(1))[0];
    const action = (await tx.insert(actions).values({ ownerId: owner.id, promotionId: promotion.id, walletId: wallet.id, programId: promotion.programId, promotionVersionId: version?.id ?? null, ruleVersionId: promotion.ruleVersionId, cycleKey: value.cycleKey, status: value.status, participationAt: new Date(), expectedRewardPoints: promotion.rewardUnit?.includes("积分") ? promotion.rewardAmount : null, notes: value.notes ?? null }).onConflictDoNothing({ target: [actions.ownerId, actions.promotionId, actions.cycleKey] }).returning())[0];
    let current = action ?? (await tx.select().from(actions).where(and(eq(actions.ownerId, owner.id), eq(actions.promotionId, promotion.id), eq(actions.cycleKey, value.cycleKey))).limit(1))[0];
    if (!current) throw new Error("无法保存活动计划");
    if (!action && current.status === "saved" && value.status !== "saved") current = (await tx.update(actions).set({ status: value.status, updatedAt: new Date() }).where(eq(actions.id, current.id)).returning())[0] ?? current;
    // Task drafts require explicit Owner confirmation before creation.
    if (action || (current.status === value.status && value.status !== "saved")) await audit(tx, owner.id, action ? "create" : "update", "action", current.id, ["promotionId", "cycleKey", "status"]);
    return { action: current, idempotent: !action };
  });
}

export const actionUpdateSchema = z.object({ status: z.enum(["reward_credited", "saved", "planned", "registered", "participating", "in_progress", "likely_qualified", "qualified", "awaiting_reward", "claimed", "completed", "abandoned", "failed", "expired", "cancelled"]), notes: z.string().max(2000).nullable().optional(), progress: z.record(z.string(), z.unknown()).optional(), expectedRewardPoints: integerString.nullable().optional() });
export async function updateAction(actionId: string, status: string, notes?: string | null, extra: { progress?: Record<string, unknown>; expectedRewardPoints?: string | null } = {}) {
  const owner = await requireOwner(); z.string().uuid().parse(actionId); const value = actionUpdateSchema.parse({ status, notes, ...extra });
  return ownerTransaction(getDatabase(), owner.id, async (tx) => {
    const existing = (await tx.select().from(actions).where(and(eq(actions.id, actionId), eq(actions.ownerId, owner.id))).limit(1))[0];
    if (!existing) throw new Error("活动记录不存在");
    if (value.status === "reward_credited" && !existing.rewardCreditedAt) throw new Error("请通过实际奖励到账操作确认，不能仅修改状态");
    const row = (await tx.update(actions).set({ status: value.status, notes: value.notes, progress: value.progress, expectedRewardPoints: value.expectedRewardPoints === undefined ? undefined : value.expectedRewardPoints === null ? null : BigInt(value.expectedRewardPoints), claimedAt: value.status === "claimed" ? existing.claimedAt ?? new Date() : undefined, updatedAt: new Date() }).where(eq(actions.id, actionId)).returning())[0];
    await audit(tx, owner.id, "update", "action", actionId, Object.keys(value)); return row;
  });
}

export async function createTask(input: z.input<typeof taskInputSchema>) {
  const owner = await requireOwner(); const value = taskInputSchema.parse(input);
  if (value.deadlineSource !== "unconfirmed" && !value.deadlineAt) throw new Error("已确认、推算或人工截止时间必须填写日期");
  return ownerTransaction(getDatabase(), owner.id, async (tx) => {
    if (value.actionId && !(await tx.select({ id: actions.id }).from(actions).where(and(eq(actions.id, value.actionId), eq(actions.ownerId, owner.id))).limit(1))[0]) throw new Error("活动记录不存在");
    if (value.pointBatchId && !(await tx.select({ id: pointBatches.id }).from(pointBatches).where(and(eq(pointBatches.id, value.pointBatchId), eq(pointBatches.ownerId, owner.id))).limit(1))[0]) throw new Error("积分批次不存在");
    if (value.draftKey) { const existing = (await tx.select().from(actionTasks).where(and(eq(actionTasks.ownerId, owner.id), eq(actionTasks.draftKey, value.draftKey))).limit(1))[0]; if (existing) return existing; }
    const row = (await tx.insert(actionTasks).values({ ...value, ownerId: owner.id, deadlineAt: date(value.deadlineAt) }).returning())[0];
    await audit(tx, owner.id, "create", "task", row.id, ["title", "deadlineAt", "deadlineSource"]); return row;
  });
}
export async function completeTask(taskId: string) {
  const owner = await requireOwner(); z.string().uuid().parse(taskId);
  return ownerTransaction(getDatabase(), owner.id, async (tx) => {
    const existing = (await tx.select().from(actionTasks).where(and(eq(actionTasks.id, taskId), eq(actionTasks.ownerId, owner.id))).limit(1))[0];
    if (!existing) throw new Error("待办不存在"); if (existing.status === "completed") return existing;
    const row = (await tx.update(actionTasks).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(actionTasks.id, taskId)).returning())[0];
    await audit(tx, owner.id, "complete", "task", taskId, ["status", "completedAt"]); return row;
  });
}

export async function saveScenario(input: z.input<typeof scenarioInputSchema>) {
  const owner = await requireOwner(); const value = scenarioInputSchema.parse(input); const key = value.idempotencyKey ?? crypto.randomUUID();
  const opportunityFingerprint = await scenarioOpportunityBasis(value.inputSnapshot.promotionId ?? value.inputSnapshot.promotionRef, value.ruleVersionIds);
  return ownerTransaction(getDatabase(), owner.id, async (tx) => {
    const existing = (await tx.select().from(savedScenarios).where(and(eq(savedScenarios.ownerId, owner.id), eq(savedScenarios.idempotencyKey, key))).limit(1))[0];
    if (existing) { assertSameRequest(existing.requestHash, value); return existing; }
    const ownerWallets = await tx.select().from(wallets).where(eq(wallets.ownerId, owner.id));
    const membershipSnapshot = JSON.parse(JSON.stringify({ ...value.membershipSnapshot, ownerWallets, verification: "Owner 手动填写，未经官方验证" }));
    const row = (await tx.insert(savedScenarios).values({ ownerId: owner.id, name: value.name, notes: value.notes ?? null, calculatorType: value.calculatorType, inputSnapshot: { ...value.inputSnapshot, opportunityFingerprint }, quotedAt: date(value.quotedAt), quoteSource: value.quoteSource ?? null, pointValueMicros: value.pointValueMicros == null ? null : BigInt(value.pointValueMicros), ruleVersionIds: value.ruleVersionIds, result: value.result, ruleSnapshots: value.ruleSnapshots, membershipSnapshot, idempotencyKey: key, requestHash: requestHash(value), assumptions: value.assumptions, unresolved: value.unresolved }).returning())[0];
    await audit(tx, owner.id, "create", "saved_scenario", row.id, ["inputSnapshot", "result", "ruleSnapshots", "membershipSnapshot"]); return row;
  });
}
export async function updateScenarioMetadata(id: string, input: z.input<typeof scenarioMetadataSchema>) {
  const owner = await requireOwner(); z.string().uuid().parse(id); const value = scenarioMetadataSchema.parse(input);
  return ownerTransaction(getDatabase(), owner.id, async (tx) => {
    const row = (await tx.update(savedScenarios).set({ name: value.name, notes: value.notes, updatedAt: new Date() }).where(and(eq(savedScenarios.id, id), eq(savedScenarios.ownerId, owner.id))).returning())[0];
    if (!row) throw new Error("方案不存在"); await audit(tx, owner.id, "update_metadata", "saved_scenario", id, Object.keys(value)); return row;
  });
}
export async function listScenarios() { const owner = await requireOwner(); return getDatabase().select().from(savedScenarios).where(eq(savedScenarios.ownerId, owner.id)).orderBy(desc(savedScenarios.createdAt)); }
export async function deleteScenario(id: string) {
  const owner = await requireOwner(); z.string().uuid().parse(id);
  return ownerTransaction(getDatabase(), owner.id, async (tx) => {
    const row = (await tx.delete(savedScenarios).where(and(eq(savedScenarios.id, id), eq(savedScenarios.ownerId, owner.id))).returning({ id: savedScenarios.id }))[0];
    if (!row) throw new Error("方案不存在"); await audit(tx, owner.id, "delete", "saved_scenario", id, []); return row;
  });
}

export const rewardCreditOptionsSchema = z.object({ earnedAt: z.string().datetime({ offset: true }).optional(), expiresAt: z.string().datetime({ offset: true }).nullable().optional(), expiryStatus: z.enum(["unknown", "known", "never"]).default("unknown"), evidenceNote: z.string().max(2000).nullable().optional() });
export const rewardCreditSchema = rewardCreditOptionsSchema.extend({ actionId: z.string().uuid(), idempotencyKey: z.string().min(1).max(160), actualPoints: integerString.optional() });
export async function creditReward(actionId: string, idempotencyKey: string, actualPoints?: bigint, options: z.input<typeof rewardCreditOptionsSchema> = {}) {
  const owner = await requireOwner(); z.string().uuid().parse(actionId); z.string().min(1).max(160).parse(idempotencyKey); const details = rewardCreditOptionsSchema.parse(options);
  return ownerTransaction(getDatabase(), owner.id, async (tx) => {
    const action = (await tx.select().from(actions).where(and(eq(actions.id, actionId), eq(actions.ownerId, owner.id))).for("update"))[0];
    if (!action) throw new Error("活动记录不存在");
    const points = actualPoints ?? action.actualRewardPoints ?? action.expectedRewardPoints ?? 0n; positiveBigInt.parse(points.toString());
    const request = { actionId, points: points.toString(), ...details };
    const keyed = (await tx.select().from(rewardRecords).where(and(eq(rewardRecords.ownerId, owner.id), eq(rewardRecords.idempotencyKey, idempotencyKey))).limit(1))[0];
    if (keyed) { assertSameRequest(keyed.requestHash, request); return { points: keyed.points!, idempotent: true }; }
    const prior = (await tx.select().from(rewardRecords).where(and(eq(rewardRecords.ownerId, owner.id), eq(rewardRecords.actionId, actionId), eq(rewardRecords.kind, "acquired"))).limit(1))[0];
    if (prior || action.rewardCreditedAt) {
      if (points !== (prior?.points ?? action.actualRewardPoints)) throw new Error("该活动奖励已到账，不能用不同积分数重复确认");
      return { points, idempotent: true };
    }
    const program = (await tx.select().from(programs).where(eq(programs.id, action.programId)).limit(1))[0];
    const input = pointsInputSchema.parse({ ...details, programCode: program.code, source: "活动奖励到账", sourceType: "activity_reward", points: points.toString(), promotionId: action.promotionId, evidenceNote: details.evidenceNote ?? `Owner 手动确认到账；个人活动 ${actionId}`, idempotencyKey });
    const credited = await creditPointsTx(tx, owner.id, input, { actionId, referenceType: "activity_reward", requestValue: request });
    await tx.update(actions).set({ status: "reward_credited", actualRewardPoints: points, rewardCreditedAt: credited.batch.creditedAt, updatedAt: new Date() }).where(eq(actions.id, actionId));
    await tx.insert(rewardRecords).values({ ownerId: owner.id, walletId: action.walletId, actionId, kind: "acquired", type: "points", points, transactionId: credited.transaction.id, requestHash: requestHash(request), source: "活动奖励到账", idempotencyKey, occurredAt: credited.batch.creditedAt, notes: input.evidenceNote });
    await audit(tx, owner.id, "reward_credit", "action", actionId, ["actualRewardPoints", "rewardCreditedAt", "status"]);
    return { batch: credited.batch, points, idempotent: false };
  });
}

export async function recordRealized(input: z.input<typeof realizedInputSchema>) {
  const owner = await requireOwner(); const value = realizedInputSchema.parse(input); const db = getDatabase();
  if (value.points === 0n && value.cashMinor == null) throw new Error("需要积分消耗或实际现金金额");
  if (value.cashMinor != null && !value.note?.trim()) throw new Error("请注明实际现金节省的比较依据");
  const points = value.points; const cashMinor = value.cashMinor ? BigInt(value.cashMinor) : null;
  const pointValueMicros = value.pointValueMicros ? BigInt(value.pointValueMicros) : null;
  const costMinor = value.costMinor ? BigInt(value.costMinor) : null; const foregoneValueMinor = value.foregoneValueMinor ? BigInt(value.foregoneValueMinor) : null;
  return ownerTransaction(db, owner.id, async (tx) => {
    const existing = (await tx.select().from(rewardRecords).where(and(eq(rewardRecords.ownerId, owner.id), eq(rewardRecords.idempotencyKey, value.idempotencyKey))).limit(1))[0];
    if (existing) { assertSameRequest(existing.requestHash, value); return { record: existing, idempotent: true }; }
    const { wallet, program } = await walletFor(tx, owner.id, value.programCode);
    let actionId: string | null = value.actionId ?? null; let walletId = wallet.id;
    if (actionId) {
      const action = (await tx.execute(sql`SELECT id, wallet_id, program_id FROM actions WHERE id = ${actionId} AND owner_id = ${owner.id} FOR UPDATE`) as unknown as Array<{ id: string; wallet_id: string; program_id: string }>)[0];
      if (!action || action.program_id !== program.id) throw new Error("活动记录不存在或会员计划不匹配");
      walletId = action.wallet_id;
    } else actionId = null;
    const transactionKey = value.idempotencyKey;
    const consumeValue = { programCode: program.code, points: points.toString(), idempotencyKey: transactionKey, referenceId: actionId, note: value.note ?? "积分兑换" };
    if (points > 0n) await consumePointsTx(consumeValue, tx, owner.id, walletId, { requestValue: value });
    else { const used = (await tx.select().from(pointTransactions).where(and(eq(pointTransactions.ownerId, owner.id), eq(pointTransactions.idempotencyKey, transactionKey))).limit(1))[0]; if (used) throw new Error("幂等键已用于不同请求"); }
    const transaction = (await tx.select({ id: pointTransactions.id }).from(pointTransactions).where(and(eq(pointTransactions.ownerId, owner.id), eq(pointTransactions.idempotencyKey, transactionKey))).limit(1))[0];
    const inserted = await tx.insert(rewardRecords).values({ ownerId: owner.id, walletId, actionId, kind: "realized", type: cashMinor === null ? "points" : "cash_saving", points, cashMinor, pointValueMicros, costMinor, foregoneValueMinor, transactionId: transaction?.id ?? null, requestHash: requestHash(value), source: value.source, idempotencyKey: value.idempotencyKey, notes: value.note ?? "已记录积分消耗；现金节省仅按填写的可比较金额计入" }).onConflictDoNothing({ target: [rewardRecords.ownerId, rewardRecords.idempotencyKey] }).returning();
    const record = inserted[0] ?? (await tx.select().from(rewardRecords).where(and(eq(rewardRecords.ownerId, owner.id), eq(rewardRecords.idempotencyKey, value.idempotencyKey))).limit(1))[0];
    if (!record) throw new Error("无法保存兑现记录"); assertSameRequest(record.requestHash, value); return { record, idempotent: !inserted.length };
  });
}
async function consumePointsTx(input: z.input<typeof consumeInputSchema>, tx: Tx, ownerId: string, walletId: string, options: { kind?: "debit" | "adjustment"; requestValue?: unknown } = {}) {
  const value = consumeInputSchema.parse(input); const kind = options.kind ?? "debit";
  const hashValue = { operation: kind === "adjustment" ? "adjust" : options.requestValue ? "realize" : "consume", input: options.requestValue ?? value };
  const existing = (await tx.select().from(pointTransactions).where(and(eq(pointTransactions.ownerId, ownerId), eq(pointTransactions.idempotencyKey, value.idempotencyKey))).limit(1))[0];
  if (existing) { assertSameRequest(existing.requestHash, hashValue); return { transaction: existing, idempotent: true, allocations: existing.allocations }; }
  if (value.referenceId && !(await tx.select({ id: actions.id }).from(actions).where(and(eq(actions.id, value.referenceId), eq(actions.ownerId, ownerId), eq(actions.walletId, walletId))).limit(1))[0]) throw new Error("活动记录不存在或会员计划不匹配");
  const rows = await tx.select().from(pointBatches).where(and(eq(pointBatches.ownerId, ownerId), eq(pointBatches.walletId, walletId), sql`${pointBatches.remainingPoints} > 0 AND (${pointBatches.expiresAt} IS NULL OR ${pointBatches.expiresAt} > CURRENT_TIMESTAMP)`)).orderBy(sql`${pointBatches.expiresAt} ASC NULLS LAST`, asc(pointBatches.earnedAt), asc(pointBatches.id)).for("update");
  let left = value.points;
  const allocations: Array<{ batchId: string; delta: string; remainingAfter: string }> = [];
  for (const batch of rows) {
    if (left === 0n) break;
    const used = batch.remainingPoints < left ? batch.remainingPoints : left;
    const remaining = batch.remainingPoints - used;
    await tx.update(pointBatches).set({ remainingPoints: remaining, updatedAt: new Date() }).where(eq(pointBatches.id, batch.id));
    allocations.push({ batchId: batch.id, delta: (-used).toString(), remainingAfter: remaining.toString() }); left -= used;
  }
  if (left > 0n) throw new Error("可用积分不足或积分已过期");
  const transaction = (await tx.insert(pointTransactions).values({ ownerId, walletId, kind, points: -value.points, requestHash: requestHash(hashValue), idempotencyKey: value.idempotencyKey, referenceType: kind === "adjustment" ? "manual_adjustment" : "redemption", referenceId: value.referenceId, note: value.note, allocations }).returning())[0];
  await audit(tx, ownerId, kind, "point_transaction", transaction.id, ["points", "allocations"]);
  return { transaction, idempotent: false, allocations };
}

export async function dashboard() {
  const owner = await requireOwner(); const db = getDatabase();
  return db.transaction(async (tx) => {
    const now = new Date(); const soon = new Date(now.getTime() + 30 * 86400000);
    const walletRows = await tx.select({ wallet: wallets, program: programs }).from(wallets).innerJoin(programs, eq(wallets.programId, programs.id)).where(eq(wallets.ownerId, owner.id));
    const batchRows = await tx.select().from(pointBatches).where(eq(pointBatches.ownerId, owner.id)).orderBy(asc(pointBatches.expiresAt), asc(pointBatches.earnedAt));
    const actionRows = await tx.select({ action: actions, promotion: promotions }).from(actions).innerJoin(promotions, eq(actions.promotionId, promotions.id)).where(eq(actions.ownerId, owner.id)).orderBy(desc(actions.updatedAt));
    const taskRows = await tx.select().from(actionTasks).where(eq(actionTasks.ownerId, owner.id)).orderBy(sql`${actionTasks.deadlineAt} ASC NULLS LAST`, asc(actionTasks.priority));
    const scenarioRows = await tx.select().from(savedScenarios).where(eq(savedScenarios.ownerId, owner.id)).orderBy(desc(savedScenarios.createdAt));
    const rewardRows = await tx.select().from(rewardRecords).where(eq(rewardRecords.ownerId, owner.id)).orderBy(desc(rewardRecords.occurredAt));
    const txRows = await tx.select().from(pointTransactions).where(eq(pointTransactions.ownerId, owner.id)).orderBy(desc(pointTransactions.createdAt));
    const total = <T,>(rows: T[], value: (row: T) => bigint) => rows.reduce((sum, row) => sum + value(row), 0n);
    const usable = batchRows.filter((b) => !b.expiresAt || b.expiresAt > now);
    const active = actionRows.filter(({ action: a }) => !["saved", "reward_credited", "completed", "abandoned", "failed", "expired", "cancelled"].includes(a.status));
    const realized = rewardRows.filter((r) => r.kind === "realized");
    const cash = total(realized, (r) => r.cashMinor ?? 0n); const cost = total(realized, (r) => r.costMinor ?? 0n); const foregone = total(realized, (r) => r.foregoneValueMinor ?? 0n);
    const opportunity = total(realized, (r) => (r.points ?? 0n) * (r.pointValueMicros ?? 0n));
    const unvalued = realized.filter((r) => r.cashMinor === null || r.costMinor === null || r.foregoneValueMinor === null || ((r.points ?? 0n) > 0n && r.pointValueMicros === null)).length;
    const remaining = total(batchRows, (b) => b.remainingPoints); const ledger = total(txRows, (t) => t.points);
    return { owner, wallets: walletRows, batches: batchRows, actions: actionRows, tasks: taskRows, scenarios: scenarioRows, rewards: rewardRows, transactions: txRows,
      reconciliation: { batchRemainingPoints: remaining, ledgerPoints: ledger, unrecordedExpiredPoints: total(batchRows.filter((b) => b.expiresAt && b.expiresAt <= now), (b) => b.remainingPoints), balanced: remaining === ledger },
      summary: { availablePoints: total(usable, (b) => b.remainingPoints), expiringPoints: total(usable.filter((b) => b.expiresAt && b.expiresAt <= soon), (b) => b.remainingPoints), expectedPoints: total(active.filter(({ action: a }) => !a.rewardCreditedAt), ({ action: a }) => a.expectedRewardPoints ?? 0n), acquiredPoints: total(txRows.filter((t) => t.kind === "credit"), (t) => t.points), spentPoints: total(txRows.filter((t) => t.kind === "debit"), (t) => -t.points), expiredPoints: total(txRows.filter((t) => t.kind === "expire"), (t) => -t.points), realizedCashMinor: cash, costMinor: cost, foregoneValueMinor: foregone, pointOpportunityCostMicros: opportunity, netEconomicValueMicros: unvalued ? null : (cash - cost - foregone) * 10000n - opportunity, unvaluedRecordCount: unvalued, pendingRewardCount: active.filter(({ action: a }) => ["qualified", "awaiting_reward", "claimed"].includes(a.status) && !a.rewardCreditedAt).length, activeActionCount: active.length },
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
