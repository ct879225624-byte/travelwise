import { assertBoundedInteger, assertNonNegative, moneyToMicros, pointsValue } from "./math";
import type { Discount, OfferComparison, OfferQuote, StackingRelation, StackingSimulation } from "./types";

function quoteCost(quote: OfferQuote, pointValueMicros: bigint): bigint | null {
  if (quote.eligibility === "information-insufficient" || quote.eligibility === "rule-pending-verification") return null;
  if (quote.pointsEarned === null) return null;
  if (quote.cashMinor < 0n || quote.pointsSpent < 0n || quote.pointsEarned < 0n) throw new Error("报价金额和积分必须为非负数");
  if (quote.taxesMinor !== undefined) assertNonNegative("税费", quote.taxesMinor);
  const earned = quote.pointsEarned;
  const extra = (quote.extraCostMinor ?? 0n) + (quote.foregoneValueMinor ?? 0n);
  assertNonNegative("积分估值", pointValueMicros);
  return moneyToMicros(quote.cashMinor + extra) + pointsValue(quote.pointsSpent - earned, pointValueMicros);
}

export function compareOfferQuotes(input: { quotes: OfferQuote[]; pointValueMicros: bigint }): OfferComparison {
  if (input.quotes.length < 2) throw new Error("至少需要两个报价");
  const costs = input.quotes.map((quote) => ({ ...quote, economicCostMicros: quoteCost(quote, input.pointValueMicros) }));
  const reasons: string[] = [];
  const first = input.quotes[0];
  if (input.quotes.some((quote) => quote.cancellation !== first.cancellation || quote.breakfast !== first.breakfast || quote.benefits !== first.benefits)) reasons.push("不同报价的退改或权益不完全相同");
  if (input.quotes.some((quote) => quote.taxesMinor !== first.taxesMinor)) reasons.push("不同报价税费不同，现金差额应结合税费口径阅读");
  if (input.quotes.some((quote) => quote.eligibility !== "meets-known-conditions")) reasons.push("至少一个报价资格不是已知符合");
  if (input.quotes.some((quote) => quote.pointsEarned === null)) reasons.push("至少一个报价的预计返分未知，无法确认综合成本");
  const usable = costs.filter((quote): quote is typeof quote & { economicCostMicros: bigint } => quote.economicCostMicros !== null);
  const sorted = [...usable].sort((a, b) => a.economicCostMicros < b.economicCostMicros ? -1 : a.economicCostMicros > b.economicCostMicros ? 1 : 0);
  const status = reasons.length ? "needs-review" : usable.length !== costs.length ? "incomplete" : "determinate";
  const recommendation = status === "determinate" && sorted[0] ? sorted[0].label : null;
  return {
    status, quotes: costs, recommendation,
    cashDifferenceMinor: input.quotes[1].cashMinor - input.quotes[0].cashMinor,
    reasons, formula: "假设综合成本 = 现金支出 + 积分消耗 × 每积分估值 − 预计返分 × 每积分估值 + 额外成本 + 放弃权益价值",
  };
}

function applyDiscount(cash: bigint, discount: Discount): { cash: bigint; points: bigint; applied: string } {
  if (cash < 0n) throw new Error("现金不能为负数");
  if (discount.kind === "percent") {
    assertBoundedInteger("折扣比例", discount.basisPoints, 10_000);
    const reduction = cash * BigInt(discount.basisPoints) / 10_000n;
    return { cash: cash - reduction, points: 0n, applied: `${discount.label}（${discount.basisPoints / 100}%）` };
  }
  if (discount.kind === "fixed") {
    assertNonNegative("固定优惠", discount.amountMinor);
    const reduction = discount.amountMinor > cash ? cash : discount.amountMinor;
    return { cash: cash - reduction, points: 0n, applied: discount.label };
  }
  if (discount.kind === "threshold") {
    assertNonNegative("满减门槛", discount.thresholdMinor); assertNonNegative("满减金额", discount.amountMinor);
    if (cash < discount.thresholdMinor) return { cash, points: 0n, applied: `${discount.label}（未达门槛）` };
    return { cash: cash - (discount.amountMinor > cash ? cash : discount.amountMinor), points: 0n, applied: discount.label };
  }
  assertNonNegative("抵扣积分", discount.points); assertNonNegative("抵扣金额", discount.amountMinor);
  const reduction = discount.amountMinor > cash ? cash : discount.amountMinor;
  return { cash: cash - reduction, points: discount.points, applied: discount.label };
}

export function simulateStacking(input: { originalCashMinor: bigint; discounts: Discount[]; order: string[]; relations: Record<string, Record<string, StackingRelation>>; assumeUnknown?: boolean }): StackingSimulation {
  assertNonNegative("原始房价", input.originalCashMinor);
  const byId = new Map(input.discounts.map((discount) => [discount.id, discount]));
  const ordered = input.order.map((id) => byId.get(id));
  if (byId.size !== input.discounts.length || new Set(input.order).size !== input.order.length || ordered.some((discount) => !discount) || ordered.length !== input.discounts.length) throw new Error("优惠 ID 和顺序必须唯一，且顺序必须包含每个优惠且不能包含未知优惠");
  const warnings: string[] = [];
  let blocked = false;
  for (let i = 0; i < input.order.length; i += 1) for (let j = i + 1; j < input.order.length; j += 1) {
    const a = input.order[i]; const b = input.order[j]; const relation = input.relations[a]?.[b] ?? input.relations[b]?.[a] ?? "unknown";
    if (relation === "verified-disallowed") { blocked = true; warnings.push(`${a} 与 ${b} 已核实不可叠加`); }
    if (relation === "unknown") { blocked = true; warnings.push(`${a} 与 ${b} 的叠加关系待核实`); }
    if (relation === "conditional") { blocked = true; warnings.push(`${a} 与 ${b} 只有满足额外条件时可叠加`); }
  }
  if (blocked && !input.assumeUnknown) return { status: "blocked", finalCashMinor: input.originalCashMinor, pointsSpent: 0n, applied: [], warnings, formula: "按用户提供的优惠顺序逐项计算；未核实关系不会自动套用" };
  if (blocked) warnings.push("假设模拟，非已核实可用优惠组合");
  let cash = input.originalCashMinor; let points = 0n; const applied: string[] = [];
  for (const discount of ordered as Discount[]) { const result = applyDiscount(cash, discount); cash = result.cash; points += result.points; applied.push(result.applied); }
  return { status: blocked ? "assumption-only" : "verified-usable", finalCashMinor: cash, pointsSpent: points, applied, warnings, formula: "按指定顺序计算：百分比折扣向下取整到分，固定优惠不超过当前现金，积分抵扣不超过当前现金" };
}
