import "server-only";
import { and, eq } from "drizzle-orm";
import { evidence, ruleVersions } from "@/db/schema";
import { getDatabase } from "@/db/client";
import { validateRuleApplicability } from "./rules";
import type { RuleApplicability } from "./types";

/** 只读取可公开用于计算的规则；客户端传入的规则 ID 不会直接成为计算参数。 */
export async function resolvePublishedRule(ruleVersionId: string, eventDate: string): Promise<RuleApplicability | null> {
  const row = await getDatabase().select().from(ruleVersions).where(and(eq(ruleVersions.id, ruleVersionId), eq(ruleVersions.isDemo, false))).limit(1);
  const rule = row[0];
  if (!rule) return null;
  const sources = await getDatabase().select({ id: evidence.id }).from(evidence).where(and(eq(evidence.ruleVersionId, rule.id), eq(evidence.isDemo, false), eq(evidence.sourceKind, "official"), eq(evidence.verificationStatus, "official_verified")));
  return validateRuleApplicability({ id: rule.id, version: rule.version, publicationStatus: rule.publicationStatus, verificationStatus: rule.verificationStatus, validFrom: rule.validFrom.toISOString(), validUntil: rule.validUntil?.toISOString() ?? null, evidenceIds: sources.map((source) => source.id) }, eventDate);
}
