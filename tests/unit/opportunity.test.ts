import { describe, expect, it } from "vitest";
import { evaluateOpportunity, isCurrent, opportunityRuleSchema, rankOpportunity, sortOpportunities, type Action, type Batch, type Evidence, type Opportunity, type Promotion, type Rule, type Wallet } from "@/modules/personal/opportunity-model";
import { generateReminders } from "@/modules/personal/reminder-model";
import { parseLocalInput } from "@/shared/time";
import { calculateOpportunityValue } from "@/modules/personal/opportunity-value";
import type { savedScenarios } from "@/db/schema";

const now = new Date("2026-10-25T16:00:00Z"); // Hong Kong Oct 26 midnight.
const p = { id: "p", title: "isolated fixture", slug: "test", programId: "program", publicationStatus: "published", verificationStatus: "official_verified", isDemo: false, isSuspended: false, lifecycleStatus: "active", startsAt: new Date("2026-10-25T00:00:00Z"), endsAt: new Date("2026-10-26T16:00:00Z"), timeZone: "Asia/Hong_Kong", qualification: "unknown", brands: [], channels: [], regions: [], enrollmentEndsAt: null, stayEndsAt: null, claimStartsAt: null, claimEndsAt: null } as unknown as Promotion;
const source = { id: "e", ruleVersionId: "r", sourceKind: "official", verificationStatus: "official_verified", sourceUrl: "https://example.com", verifiedAt: now, isDemo: false } as Evidence;
const rule = { id: "r", version: 1, terms: ["fixture"], structuredContent: { opportunity: { complete: true } }, publicationStatus: "published", verificationStatus: "official_verified", validFrom: new Date("2026-01-01T00:00:00Z"), validUntil: null, isDemo: false, ruleId: "rule", programId: "program", applicability: [], timeZone: "Asia/Hong_Kong", revisionReason: "test", publishedAt: now, createdAt: now, updatedAt: now } as Rule;
const wallet = { id: "w", programId: "program", membershipTier: "白金", cardHeld: true, lastVerifiedAt: now, cardType: "测试卡", benefits: [] } as unknown as Wallet;
const evaluate = (extra: Partial<Parameters<typeof evaluateOpportunity>[0]> = {}) => evaluateOpportunity({ promotion: p, rules: [rule], sources: [source], wallet, facts: {}, batches: [], changed: false, now, ...extra });
const draft = (extra: Partial<Parameters<typeof generateReminders>[0]> = {}) => generateReminders({ opportunities: [], promotions: [], actions: [], batches: [], tasks: [], now, ...extra });

