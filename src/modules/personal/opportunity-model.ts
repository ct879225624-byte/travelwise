import { z } from "zod";
import { evaluateQualification } from "@/modules/decision/qualification";
import { validateRuleApplicability } from "@/modules/decision/rules";
import { effectiveLifecycle } from "@/modules/intelligence/model";
import type { EligibilityResult, EligibilityStatus } from "@/modules/decision/types";
import type { actions, evidence, pointBatches, promotions, ruleVersions, wallets } from "@/db/schema";

const amount = z.string().regex(/^\d{1,19}$/).refine((v) => /^\d{1,19}$/.test(v) && BigInt(v) <= 9223372036854775807n);
const names = z.array(z.string().trim().min(1).max(120)).max(50);
// Only an administrator-reviewed, complete schema can establish known eligibility.
// Natural-language terms and radar text never become executable conditions.
export const opportunityRuleSchema = z.object({
  complete: z.boolean().default(false), membershipTiers: names.optional(), cardRequired: z.boolean().optional(),
  cardTypes: names.optional(), benefitNames: names.optional(), enrollmentRequired: z.boolean().optional(),
  brands: names.optional(), regions: names.optional(), channels: names.optional(),
  usesLimit: z.number().int().nonnegative().optional(), minSpendMinor: amount.optional(), minNights: z.number().int().nonnegative().optional(),
  minPoints: amount.optional(), spendEndsAt: z.iso.datetime({ offset: true }).optional(),
}).strict();
export const opportunityFactsSchema = z.object({
  brand: z.string().trim().min(1).max(120).optional(), region: z.string().trim().min(1).max(120).optional(),
  channel: z.string().trim().min(1).max(120).optional(), enrolled: z.boolean().optional(),
  usesAlready: z.number().int().nonnegative().optional(), qualifyingSpendMinor: amount.optional(), nights: z.number().int().nonnegative().optional(),
  stayAt: z.iso.datetime({ offset: true }).optional(),
}).strict();
export type OpportunityFacts = z.infer<typeof opportunityFactsSchema>;
export type Promotion = typeof promotions.$inferSelect;
export type Rule = typeof ruleVersions.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type Batch = typeof pointBatches.$inferSelect;
export const eligibilityLabels: Record<EligibilityStatus, string> = {
  "meets-known-conditions": "符合已知条件", "fails-known-conditions": "不符合已知条件",
  "information-insufficient": "信息不足", "rule-pending-verification": "规则待核实",
};
export type Opportunity = {
  id: string; title: string; slug: string; programId: string; programName: string; fingerprint: string;
  eligibility: EligibilityResult; satisfied: string[]; reasons: string[]; ruleChanged: boolean;
  deadline: Date; timeZone: string; nextStep: string; href: string; score: number; scoreReasons: string[];
  sources: Array<{ id: string; label: string; url: string }>;
  rules: Array<{ id: string; version: number }>; value: OpportunityValue | null;
  enrolled: boolean | undefined;
};
export type OpportunityValue = {
  scenarioId: string; calculatorType: string; label: "潜在节省" | "预计返还"; valueMicros: bigint;
  formula: string; inputs: Record<string, unknown>; assumptions: string[]; risks: string[]; source: string; quotedAt: Date;
};
export function officialSources(sources: Evidence[]) {
  return sources.filter((s) => !s.isDemo && s.sourceKind === "official" && s.verificationStatus === "official_verified" && s.sourceUrl && s.verifiedAt);
}
export function isFormal(p: Promotion, sources: Evidence[]) {
  return p.publicationStatus === "published" && p.lifecycleStatus !== "archived" && !p.isDemo && p.verificationStatus === "official_verified" && !p.isSuspended && officialSources(sources).length > 0;
}
export function isCurrent(p: Promotion, sources: Evidence[], now: Date) {
  return isFormal(p, sources) && effectiveLifecycle({ ...p, startsAt: p.startsAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null }, now) === "active";
}
export function evaluateOpportunity(input: { promotion: Promotion; rules: Rule[]; sources: Evidence[]; wallet?: Wallet; facts: OpportunityFacts; batches: Batch[]; changed: boolean; now: Date }): { eligibility: EligibilityResult; satisfied: string[] } {
  const { promotion: p, rules, sources, wallet, facts, batches, now } = input;
  const missing: string[] = []; const conflicts: string[] = []; const satisfied: string[] = []; const pending: string[] = [];
  if (!rules.length) pending.push("活动尚未关联可核对的规则版本");
  const tier = wallet?.membershipTier && wallet.membershipTier !== "未知" && (!wallet.tierExpiresAt || wallet.tierExpiresAt > now) ? wallet.membershipTier : undefined;
  const balance = batches.filter((b) => b.programId === p.programId && (!b.expiresAt || b.expiresAt > now)).reduce((sum, b) => sum + b.remainingPoints, 0n);
  const check = (known: boolean, meets: boolean, label: string) => { if (!known) missing.push(label); else if (!meets) conflicts.push(`${label}未满足`); else satisfied.push(label); };
  for (const rule of rules) {
    const applicability = validateRuleApplicability({ id: rule.id, version: rule.version, publicationStatus: rule.publicationStatus, verificationStatus: rule.verificationStatus, validFrom: rule.validFrom.toISOString(), validUntil: rule.validUntil?.toISOString() ?? null, evidenceIds: officialSources(sources).filter((s) => s.ruleVersionId === rule.id).map((s) => s.id) }, now.toISOString());
    if (rule.isDemo || applicability.status !== "usable") pending.push(...applicability.reasons, ...(rule.isDemo ? ["DEMO 规则不可用于正式机会"] : []));
    const parsed = opportunityRuleSchema.safeParse(rule.structuredContent.opportunity);
    if (!parsed.success || !parsed.data.complete) missing.push(`规则 V${rule.version} 的完整条件尚未经人工结构化确认`);
    if (!parsed.success) continue;
    const r = parsed.data;
    const requirements = { ...r, brands: [...new Set([...(r.brands ?? []), ...p.brands])], regions: [...new Set([...(r.regions ?? []), ...p.regions])], channels: [...new Set([...(r.channels ?? []), ...p.channels])] };
    // Each set is evaluated independently; combining restrictive sets by union
    // would accidentally allow values excluded by one of the linked rules.
    for (const scope of [r, { brands: p.brands, regions: p.regions, channels: p.channels }]) {
      const result = evaluateQualification({ ...facts, membershipTier: tier, cardHeld: wallet?.cardHeld ?? undefined }, scope);
      missing.push(...result.missing); conflicts.push(...result.conflicts);
    }
    const known = { ...facts, membershipTier: tier, cardHeld: wallet?.cardHeld ?? undefined };
    for (const [key, label] of [["membershipTiers", "会员等级"], ["cardRequired", "联名卡持有状态"], ["enrollmentRequired", "报名状态"], ["brands", "酒店品牌"], ["regions", "地区"], ["channels", "预订渠道"], ["usesLimit", "已使用次数"]] as const) {
      const requirement = requirements[key];
      const scopes = key === "brands" ? [r.brands, p.brands] : key === "regions" ? [r.regions, p.regions] : key === "channels" ? [r.channels, p.channels] : [requirement];
      if (requirement !== undefined && requirement !== false && (!Array.isArray(requirement) || requirement.length > 0) && scopes.every((scope) => evaluateQualification(known, { [key]: scope }).status === "meets-known-conditions")) satisfied.push(label);
    }
    if (r.cardTypes?.length) check(wallet?.cardHeld !== null && wallet?.cardHeld !== undefined && (wallet.cardHeld === false || Boolean(wallet.cardType)), wallet?.cardHeld === true && r.cardTypes.includes(wallet.cardType ?? ""), "适用信用卡种类");
    for (const name of r.benefitNames ?? []) {
      const benefit = wallet?.benefits.find((b) => b.name === name);
      check(Boolean(benefit && (benefit.usedAt || benefit.expiresAt)), Boolean(benefit && !benefit.usedAt && benefit.expiresAt && Date.parse(benefit.expiresAt) > now.getTime()), `权益：${name}及有效期`);
    }
    if (r.minPoints !== undefined) {
      const certain = batches.filter((b) => b.programId === p.programId && (b.expiryStatus === "never" || b.expiryStatus === "known" && b.expiresAt && b.expiresAt > now)).reduce((sum, b) => sum + b.remainingPoints, 0n);
      check(Boolean(wallet), balance >= BigInt(r.minPoints), "可用积分余额");
      if (balance >= BigInt(r.minPoints) && certain < BigInt(r.minPoints)) missing.push("用于达标的积分有效期尚未确认");
    }
    if (r.minSpendMinor !== undefined) check(facts.qualifyingSpendMinor !== undefined, facts.qualifyingSpendMinor !== undefined && BigInt(facts.qualifyingSpendMinor) >= BigInt(r.minSpendMinor), "已确认合资格消费");
    if (r.minNights !== undefined) check(facts.nights !== undefined, facts.nights !== undefined && facts.nights >= r.minNights, "已确认入住晚数");
  }
  if (p.stayStartsAt || p.stayEndsAt) {
    const result = evaluateQualification({ date: facts.stayAt }, { startAt: p.stayStartsAt?.toISOString(), endAt: p.stayEndsAt?.toISOString() });
    missing.push(...result.missing.map(() => "入住日期")); conflicts.push(...result.conflicts);
    if (!result.missing.length && !result.conflicts.length) satisfied.push("入住有效期");
  }
  if (input.changed) missing.push("规则已变化，请按当前版本重新确认个人条件");
  if (p.qualification === "ineligible") conflicts.push("正式活动记录标注不适用");
  const status: EligibilityStatus = pending.length ? "rule-pending-verification" : conflicts.length ? "fails-known-conditions" : missing.length ? "information-insufficient" : "meets-known-conditions";
  return { eligibility: { status, missing: [...new Set(missing)], conflicts: [...new Set(conflicts)], reasons: [...new Set([...pending, ...conflicts, ...missing, ...(status === "meets-known-conditions" ? ["你保存的信息符合已知规则；仍以官方最终核验为准"] : [])])] }, satisfied: [...new Set(satisfied)] };
}
export function rankOpportunity(item: Pick<Opportunity, "eligibility" | "deadline" | "value" | "nextStep">, hasMembership: boolean, now: Date) {
  const scoreReasons: string[] = []; let score = 0;
  const add = (points: number, reason: string) => { score += points; scoreReasons.push(`${reason} +${points}`); };
  if (item.eligibility.status === "meets-known-conditions") add(100, "符合已知条件");
  const days = (item.deadline.getTime() - now.getTime()) / 86400000;
  if (days > 0 && days <= 3) add(30, "3 天内截止"); else if (days > 0 && days <= 14) add(20, "14 天内截止");
  if (item.value) add(15, "已有可复算方案");
  if (hasMembership) add(10, "已登记相关会员");
  if (item.nextStep) add(5, "有明确下一步");
  return { score, scoreReasons };
}
export function sortOpportunities(items: Opportunity[]) {
  return items.sort((a, b) => b.score - a.score || a.deadline.getTime() - b.deadline.getTime() || a.id.localeCompare(b.id));
}
