import { assertBoundedInteger, assertNonNegative, moneyToMicros, pointsValue } from "./math";
import type { ActivityInput, ActivityResult } from "./types";

function rewardFor(input: ActivityInput): { points: bigint; cashMinor: bigint } {
  if (input.reward.type === "fixed-points") return { points: input.reward.points, cashMinor: 0n };
  if (input.reward.type === "tiered-points") {
    const tier = [...input.reward.tiers].sort((a, b) => a.thresholdMinor === b.thresholdMinor ? 0 : a.thresholdMinor > b.thresholdMinor ? -1 : 1).find((item) => input.qualifyingSpendMinor >= item.thresholdMinor);
    return { points: tier?.points ?? 0n, cashMinor: 0n };
  }
  assertBoundedInteger("返利比例", input.reward.basisPoints, 10_000);
  const value = input.qualifyingSpendMinor * BigInt(input.reward.basisPoints) / 10_000n;
  return { points: 0n, cashMinor: input.reward.capMinor === undefined ? value : value > input.reward.capMinor ? input.reward.capMinor : value };
}

export function calculateActivityReward(input: ActivityInput): ActivityResult {
  for (const [name, value] of [["门槛", input.thresholdMinor], ["符合条件消费", input.qualifyingSpendMinor], ["计划消费", input.plannedSpendMinor], ["额外消费", input.extraSpendMinor], ["额外经济成本", input.extraEconomicCostMinor], ["放弃权益价值", input.foregoneValueMinor], ["参与费用", input.participationFeeMinor]] as const) assertNonNegative(name, value);
  if (input.reward.type === "fixed-points") assertNonNegative("奖励积分", input.reward.points);
  if (input.reward.type === "tiered-points") input.reward.tiers.forEach((tier) => { assertNonNegative("分档门槛", tier.thresholdMinor); assertNonNegative("分档奖励", tier.points); });
  if (input.reward.type === "percentage-cash" && input.reward.capMinor !== undefined) assertNonNegative("返利封顶", input.reward.capMinor);
  assertNonNegative("积分估值", input.pointValueMicros);
  if (input.usesAlready < 0 || !Number.isSafeInteger(input.usesAlready) || input.usesLimit !== null && (!Number.isSafeInteger(input.usesLimit) || input.usesLimit < 0)) throw new Error("次数上限不合法");
  const warnings: string[] = [];
  const alreadyCapped = input.usesLimit !== null && input.usesAlready >= input.usesLimit;
  const unclaimedExpired = input.claimStatus === "expired" && input.rewardStatus !== "issued";
  const meetsSpend = input.qualifyingSpendMinor >= input.thresholdMinor;
  const baseEligibility = meetsSpend ? "meets-known-conditions" : "fails-known-conditions";
  const eligibility = input.qualificationStatus && input.qualificationStatus !== "meets-known-conditions" ? input.qualificationStatus : baseEligibility as ActivityResult["eligibility"];
  if (alreadyCapped) warnings.push("已达到活动次数上限，本次不再计算额外奖励");
  if (input.claimStatus === "expired") warnings.push(unclaimedExpired ? "已超过领奖期限，未到账奖励按 0 处理" : "领奖期限已过，保留已人工确认到账的历史奖励");
  if (input.claimStatus === "required-not-claimed") warnings.push("需要主动领取，当前不能视为已到账");
  if (input.rewardStatus === "pending") warnings.push("奖励尚未到账，以下为预期价值，不是现金收益");
  if (!meetsSpend) warnings.push("符合条件消费未达到已知门槛");
  if (input.qualificationStatus && input.qualificationStatus !== "meets-known-conditions") warnings.push("资格信息未达到可确定计算条件，奖励按 0 处理");
  const reward = meetsSpend && !alreadyCapped && !unclaimedExpired && (!input.qualificationStatus || input.qualificationStatus === "meets-known-conditions") ? rewardFor(input) : { points: 0n, cashMinor: 0n };
  const rewardValueMicros = moneyToMicros(reward.cashMinor) + pointsValue(reward.points, input.pointValueMicros);
  const incrementalCostMinor = input.extraEconomicCostMinor + input.participationFeeMinor;
  const netIncrementalValueMicros = rewardValueMicros - moneyToMicros(incrementalCostMinor + input.foregoneValueMinor);
  if (input.extraSpendMinor > 0n && input.plannedSpendMinor + input.extraSpendMinor > input.plannedSpendMinor) warnings.push("额外消费被单独计入增量成本；不能把全部达标消费当作活动成本");
  return { eligibility, rewardPoints: reward.points, rewardCashMinor: reward.cashMinor, rewardValueMicros, incrementalCostMinor, foregoneValueMinor: input.foregoneValueMinor, netIncrementalValueMicros, warnings, formula: "增量净价值 = 新增奖励估值 − 新增经济成本 − 放弃的其他权益价值；预期奖励不等于已兑现收益" };
}

export function calculateTransactionPoints(transactionsMinor: bigint[], pointsPerYuan: bigint): bigint {
  assertNonNegative("每元基础积分", pointsPerYuan);
  return transactionsMinor.reduce((total, amount) => {
    assertNonNegative("单笔消费", amount);
    return total + (amount * pointsPerYuan / 100n);
  }, 0n);
}
