import { describe, expect, it } from "vitest";
import { calculateActivityReward, compareOfferQuotes, compareRateQuotes, simulateStacking } from "@/modules/decision";
import type { ActivityInput, OfferQuote, Quote } from "@/modules/decision";

const quote = (overrides: Partial<Quote> = {}): Quote => ({ cashMinor: 30000n, pointsEarned: 450n, source: "Owner 实际 App 报价", hotel: "同一酒店", room: "标准房", checkIn: "2026-12-01", checkOut: "2026-12-02", cancellation: "可取消", breakfast: "无", benefits: "无", quotedAt: "2026-10-20T00:00:00+08:00", taxesIncluded: true, ...overrides });
const offer = (overrides: Partial<OfferQuote> = {}): OfferQuote => ({ id: "a", label: "报价 A", cashMinor: 32000n, pointsSpent: 0n, pointsEarned: 0n, cancellation: "可取消", breakfast: "无", benefits: "无", eligibility: "meets-known-conditions", ...overrides });
const activity = (overrides: Partial<ActivityInput> = {}): ActivityInput => ({ thresholdMinor: 300000n, qualifyingSpendMinor: 300000n, plannedSpendMinor: 300000n, extraSpendMinor: 0n, reward: { type: "fixed-points", points: 8000n }, pointValueMicros: 20000n, extraEconomicCostMinor: 1000n, foregoneValueMinor: 0n, participationFeeMinor: 0n, usesAlready: 0, usesLimit: 1, claimStatus: "expired", rewardStatus: "not-issued", qualificationStatus: "meets-known-conditions", ...overrides });

describe("Phase 6A decision certainty and expired rewards", () => {
  it("does not treat unknown earned points as zero or recommend a potentially worse offer", () => {
    const unknown = compareOfferQuotes({ pointValueMicros: 20000n, quotes: [offer({ pointsEarned: null }), offer({ id: "b", label: "报价 B", cashMinor: 31000n })] });
    expect(unknown.quotes[0].economicCostMicros).toBeNull();
    expect(unknown.status).toBe("needs-review");
    expect(unknown.recommendation).toBeNull();
    const resolved = compareOfferQuotes({ pointValueMicros: 20000n, quotes: [offer({ pointsEarned: 2000n }), offer({ id: "b", label: "报价 B", cashMinor: 31000n })] });
    expect(resolved.status).toBe("determinate");
    expect(resolved.recommendation).toBe("报价 A");
    expect(resolved.quotes[0].economicCostMicros).toBe(280000000n);
  });

  it("rejects repeated discount order entries and duplicate IDs instead of applying one coupon twice", () => {
    const a = { id: "a", label: "券 A", kind: "fixed", amountMinor: 1000n } as const;
    const b = { id: "b", label: "券 B", kind: "fixed", amountMinor: 100n } as const;
    expect(() => simulateStacking({ originalCashMinor: 30000n, discounts: [a, b], order: ["a", "a"], relations: { a: { a: "verified-allowed" } } })).toThrow("唯一");
    expect(() => simulateStacking({ originalCashMinor: 30000n, discounts: [a, { ...b, id: "a" }], order: ["a", "a"], relations: {}, assumeUnknown: true })).toThrow("唯一");
    const valid = simulateStacking({ originalCashMinor: 30000n, discounts: [a, b], order: ["a", "b"], relations: { a: { b: "verified-allowed" } } });
    expect(valid.status).toBe("verified-usable");
    expect(valid.finalCashMinor).toBe(28900n);
    expect(valid.applied).toEqual(["券 A", "券 B"]);
  });

  it("counts no future reward after the claim deadline and preserves actual incremental costs", () => {
    for (const rewardStatus of ["not-issued", "pending"] as const) {
      const result = calculateActivityReward(activity({ rewardStatus }));
      expect(result.rewardPoints).toBe(0n);
      expect(result.rewardValueMicros).toBe(0n);
      expect(result.netIncrementalValueMicros).toBe(-10000000n);
      expect(result.warnings).toContain("已超过领奖期限，未到账奖励按 0 处理");
    }
  });

  it("preserves a manually confirmed historical reward after its original claim window closes", () => {
    const result = calculateActivityReward(activity({ rewardStatus: "issued" }));
    expect(result.rewardPoints).toBe(8000n);
    expect(result.rewardValueMicros).toBe(160000000n);
    expect(result.netIncrementalValueMicros).toBe(150000000n);
  });

  it("keeps the mathematical rate difference but withholds recommendations for missing or unknown quote facts", () => {
    const cases: Partial<Quote>[] = [
      { source: "" }, { hotel: " " }, { room: "" }, { cancellation: "待核实" }, { breakfast: "未知" }, { benefits: "待确认" },
      { checkIn: "" }, { checkOut: "" }, { quotedAt: "" }, { quotedAt: "invalid" }, { checkOut: "2026-12-01" },
    ];
    for (const overrides of cases) {
      const result = compareRateQuotes({ standard: quote(overrides), bonus: quote({ ...overrides, cashMinor: 35000n, pointsEarned: 2800n }), pointValueMicros: 20000n });
      expect(result.netIncrementalValueMicros).toBe(-3000000n);
      expect(result.status).toBe("needs-review");
      expect(result.recommendation).toBe("no-unconditional-recommendation");
      expect(result.reasons.length).toBeGreaterThan(0);
    }
    const known = compareRateQuotes({ standard: quote(), bonus: quote({ cashMinor: 35000n, pointsEarned: 2800n }), pointValueMicros: 20000n });
    expect(known.status).toBe("determinate");
    expect(known.recommendation).toBe("standard");
    expect(known.breakEvenValueMicrosPerPoint).toBe("0.0212766");
  });
});
