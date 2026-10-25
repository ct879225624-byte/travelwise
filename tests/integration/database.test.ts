import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { insertDemo } from "@/db/demo-seed";
import { requireTestDatabaseUrl } from "@/shared/env";

const testUrl = process.env.TEST_DATABASE_URL;
type PgError = { code?: string };
function errorCode(error: unknown) { return (error as PgError | undefined)?.code; }

if (!testUrl) {
  describe("PostgreSQL migration contract", () => {
    it("BLOCKED: TEST_DATABASE_URL is required", () => {
      throw new Error("BLOCKED: TEST_DATABASE_URL is required; start the dedicated PostgreSQL test database before running npm run test:db.");
    });
  });
} else {
  describe("PostgreSQL migration and data contract", () => {
    let client: Sql;
    let db: ReturnType<typeof drizzle<typeof schema>>;

    beforeAll(async () => {
      const url = requireTestDatabaseUrl();
      client = postgres(url, { max: 1, connect_timeout: 5, connection: { timezone: "UTC" } });
      db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: "./drizzle" });
      await migrate(db, { migrationsFolder: "./drizzle" });
    });
    afterAll(async () => {
      // This database is dedicated to integration tests. Clean only it so a
      // repeated run starts empty and can never remove development records.
      if (client) {
        await client`TRUNCATE TABLE audit_logs, actions, point_batches, evidence,
          promotions, rule_versions, rules, wallets, owners, programs
          RESTART IDENTITY CASCADE`;
        await client.end();
      }
    });

    type Transaction = Sql | postgres.TransactionSql;

    async function expectFailure(code: string, work: (tx: Transaction) => Promise<void>) {
      const rollback = Symbol("rollback");
      let failure: unknown;
      await client.begin(async (tx) => {
        try { await work(tx); } catch (error) { failure = error; }
        throw rollback;
      }).catch((error) => { if (error !== rollback) throw error; });
      expect(errorCode(failure)).toBe(code);
    }

    async function rollbackTransaction(work: (tx: Transaction) => Promise<void>) {
      const rollback = Symbol("rollback");
      await client.begin(async (tx) => { await work(tx); throw rollback; }).catch((error) => {
        if (error !== rollback) throw error;
      });
    }

    async function insertFixture(tx: Transaction, suffix: string) {
      const programA = `11111111-1111-4111-8111-${suffix}000001`;
      const programB = `22222222-2222-4222-8222-${suffix}000002`;
      const owner = `33333333-3333-4333-8333-${suffix}000003`;
      const wallet = `44444444-4444-4444-8444-${suffix}000004`;
      const rule = `55555555-5555-4555-8555-${suffix}000005`;
      const version = `66666666-6666-4666-8666-${suffix}000006`;
      const promotion = `77777777-7777-4777-8777-${suffix}000007`;
      await tx`INSERT INTO programs (id, code, name, kind, points_name)
        VALUES (${programA}, ${`test-program-${suffix}-a`}, '测试计划 A', 'hotel', '积分')`;
      await tx`INSERT INTO programs (id, code, name, kind, points_name)
        VALUES (${programB}, ${`test-program-${suffix}-b`}, '测试计划 B', 'airline', '里程')`;
      await tx`INSERT INTO owners (id) VALUES (${owner})`;
      await tx`INSERT INTO wallets (id, owner_id, program_id, membership_tier)
        VALUES (${wallet}, ${owner}, ${programA}, '测试等级')`;
      await tx`INSERT INTO rules (id, program_id, code, name)
        VALUES (${rule}, ${programA}, ${`test-rule-${suffix}`}, '测试规则')`;
      await tx`INSERT INTO rule_versions
        (id, rule_id, program_id, version, terms, valid_from, valid_until, time_zone, is_demo)
        VALUES (${version}, ${rule}, ${programA}, 1, ${JSON.stringify(["测试条款"])},
          '2026-01-01T00:00:00+00:00', '2026-12-31T00:00:00+00:00', 'Asia/Shanghai', false)`;
      await tx`INSERT INTO promotions
        (id, program_id, rule_version_id, slug, title, summary, category, publication_status,
          is_suspended, is_demo, starts_at, ends_at, time_zone, qualification, stacking)
        VALUES (${promotion}, ${programA}, ${version}, ${`test-promotion-${suffix}`}, '测试活动', '测试摘要',
          '测试', 'published', false, false, '2026-02-01T00:00:00+00:00',
          '2026-03-01T00:00:00+00:00', 'Asia/Shanghai', 'unknown', 'unknown')`;
      return { programA, programB, owner, wallet, rule, version, promotion };
    }

    it("creates all Phase 1 tables and keeps the test database isolated", async () => {
      const database = await client`SELECT current_database() AS name`;
      expect(String(database[0].name)).toMatch(/_test$/);
      const tables = await client`SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('programs', 'rules', 'rule_versions',
          'promotions', 'evidence', 'owners', 'wallets', 'point_batches', 'actions', 'audit_logs')
        ORDER BY table_name`;
      expect(tables.map((row) => row.table_name)).toEqual([
        "actions", "audit_logs", "evidence", "owners", "point_batches", "programs",
        "promotions", "rule_versions", "rules", "wallets",
      ]);
      const checks = await client`SELECT constraint_name FROM information_schema.check_constraints
        WHERE constraint_name IN ('promotion_valid_range', 'point_amounts_valid',
          'promotion_demo_title', 'action_currency', 'realized_saving_valid') ORDER BY constraint_name`;
      expect(checks.map((row) => row.constraint_name)).toEqual([
        "action_currency", "point_amounts_valid", "promotion_demo_title",
        "promotion_valid_range", "realized_saving_valid",
      ]);
      const fks = await client`SELECT constraint_name, delete_rule, update_rule
        FROM information_schema.referential_constraints WHERE constraint_schema = 'public'`;
      expect(fks.length).toBeGreaterThanOrEqual(12);
      expect(fks.every((row) => row.delete_rule === "NO ACTION" && row.update_rule === "NO ACTION")).toBe(true);
    });

    it("seeds the demo fixture idempotently", async () => {
      const before = await client`SELECT count(*)::int AS count FROM promotions WHERE is_demo = true`;
      await insertDemo(db);
      const afterFirst = await client`SELECT count(*)::int AS count FROM promotions WHERE is_demo = true`;
      const auditAfterFirst = await client`SELECT count(*)::int AS count FROM audit_logs`;
      await insertDemo(db);
      const afterSecond = await client`SELECT count(*)::int AS count FROM promotions WHERE is_demo = true`;
      expect(Number(afterFirst[0].count)).toBeGreaterThanOrEqual(Number(before[0].count));
      expect(Number(afterSecond[0].count)).toBe(Number(afterFirst[0].count));
      expect(await client`SELECT count(*)::int AS count FROM audit_logs`).toEqual(auditAfterFirst);
      const demo = await client`SELECT title, is_demo FROM promotions WHERE slug = 'demo-jinjiang-points-stay'`;
      expect(demo).toHaveLength(1);
      expect(demo[0].is_demo).toBe(true);
      expect(String(demo[0].title).startsWith("DEMO")).toBe(true);
    });

    it("enforces value checks, unique keys, and real-source evidence", async () => {
      await expectFailure("23514", async (tx) => {
        await tx`INSERT INTO programs (code, name, kind, points_name) VALUES ('Invalid Code', '非法', 'hotel', '积分')`;
      });
      await expectFailure("23514", async (tx) => {
        await tx`INSERT INTO programs (code, name, kind, points_name) VALUES ('invalid-code', '非法', 'hotel', '积分')`;
        const rows = await tx`SELECT id FROM programs WHERE code = 'invalid-code'`;
        await tx`INSERT INTO rules (program_id, code, name) VALUES (${rows[0].id}, 'invalid-rule', '非法')`;
        const rules = await tx`SELECT id, program_id FROM rules WHERE code = 'invalid-rule'`;
        await tx`INSERT INTO rule_versions (rule_id, program_id, version, terms, valid_from, time_zone)
          VALUES (${rules[0].id}, ${rules[0].program_id}, 0, ${JSON.stringify([])}, '2026-01-01T00:00:00+00:00', 'UTC')`;
      });
      await expectFailure("23514", async (tx) => {
        const f = await insertFixture(tx, "000010");
        await tx`UPDATE promotions SET ends_at = starts_at WHERE id = ${f.promotion}`;
      });
      await expectFailure("23514", async (tx) => {
        const f = await insertFixture(tx, "000011");
        await tx`UPDATE promotions SET is_demo = true, title = '非演示标题' WHERE id = ${f.promotion}`;
      });
      await expectFailure("23514", async (tx) => {
        const f = await insertFixture(tx, "000012");
        await tx`INSERT INTO point_batches (wallet_id, owner_id, source, earned_points, remaining_points, earned_at)
          VALUES (${f.wallet}, ${f.owner}, '非法批次', 10, 11, '2026-01-01T00:00:00+00:00')`;
      });
      await expectFailure("23514", async (tx) => {
        const f = await insertFixture(tx, "000013");
        await tx`INSERT INTO actions (owner_id, promotion_id, wallet_id, program_id, status, realized_saving_minor)
          VALUES (${f.owner}, ${f.promotion}, ${f.wallet}, ${f.programA}, 'saved', 1)`;
      });
      await expectFailure("23514", async (tx) => {
        const f = await insertFixture(tx, "000014");
        await tx`INSERT INTO evidence (rule_version_id, source_label, source_url, excerpt, is_demo, captured_at)
          VALUES (${f.version}, '未验证来源', NULL, '不能没有真实链接', false, '2026-01-01T00:00:00+00:00')`;
      });
      await expectFailure("23505", async (tx) => {
        const f = await insertFixture(tx, "000015");
        await tx`INSERT INTO wallets (owner_id, program_id) VALUES (${f.owner}, ${f.programA})`;
      });
    });

    it("enforces foreign keys including compound program and owner scopes", async () => {
      await expectFailure("23503", async (tx) => {
        const f = await insertFixture(tx, "000020");
        await tx`INSERT INTO rule_versions (rule_id, program_id, version, terms, valid_from, time_zone)
          VALUES (${f.rule}, ${f.programB}, 2, ${JSON.stringify(["错误计划"])}, '2026-01-01T00:00:00+00:00', 'UTC')`;
      });
      await expectFailure("23503", async (tx) => {
        const f = await insertFixture(tx, "000021");
        const wrongOwner = "99999999-9999-4999-8999-000021000009";
        await tx`INSERT INTO point_batches (wallet_id, owner_id, source, earned_points, remaining_points, earned_at)
          VALUES (${f.wallet}, ${wrongOwner}, '错误所有者', 10, 10, '2026-01-01T00:00:00+00:00')`;
      });
      await expectFailure("23503", async (tx) => {
        const f = await insertFixture(tx, "000022");
        await tx`INSERT INTO actions (owner_id, promotion_id, wallet_id, program_id, status)
          VALUES (${f.owner}, ${f.promotion}, ${f.wallet}, ${f.programB}, 'saved')`;
      });
      await expectFailure("23503", async (tx) => {
        const f = await insertFixture(tx, "000023");
        await tx`INSERT INTO promotions (program_id, rule_version_id, slug, title, summary, category, starts_at, ends_at, time_zone)
          VALUES (${f.programB}, ${f.version}, 'wrong-program-promotion', '错误活动', '错误', '测试',
            '2026-02-01T00:00:00+00:00', '2026-03-01T00:00:00+00:00', 'UTC')`;
      });
    });

    it("preserves bigint amounts and timezone-aware instants", async () => {
      await rollbackTransaction(async (tx) => {
        const f = await insertFixture(tx, "000030");
        const earned = 9007199254740993n;
        const saving = 9007199254740995n;
        await tx`INSERT INTO point_batches (wallet_id, owner_id, source, earned_points, remaining_points, earned_at, expires_at, expiry_status)
          VALUES (${f.wallet}, ${f.owner}, '测试奖励', ${earned.toString()}, ${(earned - 1n).toString()}, '2026-01-01T08:00:00+08:00', '2027-01-01T08:00:00+08:00', 'known')`;
        await tx`INSERT INTO actions (owner_id, promotion_id, wallet_id, program_id, status, claim_deadline, realized_saving_minor)
          VALUES (${f.owner}, ${f.promotion}, ${f.wallet}, ${f.programA}, 'completed', '2026-02-01T16:00:00+08:00', ${saving.toString()})`;
        const batch = await tx`SELECT earned_points, remaining_points, earned_at, expires_at FROM point_batches WHERE wallet_id = ${f.wallet}`;
        expect(BigInt(batch[0].earned_points)).toBe(earned);
        expect(BigInt(batch[0].remaining_points)).toBe(earned - 1n);
        expect(new Date(batch[0].earned_at).toISOString()).toBe("2026-01-01T00:00:00.000Z");
        expect(new Date(batch[0].expires_at).toISOString()).toBe("2027-01-01T00:00:00.000Z");
        const action = await tx`SELECT realized_saving_minor, claim_deadline FROM actions WHERE wallet_id = ${f.wallet}`;
        expect(BigInt(action[0].realized_saving_minor)).toBe(saving);
        expect(new Date(action[0].claim_deadline).toISOString()).toBe("2026-02-01T08:00:00.000Z");
      });
    });

    it("blocks parent updates and deletes while child records exist", async () => {
      await expectFailure("23503", async (tx) => {
        const f = await insertFixture(tx, "000040");
        await tx`INSERT INTO point_batches (wallet_id, owner_id, source, earned_points, remaining_points, earned_at)
          VALUES (${f.wallet}, ${f.owner}, '引用', 10, 10, '2026-01-01T00:00:00+00:00')`;
        await tx`DELETE FROM wallets WHERE id = ${f.wallet}`;
      });
      await expectFailure("23503", async (tx) => {
        const f = await insertFixture(tx, "000041");
        await tx`DELETE FROM programs WHERE id = ${f.programA}`;
      });
      await expectFailure("23503", async (tx) => {
        const f = await insertFixture(tx, "000042");
        const replacement = "88888888-8888-4888-8888-000042000008";
        await tx`UPDATE programs SET id = ${replacement} WHERE id = ${f.programA}`;
      });
    });
  });
}
