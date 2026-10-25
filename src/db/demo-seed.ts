import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { auditLogs, evidence, guideCategories, guideEvidence, guideVersions, guides, promotionEvidence, programs, promotions, promotionVersions, rules, ruleVersions } from "./schema";
import { demoProgram, demoPromotions, demoRuleId } from "@/modules/intelligence/demo";
import { guideCategoryNames } from "./reference-data";

// Caller supplies a transaction, so fixture rows and audit entries commit together.
export async function insertDemo(db: Pick<Database, "insert" | "select">) {
  const existing = await db.select({ id: programs.id }).from(programs).where(eq(programs.code, demoProgram.code));
  const programId = existing[0]?.id ?? demoProgram.id;
  await db.insert(programs).values({ ...demoProgram, id: programId }).onConflictDoNothing();
  await db.insert(rules).values({ id: demoRuleId, programId, code: "demo-stay-points", name: "DEMO · 住宿积分示例规则" }).onConflictDoNothing();
  for (const demo of demoPromotions) {
    const ruleVersion = demo.ruleVersion;
    if (!ruleVersion) continue;
    await db.insert(ruleVersions).values({ id: ruleVersion.id, ruleId: demoRuleId, programId,
      version: ruleVersion.version, terms: ruleVersion.terms, isDemo: true,
      validFrom: new Date(demo.startsAt!), validUntil: new Date(demo.endsAt!), timeZone: demo.timeZone }).onConflictDoNothing();
    const inserted = await db.insert(promotions).values({ id: demo.id, programId, ruleVersionId: ruleVersion.id,
      slug: demo.slug, title: demo.title, summary: demo.summary, category: demo.category, publicationStatus: "published",
      isDemo: true, startsAt: new Date(demo.startsAt!), endsAt: new Date(demo.endsAt!), timeZone: demo.timeZone }).onConflictDoNothing().returning({ id: promotions.id });
    for (const source of demo.evidence) {
      await db.insert(evidence).values({ id: source.id, ruleVersionId: ruleVersion.id, sourceLabel: source.sourceLabel, sourceUrl: source.sourceUrl, excerpt: source.excerpt, sourceKind: source.sourceKind, originalPublishedAt: source.originalPublishedAt ? new Date(source.originalPublishedAt) : null, isDemo: source.isDemo, capturedAt: new Date(source.capturedAt), verifiedAt: null, verificationStatus: source.verificationStatus }).onConflictDoNothing();
    }
    if (inserted.length) await db.insert(auditLogs).values({ operation: "development.demo_seed", entityType: "promotion",
      entityId: demo.id, changedFields: ["demo_fixture"] });
  }

  const categories: string[] = [];
  for (const [index, name] of guideCategoryNames.entries()) {
    const slug = `jinjiang-guide-${index + 1}`;
    const found = await db.select({ id: guideCategories.id }).from(guideCategories).where(eq(guideCategories.slug, slug));
    const categoryId = found[0]?.id ?? crypto.randomUUID();
    categories.push(categoryId);
    await db.insert(guideCategories).values({ id: categoryId, slug, name, position: index + 1 }).onConflictDoNothing();
  }

  const realRuleId = "20000000-0000-4000-8000-000000000002";
  const realVersionId = "40000000-0000-4000-8000-000000000002";
  const realPromotionId = "30000000-0000-4000-8000-000000000002";
  const realEvidenceId = "50000000-0000-4000-8000-000000000002";
  await db.insert(rules).values({ id: realRuleId, programId, code: "spdb-jinjiang-2026", name: "浦发锦江联名卡 2026 住宿达标礼", type: "co-branded-card" }).onConflictDoNothing();
  await db.insert(ruleVersions).values({ id: realVersionId, ruleId: realRuleId, programId, version: 1, terms: ["2026 年 1 月 1 日至 12 月 31 日，通过锦江荟官方平台预订并在线支付，持卡人本人累计入住每满 15 间夜可获 10000 锦江积分。", "每个自然年最多获赠 5 次；达标后 5 个工作日内发放积分礼包，礼包自收到之日起 60 天内领取。", "积分、免房券兑换的免费间夜及钟点房不计入累计；从锦江荟 App 绑定第一张银行联名卡之日起统计，多张联名卡不重复累计，间夜每周年清空。", "官方原文同时使用自然年获赠上限和绑定周年统计，跨年度边界需向锦江荟 App 或官方客服核对。", "本权益积分自获取日起至次年年底有效；实际有效期及使用范围以锦江荟 App 公示为准。"], applicability: ["浦发银行锦江 WeHotel 联名信用卡主卡持卡人", "本人入住，官方平台预订并在线支付", "信用卡及锦江荟账户状态正常，已核对首张联名卡绑定日和有效间夜"], validFrom: new Date("2026-01-01T00:00:00+08:00"), validUntil: new Date("2026-12-31T23:59:59+08:00"), timeZone: "Asia/Shanghai", verificationStatus: "official_verified", publicationStatus: "published", publishedAt: new Date("2026-01-01T00:00:00+08:00"), revisionReason: "首批官方资料核实；Phase 6A 补全来源边界（仅新建夹具，既有版本不覆盖）" }).onConflictDoNothing();
  const insertedRealPromotion = await db.insert(promotions).values({ id: realPromotionId, programId, ruleVersionId: realVersionId, slug: "spdb-jinjiang-2026-stay-reward", title: "浦发锦江WeHotel联名卡住宿达标礼", summary: "2026 年活动期内，符合条件的主卡持卡人通过锦江荟官方平台预订并在线支付，累计入住每满 15 间夜可获 10000 锦江积分。", category: "联名信用卡", platform: "浦发银行 / 锦江荟", publicationStatus: "published", lifecycleStatus: "active", verificationStatus: "official_verified", eligibility: ["浦发银行锦江 WeHotel 联名信用卡主卡持卡人", "本人入住且通过锦江荟官方平台预订并在线支付", "免费兑换间夜与钟点房不计入；须核对首张联名卡绑定日起的有效间夜及账户状态"], rewardType: "锦江积分", rewardAmount: 10000n, rewardUnit: "积分/15间夜", startsAt: new Date("2026-01-01T00:00:00+08:00"), endsAt: new Date("2026-12-31T23:59:59+08:00"), stayStartsAt: new Date("2026-01-01T00:00:00+08:00"), stayEndsAt: new Date("2026-12-31T23:59:59+08:00"), timeZone: "Asia/Shanghai", brands: [], channels: ["锦江荟 App", "锦江荟公众号", "锦江 WeHotel 官网", "客服热线"], regions: [], steps: ["使用符合条件的主卡并核对首张联名卡绑定日", "通过官方平台预订并在线支付", "本人入住并累计符合条件的间夜", "达标后按实际收到礼包之日起 60 天内领取积分"], notes: ["每个自然年最多 5 次；原文另有绑定周年清零口径，跨年度需人工核对", "积分礼包达标后 5 个工作日内发放；没有统一固定领取截止日", "本权益积分自获取日起至次年年底有效，具体以 App 公示为准", "资料已核实不代表个人资格已确认；优惠叠加关系未知"], qualification: "unknown", stacking: "unknown", publishedAt: new Date("2026-01-01T00:00:00+08:00") }).onConflictDoNothing().returning({ id: promotions.id });
  await db.insert(promotionVersions).values({ promotionId: realPromotionId, version: 1, snapshot: { title: "浦发锦江WeHotel联名卡住宿达标礼", startsAt: "2026-01-01T00:00:00+08:00", endsAt: "2026-12-31T23:59:59+08:00" }, revisionReason: "首批官方资料核实", actor: "seed" }).onConflictDoNothing();
  await db.insert(evidence).values({ id: realEvidenceId, ruleVersionId: realVersionId, sourceLabel: "浦发银行信用卡 · 浦发银行锦江WeHotel联名信用卡权益细则", sourceUrl: "https://www.spdbccc.com.cn/zh/wap/miniSite/1435/tk.html", sourceKind: "official", originalPublishedAt: null, capturedAt: new Date("2026-10-10T00:00:00+08:00"), verifiedAt: new Date("2026-10-10T00:00:00+08:00"), verificationStatus: "official_verified", excerpt: "活动期为 2026 年 1 月 1 日至 12 月 31 日；主卡持卡人通过锦江荟官方平台预订并在线支付，累计入住每满 15 间夜可获 10000 锦江积分，每自然年最多 5 次。", scope: "住宿达标礼；原始核实摘录，完整资格及期限以原始细则和实际礼包为准" }).onConflictDoNothing();
  await db.insert(promotionEvidence).values({ promotionId: realPromotionId, evidenceId: realEvidenceId }).onConflictDoNothing();
  const guideId = "60000000-0000-4000-8000-000000000001";
  const insertedRealGuide = await db.insert(guides).values({ id: guideId, programId, categoryId: categories[2], slug: "jinjiang-points-earning-basics", title: "锦江荟基础积分获取：先确认实际支付金额", summary: "官方协议说明积分按实际支付金额和适用积分倍数计算，优惠抵扣部分不计入实际支付金额。", body: "锦江荟 App 服务协议写明：会员实际获得积分＝该笔订单的实际支付金额 × 订单适用板块及会员等级对应的积分倍数。使用优惠券、折扣券及其他优惠形式抵扣的金额，不属于实际支付金额，不予累计积分。具体倍数和活动条件以锦江官网及锦江荟 App 公示为准。\n\n操作时请保留订单、房价和优惠抵扣记录，并把可确认的规则版本与来源一起保存。", tags: ["积分", "基础规则", "来源核对"], publicationStatus: "published", verificationStatus: "official_verified", publishedAt: new Date("2026-10-10T00:00:00+08:00") }).onConflictDoNothing().returning({ id: guides.id });
  await db.insert(evidence).values({ id: "50000000-0000-4000-8000-000000000003", sourceLabel: "锦江荟 App 软件许可及服务协议", sourceUrl: "https://h5.bestwehotel.com/view/f42D5E7717", sourceKind: "official", originalPublishedAt: null, capturedAt: new Date("2026-10-10T00:00:00+08:00"), verifiedAt: new Date("2026-10-10T00:00:00+08:00"), verificationStatus: "official_verified", excerpt: "会员实际获得积分＝实际支付金额×适用板块及会员等级对应的积分倍数；优惠抵扣金额不属于实际支付金额，不予累计。", scope: "基础积分获取" }).onConflictDoNothing();
  await db.insert(guideVersions).values({ guideId, version: 1, snapshot: { title: "锦江荟基础积分获取：先确认实际支付金额" }, revisionReason: "首批官方资料核实", actor: "seed" }).onConflictDoNothing();
  await db.insert(guideEvidence).values({ guideId, evidenceId: "50000000-0000-4000-8000-000000000003" }).onConflictDoNothing();
  if (insertedRealPromotion.length) await db.insert(auditLogs).values({ operation: "seed.verified_content", entityType: "promotion", entityId: realPromotionId, changedFields: ["official_source", "published_content"] }).onConflictDoNothing();
  if (insertedRealGuide.length) await db.insert(auditLogs).values({ operation: "seed.verified_content", entityType: "guide", entityId: guideId, changedFields: ["official_source", "published_content"] }).onConflictDoNothing();
}
