export type DecisionStatus = "determinate" | "incomplete" | "needs-review";

export type Quote = {
  cashMinor: bigint;
  pointsEarned: bigint | null;
  source: string;
  hotel: string;
  room: string;
  checkIn: string;
  checkOut: string;
  cancellation: string;
  breakfast: string;
  benefits: string;
  quotedAt: string;
  taxesIncluded?: boolean;
  otherCostMinor?: bigint;
  foregoneValueMinor?: bigint;
};

export type RateComparison = {
  status: DecisionStatus;
  standard: Quote;
  bonus: Quote;
  extraCashMinor: bigint;
  extraPoints: bigint | null;
  extraPointsValueMicros: bigint | null;
  netIncrementalValueMicros: bigint | null;
  breakEvenValueMicrosPerPoint: string | null;
  recommendation: "standard" | "bonus" | "no-unconditional-recommendation";
  reasons: string[];
  formula: string;
};

export type EligibilityStatus = "meets-known-conditions" | "fails-known-conditions" | "information-insufficient" | "rule-pending-verification";

export type EligibilityResult = {
  status: EligibilityStatus;
  reasons: string[];
  missing: string[];
  conflicts: string[];
};

export type RuleVerification = {
  id: string;
  version: number;
  publicationStatus: "draft" | "pending_review" | "published" | "withdrawn" | "archived";
  verificationStatus: "official_verified" | "community" | "unverified" | "conflict" | "reverify";
  validFrom: string;
  validUntil: string | null;
  evidenceIds: string[];
};

export type RuleApplicability = {
  status: "usable" | "not-usable" | "unknown";
  reasons: string[];
  rule: RuleVerification;
};

export type OfferQuote = {
  id: string;
  label: string;
  cashMinor: bigint;
  pointsSpent: bigint;
  pointsEarned: bigint | null;
  taxesMinor?: bigint;
  cancellation: string;
  breakfast: string;
  benefits: string;
  eligibility: EligibilityStatus;
  extraCostMinor?: bigint;
  foregoneValueMinor?: bigint;
};

export type OfferComparison = {
  status: DecisionStatus;
  quotes: Array<OfferQuote & { economicCostMicros: bigint | null }>;
  recommendation: string | null;
  cashDifferenceMinor: bigint | null;
  reasons: string[];
  formula: string;
};

export type Discount =
  | { id: string; label: string; kind: "percent"; basisPoints: number }
  | { id: string; label: string; kind: "fixed"; amountMinor: bigint }
  | { id: string; label: string; kind: "threshold"; thresholdMinor: bigint; amountMinor: bigint }
  | { id: string; label: string; kind: "points"; points: bigint; amountMinor: bigint };

export type StackingRelation = "verified-allowed" | "verified-disallowed" | "conditional" | "unknown";

export type StackingSimulation = {
  status: "verified-usable" | "assumption-only" | "blocked";
  finalCashMinor: bigint;
  pointsSpent: bigint;
  applied: string[];
  warnings: string[];
  formula: string;
};

export type RewardDefinition =
  | { type: "fixed-points"; points: bigint }
  | { type: "tiered-points"; tiers: Array<{ thresholdMinor: bigint; points: bigint }> }
  | { type: "percentage-cash"; basisPoints: number; capMinor?: bigint };

export type ActivityInput = {
  thresholdMinor: bigint;
  qualifyingSpendMinor: bigint;
  plannedSpendMinor: bigint;
  extraSpendMinor: bigint;
  reward: RewardDefinition;
  pointValueMicros: bigint;
  extraEconomicCostMinor: bigint;
  foregoneValueMinor: bigint;
  participationFeeMinor: bigint;
  usesAlready: number;
  usesLimit: number | null;
  claimStatus: "not-required" | "required-not-claimed" | "claimed" | "expired";
  rewardStatus: "not-issued" | "pending" | "issued";
  qualificationStatus?: EligibilityStatus;
};

export type ActivityResult = {
  eligibility: EligibilityStatus;
  rewardPoints: bigint;
  rewardCashMinor: bigint;
  rewardValueMicros: bigint;
  incrementalCostMinor: bigint;
  foregoneValueMinor: bigint;
  netIncrementalValueMicros: bigint;
  warnings: string[];
  formula: string;
};

export type ScenarioSnapshot = {
  calculatorType: "rate-comparison" | "offer-comparison" | "activity-reward";
  inputs: Record<string, string | number | boolean | null | string[]>;
  ruleVersionIds: string[];
  pointValuePerPoint: string;
  result: Record<string, string | number | boolean | null | string[]>;
  assumptions: string[];
  calculatedAt: string;
};
