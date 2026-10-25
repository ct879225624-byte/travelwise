import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import * as s from "@/db/schema";
import { requireTestDatabaseUrl } from "@/shared/env";

const ctx = vi.hoisted(() => ({ db: undefined as Database | undefined, ownerId: "" }));
vi.mock("@/db/client", () => ({ getDatabase: () => { if (!ctx.db) throw new Error("No test connection"); return ctx.db; } }));
vi.mock("@/modules/personal/auth", () => ({ requireOwner: async () => { if (!ctx.ownerId) throw new Error("Owner authentication required"); return { id: ctx.ownerId }; } }));
import { confirmOpportunity, personalOpportunityEngine, updateReminder } from "@/modules/personal/opportunity-service";
import { addPoints, createPromotionAction, createTask, dashboard, saveScenario, updateAction, upsertMembership } from "@/modules/personal/service";
import { saveRule, setPromotionStatus, setRuleVersionStatus } from "@/modules/admin/service";

let client: Sql; let db: Database;
const now = () => new Date();
const day = (n: number) => new Date(Date.now() + n * 86400000);
async function fixture() {
  const key = randomUUID();
  const [owner] = await db.insert(s.owners).values({ authSubject: `${key}@test.local` }).returning();
  const [program] = await db.insert(s.programs).values({ code: `c-${key}`, name: "C isolated fixture", kind: "hotel", pointsName: "测试积分" }).returning();
  const [rule] = await db.insert(s.rules).values({ programId: program.id, code: "c-rule", name: "人工审核测试规则" }).returning();
  const [version] = await db.insert(s.ruleVersions).values({ ruleId: rule.id, programId: program.id, version: 1, terms: ["测试库专用条款"], structuredContent: { opportunity: { complete: true, membershipTiers: ["白金"], enrollmentRequired: true, minSpendMinor: "10000", minNights: 1, spendEndsAt: day(5).toISOString() } }, validFrom: day(-90), timeZone: "Asia/Hong_Kong", publicationStatus: "published", verificationStatus: "official_verified" }).returning();
  const [promotion] = await db.insert(s.promotions).values({ programId: program.id, ruleVersionId: version.id, slug: `c-${key}`, title: "隔离测试机会", summary: "仅用于自动化测试", category: "测试", publicationStatus: "published", verificationStatus: "official_verified", lifecycleStatus: "active", startsAt: day(-30), endsAt: day(30), enrollmentEndsAt: day(3), stayEndsAt: day(6), claimStartsAt: day(7), claimEndsAt: day(12), rewardAmount: 1000n, rewardUnit: "积分", timeZone: "Asia/Hong_Kong" }).returning();
  const [source] = await db.insert(s.evidence).values({ ruleVersionId: version.id, sourceLabel: "测试官方来源", sourceUrl: "https://example.com/test-only", sourceKind: "official", verificationStatus: "official_verified", capturedAt: day(-1), verifiedAt: now(), excerpt: "隔离数据库夹具" }).returning();
  await db.insert(s.promotionEvidence).values({ promotionId: promotion.id, evidenceId: source.id });
  await db.insert(s.promotionVersions).values({ promotionId: promotion.id, version: 1, snapshot: {}, actor: "test", revisionReason: "隔离夹具" });
  ctx.ownerId = owner.id;
  await upsertMembership({ programCode: program.code, membershipTier: "白金", cardHeld: true, cardType: "测试卡", benefits: [{ name: "早餐", kind: "manual", expiresAt: day(10).toISOString() }] });
  return { owner, program, rule, version, promotion, source };
}
const facts = () => ({ enrolled: true, qualifyingSpendMinor: "10000", nights: 1, stayAt: day(2).toISOString() });
async function only(f: Awaited<ReturnType<typeof fixture>>) { return (await personalOpportunityEngine()).opportunities.find((o) => o.id === f.promotion.id)!; }
async function confirm(f: Awaited<ReturnType<typeof fixture>>) { const o = await only(f); return confirmOpportunity({ promotionId: o.id, fingerprint: o.fingerprint, facts: facts() }); }

