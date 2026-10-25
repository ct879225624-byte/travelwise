import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { requireDatabaseUrl } from "../src/shared/env";

const actor = "phase6a:local-content-repair-20261020";
const operation = "phase6a.content_repair.completed";
const reason = "Phase 6A：按 2026-10-20 官方来源复核，纠正领取期限与适用边界；保留历史";
const sourceUrls = ["https://www.spdbccc.com.cn/zh/wap/miniSite/1435/tk.html", "https://h5.bestwehotel.com/view/f42D5E7717"];
const { auditLogs, evidence, guides, guideEvidence, guideRuleVersions, guideVersions, promotions, promotionEvidence, promotionRules, promotionVersions, rules, ruleVersions } = schema;
const snapshot = (value: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));

let client: ReturnType<typeof postgres> | undefined;
try {
  const url = new URL(requireDatabaseUrl());
  const database = decodeURIComponent(url.pathname.slice(1));
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !(database === "travelwise_dev" || /^travelwise_phase6a(?:_[a-z0-9]+)*_seed$/.test(database))) throw new Error("Local repair target rejected");
  client = postgres(url.href, { max: 1, connect_timeout: 5, connection: { timezone: "UTC" }, onnotice: () => {} });
  const result = await drizzle(client, { schema }).transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actor}))`);
    const [promotion] = await tx.select().from(promotions).where(eq(promotions.slug, "spdb-jinjiang-2026-stay-reward")).for("update");
    const [rule] = await tx.select().from(rules).where(eq(rules.id, "20000000-0000-4000-8000-000000000002")).for("update");
    const [guide] = await tx.select().from(guides).where(eq(guides.slug, "jinjiang-points-earning-basics")).for("update");
    if (!promotion || !rule || !guide || rule.code !== "spdb-jinjiang-2026" || promotion.programId !== rule.programId || guide.programId !== rule.programId || promotion.isDemo || guide.isDemo) throw new Error("Expected reference content missing or changed");
    const [completed] = await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.operation, operation), eq(auditLogs.entityId, promotion.id))).limit(1);
    if (completed) return { database, alreadyApplied: true, archivedTestPromotions: 0, reviewedTestEvidence: 0 };
    const oldSources = await tx.select().from(evidence).where(inArray(evidence.id, ["50000000-0000-4000-8000-000000000002", "50000000-0000-4000-8000-000000000003"])).for("update");
    if (oldSources.length !== 2 || oldSources.some((source) => source.isDemo || !sourceUrls.includes(source.sourceUrl ?? ""))) throw new Error("Expected original evidence missing or changed");
    const audit = async (entityType: string, entityId: string, action: string, changedFields: string[]) => {
      await tx.insert(auditLogs).values({ actor, operation: action, entityType, entityId, changedFields });
    };
    const [latestRule] = await tx.select({ version: max(ruleVersions.version) }).from(ruleVersions).where(eq(ruleVersions.ruleId, rule.id));
    const [latestPromotion] = await tx.select({ version: max(promotionVersions.version) }).from(promotionVersions).where(eq(promotionVersions.promotionId, promotion.id));
    if (latestRule.version !== 1 || promotion.ruleVersionId !== "40000000-0000-4000-8000-000000000002" || latestPromotion.version !== 1) throw new Error("Owner revision detected; stop for manual review instead of overwriting content");
    const [version] = await tx.insert(ruleVersions).values({
      ruleId: rule.id, programId: rule.programId, version: Number(latestRule.version ?? 0) + 1,
      terms: ["2026 年 1 月 1 日至 12 月 31 日，通过锦江荟官方平台预订并在线支付，主卡持卡人本人累计入住每满 15 间夜可获 10000 锦江积分，每个自然年最多获赠 5 次。", "达标后 5 个工作日内发放积分礼包，领取期限为实际收到礼包之日起 60 天，没有统一固定领取截止日。", "使用积分、免房券兑换的免费间夜及钟点房不计入累计。", "从锦江荟 App 绑定第一张银行与锦江会员联名信用卡之日起统计；多卡不重复累计，间夜每周年清空。自然年奖励上限与绑定周年统计的跨年度边界需向锦江荟 App 或官方客服核对。", "本权益积分自获取日起至次年年底有效，具体使用范围与实际有效期以锦江荟 App 公示为准。"],
      applicability: ["浦发银行锦江 WeHotel 联名信用卡主卡持卡人本人", "本人入住，官方平台预订并在线支付", "信用卡及锦江荟账户状态正常，已核对首张联名卡绑定日和有效间夜"],
      validFrom: new Date("2026-01-01T00:00:00+08:00"), validUntil: new Date("2026-12-31T23:59:59+08:00"), timeZone: "Asia/Shanghai", verificationStatus: "official_verified", publicationStatus: "published", publishedAt: new Date(), revisionReason: reason,
    }).returning();
    await audit("rule", rule.id, "phase6a.rule.version.create", ["version", "terms", "applicability", "publishedAt"]);
    for (const [index, originalUrl] of sourceUrls.entries()) {
      const original = oldSources.find((source) => source.sourceUrl === originalUrl)!;
      // Keep the previous capture and its timestamps intact; a new observation uses the same canonical URL.
      await tx.update(evidence).set({ verificationStatus: "reverify", updatedAt: new Date() }).where(eq(evidence.id, original.id));
      await audit("evidence", original.id, "phase6a.evidence.reverify", [`verificationStatus:${original.verificationStatus}->reverify`, "original_capture_preserved"]);
      const observedAt = new Date(index === 0 ? "2026-10-19T16:20:04.638Z" : "2026-10-19T16:20:05.656Z");
      const [observed] = await tx.insert(evidence).values({ ruleVersionId: index === 0 ? version.id : null, sourceLabel: `${original.sourceLabel} · 2026-10-20 复核`, sourceUrl: originalUrl, sourceKind: "official", originalPublishedAt: null, capturedAt: observedAt, verifiedAt: observedAt, verificationStatus: "official_verified", excerpt: original.excerpt, scope: index === 0 ? "住宿达标礼；完整排除条件、绑卡周期和领取期限以复核规则及官方原文为准。" : "仅基础积分公式摘要；具体倍数、有效期和兑换比例以最新公示及实际订单为准。" }).returning();
      if (index === 0) await tx.insert(promotionEvidence).values({ promotionId: promotion.id, evidenceId: observed.id });
      else await tx.insert(guideEvidence).values({ guideId: guide.id, evidenceId: observed.id });
      await audit("evidence", observed.id, "phase6a.evidence.observed", ["sourceUrl", "capturedAt", "verifiedAt", "originalPublishedAt:unknown", "source_observation"]);
    }
    const promotionNumber = Number(latestPromotion.version ?? 0);
    await tx.insert(promotionVersions).values({ promotionId: promotion.id, version: promotionNumber + 1, snapshot: snapshot(promotion), revisionReason: "Phase 6A 修正前完整存档", actor });
    const [corrected] = await tx.update(promotions).set({
      ruleVersionId: version.id, claimStartsAt: null, claimEndsAt: null, qualification: "unknown", stacking: "unknown", regions: [],
      eligibility: version.applicability, steps: ["核对本人主卡、账户状态及首张联名卡绑定日", "通过官方渠道预订并在线支付，本人入住符合条件的间夜", "以实际收到礼包之日起 60 天内领取积分"],
      notes: ["资料已核实不代表个人资格已确认；优惠叠加关系未知。", "积分及免房券兑换间夜、钟点房不计入。", "自然年最多 5 次；绑卡周年间夜清零口径需人工核对。", "达标后 5 个工作日发放礼包，按实际收到日期计算 60 天领取期限。"], updatedAt: new Date(),
    }).where(eq(promotions.id, promotion.id)).returning();
    await tx.insert(promotionVersions).values({ promotionId: promotion.id, version: promotionNumber + 2, snapshot: snapshot(corrected), revisionReason: reason, actor });
    await audit("promotion", promotion.id, "phase6a.promotion.correct", ["ruleVersionId", "claimStartsAt", "claimEndsAt", "qualification", "stacking", "eligibility", "regions", "steps", "notes", "before_and_after_versions"]);
    const previousRules = await tx.select({ id: ruleVersions.id }).from(ruleVersions).where(eq(ruleVersions.ruleId, rule.id));
    const previousIds = previousRules.filter((row) => row.id !== version.id).map((row) => row.id);
    if (previousIds.length) {
      const previousLinks = await tx.select().from(promotionRules).where(and(eq(promotionRules.promotionId, promotion.id), inArray(promotionRules.ruleVersionId, previousIds)));
      if (previousLinks.length) {
        await tx.insert(promotionRules).values({ promotionId: promotion.id, ruleVersionId: version.id }).onConflictDoNothing();
        await tx.delete(promotionRules).where(and(eq(promotionRules.promotionId, promotion.id), inArray(promotionRules.ruleVersionId, previousIds)));
        await audit("promotion", promotion.id, "phase6a.promotion.rule_links.correct", previousLinks.map((link) => `previousRuleVersion:${link.ruleVersionId}`));
      }
      const wrongLinks = await tx.select().from(guideRuleVersions).where(and(eq(guideRuleVersions.guideId, guide.id), inArray(guideRuleVersions.ruleVersionId, previousIds)));
      if (wrongLinks.length) {
        const [latestGuide] = await tx.select({ version: max(guideVersions.version) }).from(guideVersions).where(eq(guideVersions.guideId, guide.id));
        await tx.insert(guideVersions).values({ guideId: guide.id, version: Number(latestGuide.version ?? 0) + 1, snapshot: snapshot({ ...guide, previousRuleVersionIds: wrongLinks.map((link) => link.ruleVersionId), removedRuleVersionIds: wrongLinks.map((link) => link.ruleVersionId) }), revisionReason: "Phase 6A：取消基础积分攻略与联名卡住宿奖励规则的错误关联；保留原关联记录", actor });
        await tx.delete(guideRuleVersions).where(and(eq(guideRuleVersions.guideId, guide.id), inArray(guideRuleVersions.ruleVersionId, previousIds)));
        await tx.update(guides).set({ updatedAt: new Date() }).where(eq(guides.id, guide.id));
        await audit("guide", guide.id, "phase6a.guide.rule_links.correct", wrongLinks.map((link) => `removedRuleVersion:${link.ruleVersionId}`));
      }
    }
    const candidates = await tx.select().from(promotions).where(sql`${promotions.slug} LIKE 'e2e-promotion-%'`).for("update");
    const fixtures = candidates.filter((row) => /^e2e-promotion-\d{13}$/.test(row.slug) && row.title === "E2E 活动草稿" && row.summary === "仅用于验收流程" && row.category === "测试");
    let reviewedTestEvidence = 0;
    for (const fixture of fixtures) {
      const [latest] = await tx.select({ version: max(promotionVersions.version) }).from(promotionVersions).where(eq(promotionVersions.promotionId, fixture.id));
      await tx.insert(promotionVersions).values({ promotionId: fixture.id, version: Number(latest.version ?? 0) + 1, snapshot: snapshot(fixture), revisionReason: "Phase 6A：旧验收夹具归档前存档，非正式业务内容", actor });
      await tx.update(promotions).set({ publicationStatus: "archived", lifecycleStatus: "archived", verificationStatus: "reverify", updatedAt: new Date() }).where(eq(promotions.id, fixture.id));
      await audit("promotion", fixture.id, "phase6a.test_fixture.archived", ["publicationStatus", "lifecycleStatus", "verificationStatus"]);
      const fixtureSources = await tx.select().from(evidence).where(eq(evidence.sourceUrl, `https://example.com/e2e/${fixture.id}`));
      for (const source of fixtureSources.filter((row) => row.sourceLabel === "E2E 官方来源" && row.excerpt === "E2E 证据")) {
        await tx.update(evidence).set({ sourceKind: "other", verificationStatus: "reverify", updatedAt: new Date() }).where(eq(evidence.id, source.id));
        await audit("evidence", source.id, "phase6a.test_evidence.reverify", [`sourceKind:${source.sourceKind}->other`, `verificationStatus:${source.verificationStatus}->reverify`, "test_source_not_official_business_evidence"]);
        reviewedTestEvidence += 1;
      }
    }
    await audit("promotion", promotion.id, operation, ["atomic_local_repair", "historical_rows_preserved", "no_private_table_writes", `archivedTestPromotions:${fixtures.length}`, `reviewedTestEvidence:${reviewedTestEvidence}`]);
    return { database, alreadyApplied: false, ruleVersion: version.version, archivedTestPromotions: fixtures.length, reviewedTestEvidence };
  });
  console.log(JSON.stringify({ contentRepair: "PASS", ...result }));
} catch {
  console.error("Content repair FAILED and rolled back: verify the approved local target, migration 0006 and expected reference records. Credentials suppressed.");
  process.exitCode = 1;
} finally { if (client) await client.end(); }
