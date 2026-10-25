import { describe, expect, it } from "vitest";
import { calculateActivityReward, calculateTransactionPoints, compareRateQuotes, compareOfferQuotes, detectManualConflict, evaluateQualification, parsePointValue, simulateStacking, validateRuleApplicability } from "@/modules/decision";
import type { Quote } from "@/modules/decision";

const quote = (overrides: Partial<Quote> = {}): Quote => ({ cashMinor: 30000n, pointsEarned: 450n, source: "App", hotel: "同一酒店", room: "标准房", checkIn: "2026-12-01", checkOut: "2026-12-02", cancellation: "可取消", breakfast: "无", benefits: "无", quotedAt: "2026-10-11T10:00:00+08:00", taxesIncluded: true, ...overrides });

describe("Phase 4 decision calculators", () => {
  it("DEC-01 calculates the standard rate case with exact integer arithmetic", () => {
    const result = compareRateQuotes({ standard: quote(), bonus: quote({ cashMinor: 35000n, pointsEarned: 2800n }), pointValueMicros: parsePointValue("0.02") });
    expect(result.extraCashMinor).toBe(5000n);
    expect(result.extraPoints).toBe(2350n);
    expect(result.extraPointsValueMicros).toBe(47000000n);
    expect(result.netIncrementalValueMicros).toBe(-3000000n);
    expect(result.breakEvenValueMicrosPerPoint).toBe("0.0212766");
    expect(result.recommendation).toBe("standard");
  });

  it("DEC-02/03/04 handle equal points, zero value, and cheaper bonus prices", () => {
    const equal = compareRateQuotes({ standard: quote(), bonus: quote({ cashMinor: 35000n }), pointValueMicros: parsePointValue("0.02") });
    expect(equal.extraPoints).toBe(0n); expect(equal.breakEvenValueMicrosPerPoint).toBeNull();
    const zero = compareRateQuotes({ standard: quote(), bonus: quote({ cashMinor: 35000n, pointsEarned: 2800n }), pointValueMicros: 0n });
    expect(zero.netIncrementalValueMicros).toBe(-50000000n);
    const cheaper = compareRateQuotes({ standard: quote(), bonus: quote({ cashMinor: 25000n, pointsEarned: 2800n }), pointValueMicros: parsePointValue("0.02") });
    expect(cheaper.extraCashMinor).toBe(-5000n); expect(cheaper.netIncrementalValueMicros).toBe(97000000n);
  });

  it("DEC-05 does not recommend when refund rights differ", () => {
    const result = compareRateQuotes({ standard: quote(), bonus: quote({ cashMinor: 25000n, pointsEarned: 2800n, cancellation: "不可取消" }), pointValueMicros: parsePointValue("0.02") });
    expect(result.status).toBe("needs-review"); expect(result.recommendation).toBe("no-unconditional-recommendation");
  });

  it("FLOW-B requires review when both quotes exclude necessary taxes", () => {
    const result = compareRateQuotes({ standard: quote({ taxesIncluded: false }), bonus: quote({ cashMinor: 35000n, pointsEarned: 2800n, taxesIncluded: false }), pointValueMicros: parsePointValue("0.02") });
    expect(result.netIncrementalValueMicros).toBe(-3000000n);
    expect(result.status).toBe("needs-review");
    expect(result.recommendation).toBe("no-unconditional-recommendation");
    expect(result.reasons).toContain("至少一个报价未确认含必要税费");
  });

  it("FLOW-B rejects expired rules and explicitly forbidden stacking", () => {
    const expired = validateRuleApplicability({ id: "expired", version: 1, publicationStatus: "published", verificationStatus: "official_verified", validFrom: "2026-01-01T00:00:00Z", validUntil: "2026-02-01T00:00:00Z", evidenceIds: ["official"] }, "2026-10-20T00:00:00Z");
    expect(expired.status).toBe("not-usable");
    const forbidden = simulateStacking({ originalCashMinor: 30000n, discounts: [{ id: "a", label: "券 A", kind: "fixed", amountMinor: 1000n }, { id: "b", label: "券 B", kind: "fixed", amountMinor: 1000n }], order: ["a", "b"], relations: { a: { b: "verified-disallowed" } } });
    expect(forbidden.status).toBe("blocked");
    expect(forbidden.finalCashMinor).toBe(30000n);
  });

  it("DEC-06/07 blocks unknown and partially verified stacking", () => {
    const discounts = [{ id: "A", label: "会员价", kind: "percent", basisPoints: 9000 } as const, { id: "B", label: "优惠券", kind: "fixed", amountMinor: 1000n } as const, { id: "C", label: "积分抵扣", kind: "points", points: 1000n, amountMinor: 500n } as const];
    const relations = { A: { B: "verified-allowed", C: "unknown" }, B: { C: "unknown" } } as const;
    const blocked = simulateStacking({ originalCashMinor: 10000n, discounts, order: ["A", "B", "C"], relations });
    expect(blocked.status).toBe("blocked"); expect(blocked.finalCashMinor).toBe(10000n);
    const assumed = simulateStacking({ originalCashMinor: 10000n, discounts, order: ["A", "B", "C"], relations, assumeUnknown: true });
    expect(assumed.status).toBe("assumption-only"); expect(assumed.finalCashMinor).toBe(0n);
  });

  it("DEC-08/09 distinguishes missing and failing qualification facts", () => {
    expect(evaluateQualification({}, { membershipTiers: ["白金"] }).status).toBe("information-insufficient");
    expect(evaluateQualification({ membershipTier: "普通" }, { membershipTiers: ["白金"] }).status).toBe("fails-known-conditions");
  });

  it("DEC-10/11/12 handles caps, transaction rounding, and unnecessary spend", () => {
    const capped = calculateActivityReward({ thresholdMinor: 300000n, qualifyingSpendMinor: 300000n, plannedSpendMinor: 300000n, extraSpendMinor: 0n, reward: { type: "fixed-points", points: 8000n }, pointValueMicros: parsePointValue("0.02"), extraEconomicCostMinor: 0n, foregoneValueMinor: 0n, participationFeeMinor: 0n, usesAlready: 1, usesLimit: 1, claimStatus: "claimed", rewardStatus: "issued" });
    expect(capped.rewardPoints).toBe(0n); expect(capped.warnings[0]).toContain("次数上限");
    expect(calculateTransactionPoints([99n, 99n], 10n)).toBe(18n);
    const costly = calculateActivityReward({ thresholdMinor: 300000n, qualifyingSpendMinor: 300000n, plannedSpendMinor: 0n, extraSpendMinor: 300000n, reward: { type: "fixed-points", points: 8000n }, pointValueMicros: parsePointValue("0.02"), extraEconomicCostMinor: 300000n, foregoneValueMinor: 0n, participationFeeMinor: 0n, usesAlready: 0, usesLimit: null, claimStatus: "not-required", rewardStatus: "pending" });
    expect(costly.netIncrementalValueMicros).toBe(-2840000000n);
  });

  it("DEC-13/14/15 keeps rule versions traceable and rejects unpublished or unverified rules", () => {
    const rule = { id: "r1", version: 2, publicationStatus: "published" as const, verificationStatus: "official_verified" as const, validFrom: "2026-01-01T00:00:00Z", validUntil: "2027-01-01T00:00:00Z", evidenceIds: ["e1"] };
    expect(validateRuleApplicability(rule, "2026-06-01T00:00:00Z").status).toBe("usable");
    expect(validateRuleApplicability({ ...rule, version: 1 }, "2026-06-01T00:00:00Z").rule.version).toBe(1);
    expect(validateRuleApplicability({ ...rule, publicationStatus: "withdrawn" }, "2026-06-01T00:00:00Z").status).toBe("unknown");
    expect(validateRuleApplicability({ ...rule, verificationStatus: "unverified" }, "2026-06-01T00:00:00Z").status).toBe("unknown");
  });

  it("DEC-16/17 rejects unsafe values and exposes manual conflicts", () => {
    expect(() => parsePointValue("-1")).toThrow(); expect(() => parsePointValue("1.1234567")).toThrow();
    expect(() => simulateStacking({ originalCashMinor: 100n, discounts: [{ id: "x", label: "x", kind: "percent", basisPoints: 10001 }], order: ["x"], relations: {} })).toThrow();
    expect(detectManualConflict("2800", "8000", "奖励积分")).toContain("冲突");
  });

  it("compares final offer quotes only when the data is known", () => {
    const result = compareOfferQuotes({ pointValueMicros: parsePointValue("0.02"), quotes: [
      { id: "a", label: "会员价", cashMinor: 30000n, pointsSpent: 0n, pointsEarned: 450n, cancellation: "可取消", breakfast: "无", benefits: "无", eligibility: "meets-known-conditions" },
      { id: "b", label: "积分价", cashMinor: 25000n, pointsSpent: 1000n, pointsEarned: 0n, cancellation: "不可取消", breakfast: "无", benefits: "无", eligibility: "information-insufficient" },
    ] });
    expect(result.status).toBe("needs-review"); expect(result.recommendation).toBeNull();
  });
});