describe("V1.1-C deterministic rules and time boundaries", () => {
  it("keeps four-state semantics and does not infer from natural language", () => {
    expect(evaluate().eligibility.status).toBe("meets-known-conditions");
    expect(evaluate({ rules: [{ ...rule, structuredContent: {} }] }).eligibility.status).toBe("information-insufficient");
    expect(evaluate({ rules: [{ ...rule, structuredContent: { opportunity: { complete: true, arbitraryServerPermission: true } } }] }).eligibility.status).toBe("information-insufficient");
    expect(evaluate({ rules: [{ ...rule, publicationStatus: "draft" }] }).eligibility.status).toBe("rule-pending-verification");
    expect(opportunityRuleSchema.safeParse({ complete: true, minSpendMinor: "1.00" }).success).toBe(false);
  });
  it("uses half-open activity/rule/stay boundaries regardless of UTC or HK offset", () => {
    expect(isCurrent(p, [source], p.startsAt!)).toBe(true); expect(isCurrent(p, [source], new Date(p.startsAt!.getTime() - 1))).toBe(false);
    expect(isCurrent(p, [source], new Date(p.endsAt!.getTime() - 1))).toBe(true); expect(isCurrent(p, [source], p.endsAt!)).toBe(false);
    expect(evaluate({ rules: [{ ...rule, validUntil: now }] }).eligibility.status).toBe("rule-pending-verification");
    const promotion = { ...p, stayEndsAt: now };
    expect(evaluate({ promotion, facts: { stayAt: "2026-10-26T00:00:00+08:00" } }).eligibility.status).toBe("fails-known-conditions");
    expect(evaluate({ promotion, facts: { stayAt: "2026-10-25T23:59:59+08:00" } }).eligibility.status).toBe("meets-known-conditions");
  });
  it("rejects widening restrictive scopes and never reports failed facts as satisfied", () => {
    const r = { ...rule, structuredContent: { opportunity: { complete: true, brands: ["A"], enrollmentRequired: true, cardRequired: true } } };
    const result = evaluate({ promotion: { ...p, brands: ["B"] }, rules: [r], facts: { brand: "A", enrolled: false }, wallet: { ...wallet, cardHeld: false } });
    expect(result.eligibility.status).toBe("fails-known-conditions"); expect(result.satisfied).not.toContain("报名状态"); expect(result.satisfied).not.toContain("联名卡持有状态"); expect(result.satisfied).not.toContain("酒店品牌");
  });
  it("checks credit-card type, unused benefit expiry, usable points, spend and nights", () => {
    const r = { ...rule, structuredContent: { opportunity: { complete: true, cardTypes: ["测试卡"], benefitNames: ["早餐"], minPoints: "10", minSpendMinor: "100", minNights: 1 } } };
    const input = { rules: [r], facts: { qualifyingSpendMinor: "100", nights: 1 }, wallet: { ...wallet, benefits: [{ name: "早餐", kind: "manual", usedAt: null, expiresAt: new Date(now.getTime() + 1).toISOString() }] }, batches: [{ programId: "program", expiryStatus: "known", expiresAt: new Date(now.getTime() + 1), remainingPoints: 10n } as Batch] };
    expect(evaluate(input).eligibility.status).toBe("meets-known-conditions");
    expect(evaluate({ ...input, now: new Date(now.getTime() + 1) }).eligibility.status).toBe("fails-known-conditions");
  });
  it("sorts transparently, confirmed qualification outranks urgency, stable ties use ID", () => {
    const base = { id: "b", eligibility: { status: "meets-known-conditions" }, deadline: new Date(now.getTime() + 15 * 86400000), value: null, nextStep: "核对" } as Opportunity;
    const a = { ...base, ...rankOpportunity(base, true, now) };
    const raw = { ...base, id: "a", eligibility: { ...base.eligibility, status: "information-insufficient" as const }, deadline: new Date(now.getTime() + 1) };
    const b = { ...raw, ...rankOpportunity(raw, true, now) };
    expect(a.score).toBe(115); expect(b.score).toBe(45); expect(sortOpportunities([b, a])[0].id).toBe("b");
    expect(sortOpportunities([{ ...a, id: "z" }, { ...a, id: "a" }])[0].id).toBe("a");
  });
  it("deduplicates every deadline, does not fabricate unknown dates and marks exact due time overdue", () => {
    const action = { id: "a", promotionId: "p", status: "planned", claimedAt: null, rewardCreditedAt: null, claimDeadline: null } as Action;
    const promotion = { ...p, enrollmentEndsAt: new Date(now.getTime() + 86400000), claimEndsAt: new Date(now.getTime() + 86400000) };
    const input = { promotions: [{ promotion, rules: [rule] }], actions: [action, { ...action, id: "b" }] };
    expect(draft(input).filter((r) => r.kind === "claim-end")).toHaveLength(1);
    expect(draft().length).toBe(0);
    const batch = { id: "batch", source: "测试批次", expiryStatus: "known", expiresAt: now, remainingPoints: 10n } as Batch;
    const reminders = draft({ batches: [batch, batch] }); expect(reminders).toHaveLength(1); expect(reminders[0].title).toContain("已到期");
    expect(draft({ batches: [{ ...batch, expiresAt: null, expiryStatus: "unknown" }] })).toHaveLength(0);
  });
  it("uses actual dates across DST transitions and never assumes a missing local time", () => {
    expect(parseLocalInput("2026-03-08T01:59", "America/New_York").toISOString()).toBe("2026-03-08T06:59:00.000Z");
    expect(() => parseLocalInput("2026-03-08T02:30", "America/New_York")).toThrow();
    expect(parseLocalInput("2026-10-26T00:00", "Asia/Hong_Kong").toISOString()).toBe(now.toISOString());
  });
  it("keeps unknown expiry unconfirmed and rejects incomplete benefits", () => {
    const r = { ...rule, structuredContent: { opportunity: { complete: true, minPoints: "10", benefitNames: ["早餐"] } } };
    const result = evaluate({ rules: [r], batches: [{ programId: "program", remainingPoints: 10n, expiryStatus: "unknown", expiresAt: null } as Batch] });
    expect(result.eligibility.status).toBe("information-insufficient"); expect(result.eligibility.missing).toContain("用于达标的积分有效期尚未确认"); expect(result.eligibility.missing).toContain("权益：早餐及有效期");
  });
  it("does not lower official thresholds or reuse a mismatched point valuation", () => {
    const promotion = { ...p, rewardAmount: 1000n, rewardUnit: "积分" };
    const r = { ...rule, structuredContent: { opportunity: { complete: true, minSpendMinor: "10000" } } };
    const snapshot = { id: "snapshot", calculatorType: "activity-reward", inputSnapshot: { promotionId: p.id, threshold: "100", qualifying: "100", planned: "100", extra: "0", extraCost: "1", foregone: "0", fee: "0", rewardPoints: "1000", pointValue: "0.02", used: "0", limit: "", claimStatus: "not-required", rewardStatus: "pending" }, pointValueMicros: 20000n, quoteSource: "fixture quote", quotedAt: now, ruleVersionIds: ["r"], assumptions: [], unresolved: [], result: { netIncrementalValueMicros: "999999999" } } as unknown as typeof savedScenarios.$inferSelect;
    expect(calculateOpportunityValue(snapshot, promotion, ["r"], "meets-known-conditions", [r])?.valueMicros).toBe(19000000n);
    expect(calculateOpportunityValue({ ...snapshot, inputSnapshot: { ...snapshot.inputSnapshot, threshold: "0" } }, promotion, ["r"], "meets-known-conditions", [r])).toBeNull();
    expect(calculateOpportunityValue({ ...snapshot, pointValueMicros: 30000n }, promotion, ["r"], "meets-known-conditions", [r])).toBeNull();
  });
});
