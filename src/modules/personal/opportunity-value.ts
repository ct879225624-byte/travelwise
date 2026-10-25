import { calculateActivityReward, compareOfferQuotes, compareRateQuotes, parseMinor, parsePoints, parsePointValue } from "@/modules/decision";
import type { EligibilityStatus, OfferQuote } from "@/modules/decision/types";
import type { savedScenarios } from "@/db/schema";
import { opportunityRuleSchema, type OpportunityValue, type Promotion, type Rule } from "./opportunity-model";

type Scenario = typeof savedScenarios.$inferSelect;
// Recompute original inputs, never trust the client-supplied result JSON.
export function calculateOpportunityValue(s: Scenario, p: Promotion, ruleIds: string[], eligibility: EligibilityStatus, rules: Rule[] = []): OpportunityValue | null {
  const i = s.inputSnapshot;
  if (i.promotionId !== p.id && i.promotionRef !== p.slug) return null;
  const expectedWarnings = ["奖励尚未到账，以下为预期价值，不是现金收益", "需要主动领取，当前不能视为已到账", "额外消费被单独计入增量成本；不能把全部达标消费当作活动成本"];
  if (s.unresolved.some((r) => !expectedWarnings.includes(r)) || !s.quoteSource || !s.quotedAt || s.pointValueMicros === null || ruleIds.length !== s.ruleVersionIds.length || ruleIds.some((id) => !s.ruleVersionIds.includes(id))) return null;
  const text = (key: string) => { if (typeof i[key] !== "string" || !i[key].trim()) throw new Error("Missing calculation input"); return i[key] as string; };
  const integer = (key: string) => { const v = Number(text(key)); if (!Number.isSafeInteger(v) || v < 0) throw new Error("Invalid integer"); return v; };
  try {
    if (parsePointValue(text(s.calculatorType === "offer-comparison" ? "offerPointValue" : "pointValue")) !== s.pointValueMicros) return null;
    let valueMicros: bigint; let formula: string; let risks: string[]; let label: OpportunityValue["label"] = "潜在节省";
    if (s.calculatorType === "activity-reward") {
      if (p.rewardUnit !== "积分" || p.rewardAmount === null || parsePoints(text("rewardPoints")) !== p.rewardAmount || eligibility !== "meets-known-conditions") return null;
      for (const rule of rules) {
        const parsed = opportunityRuleSchema.safeParse(rule.structuredContent.opportunity);
        if (parsed.success && parsed.data.minSpendMinor !== undefined && parseMinor(text("threshold")) < BigInt(parsed.data.minSpendMinor)) return null;
      }
      if (!["not-required", "required-not-claimed", "claimed", "expired"].includes(text("claimStatus")) || !["not-issued", "pending", "issued"].includes(text("rewardStatus"))) return null;
      const result = calculateActivityReward({ thresholdMinor: parseMinor(text("threshold")), qualifyingSpendMinor: parseMinor(text("qualifying")), plannedSpendMinor: parseMinor(text("planned")), extraSpendMinor: parseMinor(text("extra")), reward: { type: "fixed-points", points: p.rewardAmount }, pointValueMicros: parsePointValue(text("pointValue"))!, extraEconomicCostMinor: parseMinor(text("extraCost")), foregoneValueMinor: parseMinor(text("foregone")), participationFeeMinor: parseMinor(text("fee")), usesAlready: integer("used"), usesLimit: i.limit === "" ? null : integer("limit"), claimStatus: text("claimStatus") as "not-required", rewardStatus: text("rewardStatus") as "pending", qualificationStatus: eligibility });
      valueMicros = result.netIncrementalValueMicros; formula = result.formula; risks = result.warnings; label = "预计返还";
    } else if (s.calculatorType === "rate-comparison") {
      const common = { source: s.quoteSource, quotedAt: s.quotedAt.toISOString(), hotel: text("hotel"), room: text("room"), checkIn: text("checkIn"), checkOut: text("checkOut"), breakfast: text("breakfast"), benefits: text("benefits"), taxesIncluded: true };
      const result = compareRateQuotes({ standard: { ...common, cashMinor: parseMinor(text("standardCash")), pointsEarned: parsePoints(text("standardPoints")), cancellation: text("cancellation") }, bonus: { ...common, cashMinor: parseMinor(text("bonusCash")), pointsEarned: parsePoints(text("bonusPoints")), cancellation: text("bonusCancellation") }, pointValueMicros: parsePointValue(text("pointValue")) });
      if (result.status !== "determinate" || result.netIncrementalValueMicros === null) return null;
      valueMicros = result.netIncrementalValueMicros; formula = result.formula; risks = result.reasons;
    } else if (s.calculatorType === "offer-comparison") {
      if (i.sameRights !== true || eligibility !== "meets-known-conditions" || i.aEligibility !== "meets-known-conditions" || i.bEligibility !== "meets-known-conditions") return null;
      const quote = (prefix: string): OfferQuote => ({ id: prefix, label: prefix, cashMinor: parseMinor(text(`${prefix}Cash`)), taxesMinor: parseMinor(text(`${prefix}Taxes`)), pointsSpent: parsePoints(text(`${prefix}Spent`)), pointsEarned: parsePoints(text(`${prefix}Earned`)), eligibility, cancellation: "相同", breakfast: "相同", benefits: "相同" });
      const result = compareOfferQuotes({ quotes: [quote("a"), quote("b")], pointValueMicros: parsePointValue(text("offerPointValue")) });
      const [a, b] = result.quotes;
      if (result.status !== "determinate" || a.economicCostMicros === null || b.economicCostMicros === null) return null;
      valueMicros = a.economicCostMicros - b.economicCostMicros; formula = result.formula; risks = result.reasons;
    } else return null;
    return { scenarioId: s.id, calculatorType: s.calculatorType, label, valueMicros, formula, inputs: i, source: s.quoteSource, quotedAt: s.quotedAt, assumptions: s.assumptions, risks: [...risks, "按已保存报价和人工估值复算，报价可能变化；预计价值尚未实现"] };
  } catch { return null; }
}
