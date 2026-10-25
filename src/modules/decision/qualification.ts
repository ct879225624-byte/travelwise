import type { EligibilityResult } from "./types";

type QualificationFacts = {
  membershipTier?: string;
  date?: string;
  region?: string;
  brand?: string;
  channel?: string;
  cardHeld?: boolean;
  enrolled?: boolean;
  usesAlready?: number;
};

type QualificationRequirements = {
  membershipTiers?: string[];
  startAt?: string;
  endAt?: string;
  regions?: string[];
  brands?: string[];
  channels?: string[];
  cardRequired?: boolean;
  enrollmentRequired?: boolean;
  usesLimit?: number;
};

export function evaluateQualification(facts: QualificationFacts, requirements: QualificationRequirements): EligibilityResult {
  const missing: string[] = []; const conflicts: string[] = []; const reasons: string[] = [];
  const need = (condition: boolean, label: string) => { if (condition) missing.push(label); };
  if (requirements.membershipTiers?.length) { need(!facts.membershipTier, "会员等级"); if (facts.membershipTier && !requirements.membershipTiers.includes(facts.membershipTier)) conflicts.push(`会员等级 ${facts.membershipTier} 不在适用范围`); }
  if (requirements.startAt || requirements.endAt) { need(!facts.date, "适用日期"); if (facts.date) { const time = Date.parse(facts.date); if (Number.isNaN(time)) conflicts.push("适用日期格式无效"); else { if (requirements.startAt && time < Date.parse(requirements.startAt)) conflicts.push("日期早于活动开始"); if (requirements.endAt && time >= Date.parse(requirements.endAt)) conflicts.push("日期已达到活动结束时间"); } } }
  if (requirements.regions?.length) { need(!facts.region, "地区"); if (facts.region && !requirements.regions.includes(facts.region)) conflicts.push(`地区 ${facts.region} 不适用`); }
  if (requirements.brands?.length) { need(!facts.brand, "酒店品牌"); if (facts.brand && !requirements.brands.includes(facts.brand)) conflicts.push(`酒店品牌 ${facts.brand} 不适用`); }
  if (requirements.channels?.length) { need(!facts.channel, "预订渠道"); if (facts.channel && !requirements.channels.includes(facts.channel)) conflicts.push(`预订渠道 ${facts.channel} 不适用`); }
  if (requirements.cardRequired) { need(facts.cardHeld === undefined, "联名卡持有状态"); if (facts.cardHeld === false) conflicts.push("未满足联名卡持有条件"); }
  if (requirements.enrollmentRequired) { need(facts.enrolled === undefined, "报名状态"); if (facts.enrolled === false) conflicts.push("尚未完成报名"); }
  if (requirements.usesLimit !== undefined) { need(facts.usesAlready === undefined, "已使用次数"); if (facts.usesAlready !== undefined && facts.usesAlready >= requirements.usesLimit) conflicts.push("已超过奖励次数上限"); }
  if (missing.length) reasons.push(`需要补充：${missing.join("、")}`);
  if (conflicts.length) reasons.push(...conflicts);
  if (conflicts.length) return { status: "fails-known-conditions", reasons, missing, conflicts };
  if (missing.length) return { status: "information-insufficient", reasons, missing, conflicts };
  reasons.push("你提供的信息符合已知规则；这不等于官方已确认个人资格");
  return { status: "meets-known-conditions", reasons, missing, conflicts };
}
