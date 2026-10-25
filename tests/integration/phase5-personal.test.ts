import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "@/db/client";
import * as schema from "@/db/schema";
import { insertDemo } from "@/db/demo-seed";
import { requireTestDatabaseUrl } from "@/shared/env";

// Only identity and connection are substituted. Every mutation calls the actual
// service against PostgreSQL; SQL is fixture setup, inspection or fault injection.
const context = vi.hoisted(() => ({ db: undefined as Database | undefined, ownerId: "" }));
vi.mock("@/db/client", () => ({ getDatabase: () => {
  if (!context.db) throw new Error("Test database is not connected");
  return context.db;
} }));
vi.mock("@/modules/personal/auth", () => ({ requireOwner: async () => {
  if (!context.ownerId) throw new Error("Owner authentication required");
  return { id: context.ownerId, email: "phase5@test.travelwise.local" };
} }));
import {
  addPoints, adjustPoints, checkMembershipConditions, completeTask, consumePoints, createPromotionAction,
  createTask, creditReward, dashboard, deleteScenario, expirePoints,
  listScenarios, recordRealized, saveScenario, updateAction,
  updateScenarioMetadata, upsertMembership,
} from "@/modules/personal/service";

type Fixture = Awaited<ReturnType<typeof fixture>>;
let client: Sql;
let db: Database;
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const stable = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);

async function fixture() {
  const id = randomUUID();
  const ids = { owner: randomUUID(), program: randomUUID(), rule: randomUUID(), version: randomUUID(), promotion: randomUUID() };
  const programCode = `phase5-${id}`;
  await client`INSERT INTO programs (id, code, name, kind, points_name) VALUES (${ids.program}, ${programCode}, 'Phase 5 isolated fixture', 'hotel', '积分')`;
  await client`INSERT INTO owners (id, auth_subject) VALUES (${ids.owner}, ${`phase5-${id}@test.local`})`;
  await client`INSERT INTO rules (id, program_id, code, name) VALUES (${ids.rule}, ${ids.program}, 'phase5-rule', 'Phase 5 rule')`;
  await client`INSERT INTO rule_versions (id, rule_id, program_id, version, terms, valid_from, time_zone, publication_status, verification_status) VALUES (${ids.version}, ${ids.rule}, ${ids.program}, 1, ${JSON.stringify(["old immutable terms"])}::jsonb, ${iso(-90)}, 'UTC', 'published', 'official_verified')`;
  await client`INSERT INTO promotions (id, program_id, rule_version_id, slug, title, summary, category, publication_status, lifecycle_status, verification_status, starts_at, ends_at, claim_ends_at, time_zone, qualification, stacking, reward_amount, reward_unit) VALUES (${ids.promotion}, ${ids.program}, ${ids.version}, ${programCode}, 'Phase 5 fixture promotion', 'Fixture only', '测试', 'published', 'active', 'official_verified', ${iso(-30)}, ${iso(30)}, ${iso(45)}, 'UTC', 'unknown', 'unknown', 8000, '积分')`;
  await client`INSERT INTO promotion_versions (promotion_id, version, snapshot, revision_reason, actor) VALUES (${ids.promotion}, 1, ${JSON.stringify({ title: "Phase 5 fixture promotion", ruleVersionId: ids.version })}::jsonb, 'Fixture', 'test')`;
  return { ...ids, programCode };
}
async function asOwner<T>(f: Fixture, work: () => Promise<T>) {
  context.ownerId = f.owner;
  try { return await work(); } finally { context.ownerId = ""; }
}
function credit(f: Fixture, key: string, points = "100", extra: Record<string, unknown> = {}) {
  return addPoints({ programCode: f.programCode, source: "测试期初余额", sourceType: "initial_balance", points, expiryStatus: "unknown", idempotencyKey: key, ...extra });
}
function scenario(f: Fixture, key: string, extra: Record<string, unknown> = {}) {
  return {
    name: "历史计算依据", calculatorType: "activity-reward" as const,
    inputSnapshot: { plannedSpend: "3000.00", rewardPoints: "8000", promotionId: f.promotion },
    quotedAt: iso(-1), quoteSource: "人工报价凭证", pointValueMicros: "20000",
    ruleVersionIds: [f.version], ruleSnapshots: [{ id: f.version, version: 1, terms: ["old immutable terms"] }],
    membershipSnapshot: { tier: "白金", source: "Owner manual" },
    result: { expectedPoints: "8000", netValueMinor: "16000" },
    assumptions: ["人工积分估值"], unresolved: ["未核对官方账户"], idempotencyKey: key, ...extra,
  };
}

