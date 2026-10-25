import { publicPromotionSchema } from "./model";

export const demoProgram = {
  id: "10000000-0000-4000-8000-000000000001", code: "jinjiang-rewards", name: "锦江荟", kind: "hotel" as const, pointsName: "锦江积分",
};
export const demoRuleId = "20000000-0000-4000-8000-000000000001";

// Entirely fictional. No actual Jin Jiang eligibility, rewards, or stacking claims.
export const demoPromotions = publicPromotionSchema.array().parse([{
  id: "30000000-0000-4000-8000-000000000001", slug: "demo-jinjiang-points-stay",
  title: "DEMO · 住一晚，多一种积分可能", category: "住宿积分",
  summary: "一个用于演示的多倍积分活动。先读规则、核对资格，再衡量额外投入是否值得。",
  programId: demoProgram.id, programName: demoProgram.name, pointsName: demoProgram.pointsName,
  isDemo: true, isSuspended: false, startsAt: "2026-10-01T00:00:00+08:00", endsAt: "2026-12-01T00:00:00+08:00", timeZone: "Asia/Shanghai",
  lifecycleStatus: "active", verificationStatus: "unverified", qualification: "unknown", stacking: "unknown",
  publishedAt: "2026-09-28T10:00:00+08:00", updatedAt: "2026-10-09T10:00:00+08:00",
  ruleVersion: { id: "40000000-0000-4000-8000-000000000001", version: 1, isDemo: true, terms: [
    "DEMO：仅模拟通过指定房价获得额外积分的阅读流程，不代表锦江荟真实活动。",
    "资格尚未确认。会员等级、预订渠道、参与酒店和报名要求需要逐一核对。",
    "优惠叠加关系未知，不能假设可与会员折扣或优惠券同时使用。",
    "积分价值尚未估算，预期返分不等于已兑现收益。",
  ] },
  evidence: [{ id: "50000000-0000-4000-8000-000000000001", sourceLabel: "DEMO / 内置示例规则",
    sourceUrl: null, excerpt: "本证据由开发环境创建，用于验证规则版本与活动展示的关联。没有真实活动来源。",
    isDemo: true, capturedAt: "2026-10-09T10:00:00+08:00", verifiedAt: null }],
}]);