describe("V1.1-C actual PostgreSQL personal opportunity engine", () => {
  beforeAll(async () => { client = postgres(requireTestDatabaseUrl(), { max: 8, connect_timeout: 5, onnotice: () => {} }); db = drizzle(client, { schema: s }); ctx.db = db; await migrate(db, { migrationsFolder: "./drizzle" }); });
  afterAll(async () => { ctx.ownerId = ""; ctx.db = undefined; if (client) { await client`TRUNCATE programs, owners, audit_logs CASCADE`; await client.end(); } });
  it("C01 preserves four-state eligibility, exact facts, no fabricated value and benefit validity", async () => {
    const f = await fixture();
    expect((await only(f)).eligibility.status).toBe("information-insufficient");
    await confirm(f); let o = await only(f);
    expect(o.eligibility.status).toBe("meets-known-conditions"); expect(o.satisfied).toContain("已确认合资格消费"); expect(o.value).toBeNull(); expect(o.sources[0].url).toBe(f.source.sourceUrl);
    await upsertMembership({ programCode: f.program.code, membershipTier: "金卡" });
    expect((await only(f)).eligibility.status).toBe("fails-known-conditions");
    await upsertMembership({ programCode: f.program.code, membershipTier: "白金", tierExpiresAt: day(-1).toISOString() });
    expect((await only(f)).eligibility.status).toBe("information-insufficient");
    await db.update(s.ruleVersions).set({ verificationStatus: "reverify" }).where(eq(s.ruleVersions.id, f.version.id));
    o = await only(f); expect(o.eligibility.status).toBe("rule-pending-verification");
    expect(o.value).toBeNull();
  });
  it("C02 excludes draft, unverified, DEMO, suspended, ended, future and unknown-date content", async () => {
    const f = await fixture();
    for (const patch of [{ publicationStatus: "draft" as const }, { verificationStatus: "unverified" as const }, { isDemo: true, title: "DEMO test" }, { isSuspended: true }, { endsAt: day(-1) }, { startsAt: day(1) }, { startsAt: null }]) {
      await db.update(s.promotions).set(patch).where(eq(s.promotions.id, f.promotion.id));
      expect((await personalOpportunityEngine()).opportunities).toHaveLength(0);
      await db.update(s.promotions).set({ ...f.promotion }).where(eq(s.promotions.id, f.promotion.id));
    }
    await db.update(s.evidence).set({ verificationStatus: "unverified" }).where(eq(s.evidence.id, f.source.id));
    expect((await personalOpportunityEngine()).opportunities).toHaveLength(0);
  });
  it("C03 published semantic changes invalidate facts and old calculations; stale submissions fail", async () => {
    const f = await fixture(); await confirm(f); const before = await only(f);
    await db.update(s.promotions).set({ title: "纯标题修改" }).where(eq(s.promotions.id, f.promotion.id));
    expect((await only(f)).ruleChanged).toBe(false);
    await db.update(s.ruleVersions).set({ terms: ["新的正式门槛"], structuredContent: { opportunity: { complete: true, minSpendMinor: "20000" } } }).where(eq(s.ruleVersions.id, f.version.id));
    let o = await only(f); expect(o.ruleChanged).toBe(true); expect(o.eligibility.status).toBe("information-insufficient"); expect(o.value).toBeNull();
    await expect(confirmOpportunity({ promotionId: o.id, fingerprint: before.fingerprint, facts: facts() })).rejects.toThrow("规则已变化");
    expect((await personalOpportunityEngine()).reminders.filter((r) => r.active && r.kind === "rule-change")).toHaveLength(1);
    await confirm(f); o = await only(f); expect(o.ruleChanged).toBe(false); expect(o.eligibility.status).toBe("fails-known-conditions");
    expect((await personalOpportunityEngine()).reminders.filter((r) => r.active && r.kind === "rule-change")).toHaveLength(0);
  });
  it("C04 concurrent refresh deduplicates promotion cycles, reminders and source links", async () => {
    const f = await fixture();
    await createPromotionAction({ promotionId: f.promotion.id, cycleKey: "one" }); await createPromotionAction({ promotionId: f.promotion.id, cycleKey: "two" });
    await db.insert(s.promotionRules).values({ promotionId: f.promotion.id, ruleVersionId: f.version.id });
    const reads = await Promise.all([personalOpportunityEngine(), personalOpportunityEngine(), personalOpportunityEngine()]);
    for (const r of reads) { expect(r.opportunities).toHaveLength(1); expect(new Set(r.reminders.map((x) => x.sourceKey)).size).toBe(r.reminders.length); }
    expect(reads[2].reminders.map((r) => r.id).sort()).toEqual(reads[0].reminders.map((r) => r.id).sort());
    expect(reads[0].opportunities[0].rules).toHaveLength(1);
  });
  it("C05 all reminder statuses persist, snooze wakes once, completion updates original todo", async () => {
    const f = await fixture();
    const task = await createTask({ title: "需处理测试待办", deadlineSource: "manual", deadlineAt: day(-1).toISOString() });
    let r = (await personalOpportunityEngine()).reminders.find((r) => r.kind === "task")!;
    for (const status of ["read", "ignored", "pending"] as const) { await updateReminder(r.id, { status }); expect((await personalOpportunityEngine()).reminders.find((x) => x.id === r.id)?.status).toBe(status); }
    const wake = day(1);
    await updateReminder(r.id, { status: "snoozed", snoozedUntil: wake.toISOString() });
    expect((await personalOpportunityEngine()).reminders.find((x) => x.id === r.id)?.status).toBe("snoozed");
    expect((await personalOpportunityEngine(new Date(wake.getTime() + 1))).reminders.find((x) => x.id === r.id)?.status).toBe("pending");
    await updateReminder(r.id, { status: "completed" });
    expect((await dashboard()).tasks.find((x) => x.id === task.id)?.status).toBe("completed");
    r = (await personalOpportunityEngine()).reminders.find((x) => x.id === r.id)!; expect(r.status).toBe("completed"); expect(r.active).toBe(false);
    await expect(updateReminder(r.id, { status: "snoozed", snoozedUntil: day(-1).toISOString() })).rejects.toThrow();
    expect((await only(f)).value).toBeNull();
  });
  it("C06 uses recorded enrollment, spend, stay and claim dates; claim survives promotion end", async () => {
    const f = await fixture(); const a = await createPromotionAction({ promotionId: f.promotion.id });
    let result = await personalOpportunityEngine(); expect(result.reminders.filter((r) => r.active).map((r) => r.kind)).toEqual(expect.arrayContaining(["enrollment", "spend", "stay", "claim-open", "claim-end"]));
    await confirm(f); expect((await personalOpportunityEngine()).reminders.filter((r) => r.active && r.kind === "enrollment")).toHaveLength(0);
    await updateAction(a.action.id, "registered");
    await db.update(s.promotions).set({ endsAt: day(-1) }).where(eq(s.promotions.id, f.promotion.id));
    result = await personalOpportunityEngine(); expect(result.opportunities).toHaveLength(0); expect(result.reminders.filter((r) => r.active && r.kind === "claim-end")).toHaveLength(1);
    await updateAction(a.action.id, "claimed"); expect((await personalOpportunityEngine()).reminders.filter((r) => r.active && r.kind === "claim-end")).toHaveLength(0);
  });
  it("C07 point expiry uses actual batches, unknown dates do not generate reminders or assets", async () => {
    const f = await fixture();
    await addPoints({ programCode: f.program.code, points: "17", source: "到期测试", expiryStatus: "known", expiresAt: day(30).toISOString(), idempotencyKey: randomUUID() });
    await addPoints({ programCode: f.program.code, points: "13", source: "未知日期", expiryStatus: "unknown", idempotencyKey: randomUUID() });
    await createTask({ title: "日期未确认", deadlineSource: "unconfirmed", deadlineAt: day(-1).toISOString() });
    const result = await personalOpportunityEngine(); expect(result.reminders.filter((r) => r.kind === "points-expiry")).toHaveLength(1); expect(result.reminders.some((r) => r.title.includes("日期未确认"))).toBe(false);
    expect((await dashboard()).summary.availablePoints).toBe(30n);
  });
  it("C08 recomputes three calculator inputs with existing precision, never trusts stored result", async () => {
    const f = await fixture(); await confirm(f);
    const base = { name: "可复算方案", quoteSource: "人工测试报价", quotedAt: now().toISOString(), pointValueMicros: "20000", ruleVersionIds: [f.version.id], result: { netIncrementalValueMicros: "999999999999" }, assumptions: ["人工估值"], unresolved: [] };
    const activity = { promotionRef: f.promotion.slug, threshold: "100", qualifying: "100", planned: "100", extra: "0", extraCost: "1", foregone: "0", fee: "0", used: "0", limit: "", rewardPoints: "1000", pointValue: "0.02", claimStatus: "required-not-claimed", rewardStatus: "pending" };
    await saveScenario({ ...base, calculatorType: "activity-reward", inputSnapshot: activity });
    expect((await only(f)).value?.valueMicros).toBe(19000000n); expect((await only(f)).value?.label).toBe("预计返还");
    const rate = { promotionId: f.promotion.id, standardCash: "100", standardPoints: "0", bonusCash: "110", bonusPoints: "1000", pointValue: "0.02", hotel: "测试酒店", room: "同一房型", checkIn: "2026-11-01", checkOut: "2026-11-02", breakfast: "相同", benefits: "相同", cancellation: "可取消", bonusCancellation: "可取消" };
    await saveScenario({ ...base, calculatorType: "rate-comparison", inputSnapshot: rate }); expect((await only(f)).value?.valueMicros).toBe(10000000n);
    const offer = { promotionId: f.promotion.id, sameRights: true, aCash: "100", aTaxes: "0", aSpent: "0", aEarned: "0", aEligibility: "meets-known-conditions", bCash: "90", bTaxes: "0", bSpent: "0", bEarned: "0", bEligibility: "meets-known-conditions", offerPointValue: "0.02" };
    await saveScenario({ ...base, calculatorType: "offer-comparison", inputSnapshot: offer }); expect((await only(f)).value?.valueMicros).toBe(10000000n); expect((await only(f)).value?.label).toBe("潜在节省");
    expect((await dashboard()).summary.realizedCashMinor).toBe(0n); expect((await dashboard()).summary.availablePoints).toBe(0n);
    await db.update(s.savedScenarios).set({ inputSnapshot: { promotionId: f.promotion.id }, result: { netIncrementalValueMicros: "888888888888" } }).where(eq(s.savedScenarios.ownerId, f.owner.id));
    expect((await only(f)).value).toBeNull();
  });
  it("C09 private profiles, scenarios, opportunities, reminders and updates isolate owners", async () => {
    const f = await fixture(); await confirm(f); const first = await personalOpportunityEngine();
    const [other] = await db.insert(s.owners).values({ authSubject: `${randomUUID()}@other.local` }).returning(); ctx.ownerId = other.id;
    let result = await personalOpportunityEngine(); expect(result.opportunities).toHaveLength(0); expect(result.reminders).toHaveLength(0); expect(result.profiles).toHaveLength(0);
    await expect(updateReminder(first.reminders[0].id, { status: "completed" })).rejects.toThrow("提醒不存在");
    await expect(confirmOpportunity({ promotionId: f.promotion.id, fingerprint: first.opportunities[0].fingerprint, facts: facts() })).rejects.toThrow();
    await upsertMembership({ programCode: f.program.code, membershipTier: "金卡" }); result = await personalOpportunityEngine(); expect(result.opportunities[0].eligibility.status).toBe("fails-known-conditions"); expect(result.profiles[0].facts).toEqual({}); expect(result.profiles[0].confirmedAt).toBeNull();
    ctx.ownerId = f.owner.id; expect((await only(f)).eligibility.status).toBe("meets-known-conditions");
  });
  it("C10 AI key is irrelevant; radar and draft intelligence cannot enter opportunities; no-content empty state", async () => {
    const f = await fixture(); expect((await only(f)).id).toBe(f.promotion.id);
    await db.update(s.promotions).set({ publicationStatus: "pending_review" }).where(eq(s.promotions.id, f.promotion.id));
    expect((await personalOpportunityEngine()).opportunities).toHaveLength(0);
    await setPromotionStatus(f.promotion.id, "published", "test-admin"); expect((await only(f)).id).toBe(f.promotion.id);
    await setPromotionStatus(f.promotion.id, "withdrawn", "test-admin"); expect((await personalOpportunityEngine()).opportunities).toHaveLength(0);
    const read = await personalOpportunityEngine(); expect(read.reminders.filter((r) => r.active)).toHaveLength(0);
  });
  it("C11 admin schema is strictly validated and publication retains manual evidence gate", async () => {
    // Real admin service always uses the V1 supported program.
    await db.insert(s.programs).values({ code: "jinjiang-rewards", name: "锦江荟", kind: "hotel", pointsName: "积分" }).onConflictDoNothing();
    const rule = await saveRule({ code: `c-${randomUUID()}`, name: "结构化测试", type: "membership", terms: ["仅白金"], validFrom: day(-1), opportunity: { complete: true, membershipTiers: ["白金"] } }, "test-admin");
    const row = (await db.select().from(s.ruleVersions).where(eq(s.ruleVersions.id, rule.versionId)))[0];
    expect(row.structuredContent.opportunity).toEqual({ complete: true, membershipTiers: ["白金"] });
    await expect(setRuleVersionStatus(rule.versionId, "test-admin")).rejects.toThrow("必须关联来源证据");
    await expect(saveRule({ code: "bad", name: "bad", type: "membership", terms: ["bad"], validFrom: now(), opportunity: { complete: true, admin: true } as never }, "test-admin")).rejects.toThrow();
  });
  it("C12 reuses known action progress but never sends draft rule dates as actionable reminders", async () => {
    const f = await fixture(); const action = await createPromotionAction({ promotionId: f.promotion.id });
    await updateAction(action.action.id, "participating", undefined, { progress: facts() });
    const o = await only(f); expect(o.eligibility.status).toBe("meets-known-conditions"); expect(o.deadline.getTime()).toBeLessThan(f.promotion.stayEndsAt!.getTime());
    await db.update(s.ruleVersions).set({ publicationStatus: "draft", structuredContent: { opportunity: { complete: true, spendEndsAt: day(1).toISOString() } } }).where(eq(s.ruleVersions.id, f.version.id));
    const read = await personalOpportunityEngine(); expect(read.opportunities[0].eligibility.status).toBe("rule-pending-verification");
    expect(read.reminders.filter((r) => r.active && ["spend", "rule-change"].includes(r.kind))).toHaveLength(0);
  });
  it("C13 explicit not-enrolled remains the original failing state but receives the registration deadline", async () => {
    const f = await fixture(); const o = await only(f);
    await confirmOpportunity({ promotionId: o.id, fingerprint: o.fingerprint, facts: { ...facts(), enrolled: false } });
    const read = await personalOpportunityEngine(); expect(read.opportunities[0].eligibility.status).toBe("fails-known-conditions");
    expect(read.reminders.filter((r) => r.active && r.kind === "enrollment")).toHaveLength(1);
  });
});