if (!process.env.TEST_DATABASE_URL) {
  describe("Phase 5 actual PostgreSQL services", () => it("BLOCKED: TEST_DATABASE_URL is required", () => {
    throw new Error("BLOCKED: TEST_DATABASE_URL is required");
  }));
} else {
  describe("Phase 5 actual PostgreSQL services", () => {
    beforeAll(async () => {
      client = postgres(requireTestDatabaseUrl(), { max: 8, connect_timeout: 5, connection: { timezone: "UTC" } });
      db = drizzle(client, { schema }); context.db = db;
      await migrate(db, { migrationsFolder: "./drizzle" });
      expect(String((await client`SELECT current_database() AS name`)[0].name)).toMatch(/_test$/);
    });
    afterAll(async () => {
      context.db = undefined; context.ownerId = "";
      if (client) {
        // The guard checks the dedicated name and difference from DATABASE_URL.
        await client`TRUNCATE TABLE programs, owners, audit_logs RESTART IDENTITY CASCADE`;
        await client.end();
      }
    });

    it("PERSONAL-01/13 persists membership and bigint opening balance without rewriting history", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        const saved = await upsertMembership({ programCode: f.programCode, membershipTier: "白金", tierExpiresAt: iso(365), pointsValidUntil: iso(180), benefits: [{ name: "延迟退房", kind: "manual", expiresAt: null, usedAt: null }], cardHeld: true, cardType: "联名权益", notes: "人工登记" });
        expect(saved.wallet.membershipTier).toBe("白金");
        expect((await checkMembershipConditions({ programCode: f.programCode, requiredTiers: ["白金"] })).status).toBe("meets-known-conditions");
        await credit(f, "opening", "9007199254740993");
        const history = await saveScenario(scenario(f, "old-membership"));
        await upsertMembership({ programCode: f.programCode, membershipTier: "未知" });
        const read = await dashboard();
        expect(read.wallets[0].wallet.membershipTier).toBe("未知");
        expect((await checkMembershipConditions({ programCode: f.programCode, requiredTiers: ["白金"] })).status).toBe("information-insufficient");
        await upsertMembership({ programCode: f.programCode, membershipTier: "金卡" });
        expect((await checkMembershipConditions({ programCode: f.programCode, requiredTiers: ["白金"] })).status).toBe("fails-known-conditions");
        expect(read.wallets[0].wallet.notes).toBe("人工登记");
        expect(read.wallets[0].wallet.benefits[0].name).toBe("延迟退房");
        expect(read.wallets[0].wallet.lastVerifiedAt).toBeInstanceOf(Date);
        expect(read.summary.availablePoints).toBe(9007199254740993n);
        expect((await listScenarios()).find((row) => row.id === history.id)?.membershipSnapshot).toEqual(history.membershipSnapshot);
      });
    });

    it("PERSONAL-02/08 distinguishes unknown, never, upcoming, and expired batches", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        const unknown = await credit(f, "unknown", "11");
        await credit(f, "never", "13", { expiryStatus: "never" });
        await credit(f, "soon", "17", { expiryStatus: "known", expiresAt: iso(10) });
        await credit(f, "later", "19", { expiryStatus: "known", expiresAt: iso(60) });
        const expired = await credit(f, "expired", "23", { earnedAt: iso(-100), expiryStatus: "known", expiresAt: iso(-1) });
        let read = await dashboard();
        expect(read.summary.availablePoints).toBe(60n);
        expect(read.summary.expiringPoints).toBe(17n);
        expect(read.batches.find((row) => row.id === unknown.batch.id)?.expiryStatus).toBe("unknown");
        await expect(expirePoints({ batchId: unknown.batch.id, idempotencyKey: "invalid-unknown-expiry" })).rejects.toThrow();
        await expect(consumePoints({ programCode: f.programCode, points: "61", idempotencyKey: "no-expired-spend" })).rejects.toThrow();
        await expirePoints({ batchId: expired.batch.id, idempotencyKey: "expiry" });
        await expirePoints({ batchId: expired.batch.id, idempotencyKey: "expiry" });
        read = await dashboard();
        expect(read.summary.availablePoints).toBe(60n);
        expect(read.summary.expiredPoints).toBe(23n);
        expect(read.summary.spentPoints).toBe(0n);
        expect(read.batches.find((row) => row.id === expired.batch.id)?.remainingPoints).toBe(0n);
      });
    });

    it("PERSONAL-03/04 serializes concurrent duplicate credits and debits with payload checks", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        await Promise.all([credit(f, "credit"), credit(f, "credit")]);
        await expect(credit(f, "credit", "101")).rejects.toThrow();
        const debit = { programCode: f.programCode, points: "50", idempotencyKey: "debit", note: "同一兑换" };
        await Promise.all([consumePoints(debit), consumePoints(debit)]);
        await expect(consumePoints({ ...debit, points: "51" })).rejects.toThrow();
        await expect(consumePoints({ ...debit, idempotencyKey: "credit", points: "100" })).rejects.toThrow();
        const read = await dashboard();
        expect(read.summary.availablePoints).toBe(50n);
        expect(read.transactions).toHaveLength(2);
        expect(read.batches).toHaveLength(1);
        expect(read.transactions.find((row) => row.kind === "debit")?.allocations).toEqual([{ batchId: read.batches[0].id, delta: "-50", remainingAfter: "50" }]);
      });
    });

    it("PERSONAL-16 rejects concurrent overspending and rolls back all partial allocations", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        await credit(f, "a", "30"); await credit(f, "b", "70");
        const results = await Promise.allSettled(["spend-a", "spend-b"].map((idempotencyKey) => consumePoints({ programCode: f.programCode, points: "80", idempotencyKey })));
        expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((row) => row.status === "rejected")).toHaveLength(1);
        const before = await dashboard();
        expect(before.summary.availablePoints).toBe(20n);
        await expect(consumePoints({ programCode: f.programCode, points: "21", idempotencyKey: "rollback-partial" })).rejects.toThrow();
        const after = await dashboard();
        expect(after.batches.map((row) => [row.id, row.remainingPoints])).toEqual(before.batches.map((row) => [row.id, row.remainingPoints]));
        expect(after.transactions).toHaveLength(3);
        expect(after.batches.every((row) => row.remainingPoints >= 0n)).toBe(true);
        expect(after.reconciliation.balanced).toBe(true);
      });
    });

    it("keeps signed manual corrections as idempotent history", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        await credit(f, "start");
        const positive = { programCode: f.programCode, points: "20", source: "补录漏记", note: "核对凭证", idempotencyKey: "positive" };
        const negative = { programCode: f.programCode, points: "-30", source: "纠正多记", note: "人工更正", idempotencyKey: "negative" };
        await Promise.all([adjustPoints(positive), adjustPoints(positive)]);
        await Promise.all([adjustPoints(negative), adjustPoints(negative)]);
        await expect(adjustPoints({ ...negative, points: "-31" })).rejects.toThrow();
        const read = await dashboard();
        expect(read.summary.availablePoints).toBe(90n);
        expect(read.transactions.filter((row) => row.kind === "adjustment").map((row) => row.points).sort()).toEqual([-30n, 20n]);
        expect(read.reconciliation.balanced).toBe(true);
      });
    });

    it("PERSONAL-05/06 credits an actual reward once per participation while allowing another cycle", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        const { action } = await createPromotionAction({ promotionId: f.promotion, cycleKey: "2026-10", status: "planned" });
        await updateAction(action.id, "awaiting_reward");
        expect((await dashboard()).summary.expectedPoints).toBe(8000n);
        expect((await dashboard()).summary.availablePoints).toBe(0n);
        await Promise.all([creditReward(action.id, "arrived-a", 8000n), creditReward(action.id, "arrived-b", 8000n)]);
        await expect(creditReward(action.id, "different-reward", 8001n)).rejects.toThrow();
        let read = await dashboard();
        expect(read.summary.availablePoints).toBe(8000n);
        expect(read.summary.expectedPoints).toBe(0n);
        expect(read.rewards.filter((row) => row.kind === "acquired")).toHaveLength(1);
        expect(read.batches).toHaveLength(1);
        expect(read.rewards[0].transactionId).toBeTruthy();
        await updateAction(action.id, "completed");
        await createPromotionAction({ promotionId: f.promotion, cycleKey: "2026-10", status: "saved" });
        expect((await dashboard()).actions.find((row) => row.action.id === action.id)?.action.status).toBe("completed");
        const next = await createPromotionAction({ promotionId: f.promotion, cycleKey: "2026-11", status: "planned" });
        await creditReward(next.action.id, "next-cycle", 7000n);
        read = await dashboard();
        expect(read.summary.availablePoints).toBe(15000n);
        expect(read.rewards.filter((row) => row.kind === "acquired")).toHaveLength(2);
      });
    });

    it("PERSONAL-16 rolls reward receipt back if its final database write fails", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        const { action } = await createPromotionAction({ promotionId: f.promotion, cycleKey: "atomic", status: "planned" });
        // A real database failure after the points write exercises atomicity.
        await client.unsafe(`CREATE FUNCTION phase5_reward_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.owner_id = '${f.owner}'::uuid THEN RAISE EXCEPTION 'Phase 5 injected receipt failure'; END IF; RETURN NEW; END $$`);
        await client`CREATE TRIGGER phase5_reward_failure BEFORE INSERT ON reward_records FOR EACH ROW EXECUTE FUNCTION phase5_reward_failure()`;
        try {
          await expect(creditReward(action.id, "atomic-receipt", 8000n)).rejects.toThrow();
          const read = await dashboard();
          expect(read.batches).toHaveLength(0);
          expect(read.transactions).toHaveLength(0);
          expect(read.rewards).toHaveLength(0);
          expect(read.actions[0].action.rewardCreditedAt).toBeNull();
        } finally {
          await client`DROP TRIGGER IF EXISTS phase5_reward_failure ON reward_records`;
          await client`DROP FUNCTION IF EXISTS phase5_reward_failure()`;
        }
        await creditReward(action.id, "atomic-receipt", 8000n);
        expect((await dashboard()).summary.availablePoints).toBe(8000n);
      });
    });

    it("PERSONAL-07/09 keeps personal tasks and progress separate from public lifecycle", async () => {
      const f = await fixture();
      const publicBefore = await client`SELECT * FROM promotions WHERE id = ${f.promotion}`;
      await asOwner(f, async () => {
        const saved = await createPromotionAction({ promotionId: f.promotion, cycleKey: "saved", status: "saved" });
        expect((await dashboard()).summary.expectedPoints).toBe(0n);
        expect((await dashboard()).tasks).toHaveLength(0);
        expect(stable(await client`SELECT * FROM promotions WHERE id = ${f.promotion}`)).toBe(stable(publicBefore));
        const task = await createTask({ title: "待领取奖励（用户确认草稿）", actionId: saved.action.id, deadlineAt: iso(2), deadlineSource: "rule-derived", draftKey: "confirmed-draft" });
        const sameTask = await createTask({ title: "待领取奖励（用户确认草稿）", actionId: saved.action.id, deadlineAt: task.deadlineAt?.toISOString(), deadlineSource: "rule-derived", draftKey: "confirmed-draft" });
        expect(sameTask.id).toBe(task.id);
        const unknown = await createTask({ title: "领取日期待确认", actionId: saved.action.id, deadlineSource: "unconfirmed" });
        expect(unknown.deadlineAt).toBeNull();
        await client`UPDATE promotions SET lifecycle_status = 'ended', ends_at = ${iso(-1)} WHERE id = ${f.promotion}`;
        expect((await dashboard()).tasks).toHaveLength(2);
        const completed = await completeTask(task.id);
        expect(completed.status).toBe("completed");
        expect((await completeTask(task.id)).completedAt).toEqual(completed.completedAt);
      });
    });

    it("PERSONAL-10/11 preserves old inputs, prices, membership and rules when recalculation saves a new result", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        const original = await saveScenario(scenario(f, "snapshot-v1"));
        const originalEvidence = stable({ input: original.inputSnapshot, result: original.result, rules: original.ruleSnapshots, membership: original.membershipSnapshot, ids: original.ruleVersionIds, quote: original.quotedAt });
        const nextVersion = randomUUID();
        await client`INSERT INTO rule_versions (id, rule_id, program_id, version, terms, valid_from, time_zone, publication_status, verification_status) VALUES (${nextVersion}, ${f.rule}, ${f.program}, 2, ${JSON.stringify(["new published terms"])}::jsonb, ${iso(-1)}, 'UTC', 'published', 'official_verified')`;
        await client`UPDATE promotions SET rule_version_id = ${nextVersion} WHERE id = ${f.promotion}`;
        await upsertMembership({ programCode: f.programCode, membershipTier: "金卡" });
        await updateScenarioMetadata(original.id, { name: "重命名，依据不变", notes: "新的私人备注" });
        const revised = await saveScenario(scenario(f, "snapshot-v2", { ruleVersionIds: [nextVersion], ruleSnapshots: [{ id: nextVersion, version: 2, terms: ["new published terms"] }], result: { expectedPoints: "4000" }, membershipSnapshot: { tier: "金卡" } }));
        expect(revised.id).not.toBe(original.id);
        const history = await listScenarios();
        expect(history).toHaveLength(2);
        const old = history.find((row) => row.id === original.id)!;
        expect(stable({ input: old.inputSnapshot, result: old.result, rules: old.ruleSnapshots, membership: old.membershipSnapshot, ids: old.ruleVersionIds, quote: old.quotedAt })).toBe(originalEvidence);
        expect(old.name).toBe("重命名，依据不变");
        await deleteScenario(revised.id);
        expect((await listScenarios()).map((row) => row.id)).toEqual([original.id]);
      });
    });

    it("saves concurrent scenario retries once and rejects a conflicting payload", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        const input = scenario(f, "scenario-idem");
        const rows = await Promise.all([saveScenario(input), saveScenario(input)]);
        expect(rows[0].id).toBe(rows[1].id);
        await expect(saveScenario({ ...input, result: { expectedPoints: "1" } })).rejects.toThrow();
        expect(await listScenarios()).toHaveLength(1);
      });
    });

    it("PERSONAL-12/17 subtracts point opportunity cost and never adds acquired value to realized cash", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        const { action } = await createPromotionAction({ promotionId: f.promotion, status: "planned" });
        await creditReward(action.id, "earned", 8000n);
        const input = { programCode: f.programCode, actionId: action.id, points: "8000", cashMinor: "16000", pointValueMicros: "20000", costMinor: "1000", foregoneValueMinor: "500", source: "实际房费抵扣", note: "现金可比价 ¥200；积分加现金 ¥40；实际差额 ¥160", idempotencyKey: "realized" };
        await Promise.all([recordRealized(input), recordRealized(input)]);
        await expect(recordRealized({ ...input, cashMinor: "16001" })).rejects.toThrow();
        const read = await dashboard();
        expect(read.summary.availablePoints).toBe(0n);
        expect(read.summary.acquiredPoints).toBe(8000n);
        expect(read.summary.spentPoints).toBe(8000n);
        expect(read.summary.realizedCashMinor).toBe(16000n);
        expect(read.summary.pointOpportunityCostMicros).toBe(160_000_000n);
        expect(read.summary.costMinor).toBe(1000n);
        expect(read.summary.foregoneValueMinor).toBe(500n);
        expect(read.summary.netEconomicValueMicros).toBe(-15_000_000n);
        expect(read.rewards.filter((row) => row.kind === "realized")).toHaveLength(1);
        expect(read.reconciliation.balanced).toBe(true);
      });
    });

    it("does not invent savings without a comparable cash baseline or point valuation", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        await credit(f, "opening");
        await recordRealized({ programCode: f.programCode, points: "10", source: "无现金可比价的兑换", idempotencyKey: "unvalued" });
        const read = await dashboard();
        expect(read.summary.availablePoints).toBe(90n);
        expect(read.summary.realizedCashMinor).toBe(0n);
        expect(read.summary.netEconomicValueMicros).toBeNull();
        expect(read.summary.unvaluedRecordCount).toBe(1);
        expect(read.rewards[0].cashMinor).toBeNull();
      });
    });

    it("PERSONAL-14 isolates reads and every ID-based mutation by Owner", async () => {
      const a = await fixture(); const b = await fixture();
      const privateA = await asOwner(a, async () => {
        const { batch } = await credit(a, "owner-private");
        const { action } = await createPromotionAction({ promotionId: a.promotion, status: "planned" });
        const task = await createTask({ title: "Owner A 私人任务", actionId: action.id });
        const saved = await saveScenario(scenario(a, "owner-private"));
        return { batch, action, task, saved };
      });
      await asOwner(b, async () => {
        const read = await dashboard();
        expect(read.wallets).toHaveLength(0); expect(read.batches).toHaveLength(0);
        expect(read.scenarios).toHaveLength(0); expect(read.rewards).toHaveLength(0);
        expect(read.actions).toHaveLength(0); expect(read.tasks).toHaveLength(0);
        await expect(updateAction(privateA.action.id, "completed")).rejects.toThrow();
        await expect(creditReward(privateA.action.id, "cross-owner", 8000n)).rejects.toThrow();
        await expect(completeTask(privateA.task.id)).rejects.toThrow();
        await expect(expirePoints({ batchId: privateA.batch.id, idempotencyKey: "cross-owner-expire" })).rejects.toThrow();
        await expect(updateScenarioMetadata(privateA.saved.id, { name: "越权" })).rejects.toThrow();
        await expect(deleteScenario(privateA.saved.id)).rejects.toThrow();
        await expect(createTask({ title: "越权关联", actionId: privateA.action.id })).rejects.toThrow();
        await expect(createTask({ title: "越权批次", pointBatchId: privateA.batch.id })).rejects.toThrow();
        await expect(recordRealized({ programCode: b.programCode, actionId: privateA.action.id, points: "1", idempotencyKey: "cross-owner-realize" })).rejects.toThrow();
      });
      await asOwner(a, async () => {
        expect((await dashboard()).summary.availablePoints).toBe(100n);
        expect((await listScenarios())[0].name).toBe("历史计算依据");
      });
    });

    it("PERSONAL-18 repeats migrations and seed without changing private data", async () => {
      const f = await fixture();
      await asOwner(f, async () => {
        await upsertMembership({ programCode: f.programCode, membershipTier: "白金", notes: "不得被seed覆盖" });
        await credit(f, "persistent-opening", "123");
        await saveScenario(scenario(f, "persistent-scenario"));
        const before = await dashboard();
        const privateSnapshot = (read: Awaited<ReturnType<typeof dashboard>>) => stable({ wallets: read.wallets, batches: read.batches, actions: read.actions, tasks: read.tasks, scenarios: read.scenarios, rewards: read.rewards, transactions: read.transactions, summary: read.summary });
        await migrate(db, { migrationsFolder: "./drizzle" }); await migrate(db, { migrationsFolder: "./drizzle" });
        await insertDemo(db); await insertDemo(db);
        expect(privateSnapshot(await dashboard())).toBe(privateSnapshot(before));
      });
    });
  });
}
