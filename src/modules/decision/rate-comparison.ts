import { assertNonNegative, formatRatio, moneyToMicros, pointsValue } from "./math";
import type { Quote, RateComparison } from "./types";

function validateQuote(quote: Quote) {
  assertNonNegative("现金总价", quote.cashMinor);
  if (quote.pointsEarned !== null) assertNonNegative("预计积分", quote.pointsEarned);
  if (quote.otherCostMinor !== undefined) assertNonNegative("其他成本", quote.otherCostMinor);
  if (quote.foregoneValueMinor !== undefined) assertNonNegative("放弃权益价值", quote.foregoneValueMinor);
}

function comparabilityReasons(a: Quote, b: Quote): string[] {
  const reasons: string[] = [];
  if ([a, b].some((quote) => [quote.hotel, quote.room, quote.source, quote.cancellation, quote.breakfast, quote.benefits].some((value) => !value.trim() || ["待核实", "待确认", "未知", "unknown"].includes(value.trim().toLowerCase())))) reasons.push("至少一个报价的酒店、房型、来源或重要权益尚未确认");
  if ([a, b].some((quote) => Number.isNaN(Date.parse(quote.checkIn)) || Number.isNaN(Date.parse(quote.checkOut)) || Number.isNaN(Date.parse(quote.quotedAt)) || Date.parse(quote.checkOut) <= Date.parse(quote.checkIn))) reasons.push("至少一个报价缺少有效的入住、退房或查询时间，或退房不晚于入住");
  if (a.hotel !== b.hotel) reasons.push("酒店不同");
  if (a.room !== b.room) reasons.push("房型不同");
  if (a.checkIn !== b.checkIn || a.checkOut !== b.checkOut) reasons.push("入住日期不同");
  if (a.cancellation !== b.cancellation) reasons.push("退改条件不同");
  if (a.breakfast !== b.breakfast) reasons.push("早餐权益不同");
  if (a.benefits !== b.benefits) reasons.push("其他重要权益不同");
  if (a.taxesIncluded !== b.taxesIncluded) reasons.push("税费口径不同");
  if (a.quotedAt !== b.quotedAt) reasons.push("报价查询时间不同，价格可能已变化");
  return reasons;
}

export function compareRateQuotes(input: { standard: Quote; bonus: Quote; pointValueMicros: bigint }): RateComparison {
  validateQuote(input.standard);
  validateQuote(input.bonus);
  assertNonNegative("积分估值", input.pointValueMicros);
  const reasons = comparabilityReasons(input.standard, input.bonus);
  if (!input.standard.taxesIncluded || !input.bonus.taxesIncluded) reasons.push("至少一个报价未确认含必要税费");
  const extraCashMinor = input.bonus.cashMinor - input.standard.cashMinor;
  const extraPoints = input.standard.pointsEarned === null || input.bonus.pointsEarned === null ? null : input.bonus.pointsEarned - input.standard.pointsEarned;
  const extraCostMinor = (input.bonus.otherCostMinor ?? 0n) - (input.standard.otherCostMinor ?? 0n) + (input.bonus.foregoneValueMinor ?? 0n) - (input.standard.foregoneValueMinor ?? 0n);
  const extraPointsValueMicros = extraPoints === null ? null : pointsValue(extraPoints, input.pointValueMicros);
  const netIncrementalValueMicros = extraPointsValueMicros === null ? null : extraPointsValueMicros - moneyToMicros(extraCashMinor + extraCostMinor);
  const breakEvenValueMicrosPerPoint = extraPoints !== null && extraPoints > 0n ? formatRatio(moneyToMicros(extraCashMinor + extraCostMinor), extraPoints * 1_000_000n, 7) : null;
  const status = extraPoints === null ? "incomplete" : reasons.length ? "needs-review" : "determinate";
  const recommendation = status !== "determinate" || netIncrementalValueMicros === null ? "no-unconditional-recommendation" : netIncrementalValueMicros > 0n ? "bonus" : "standard";
  const allReasons = [...reasons];
  if (extraPoints === null) allReasons.push("至少一个方案的预计积分未知，无法计算积分增量");
  if (extraPoints !== null && extraPoints <= 0n) allReasons.push("多倍积分方案没有带来正的额外积分，不能生成积分盈亏平衡值");
  return {
    status, standard: input.standard, bonus: input.bonus, extraCashMinor, extraPoints, extraPointsValueMicros,
    netIncrementalValueMicros, breakEvenValueMicrosPerPoint, recommendation: recommendation as RateComparison["recommendation"], reasons: allReasons,
    formula: "净增量价值 = (多倍积分方案积分 − 普通方案积分) × 每积分估值 − 现金差额 − 其他成本/放弃权益",
  };
}
