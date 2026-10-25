import "server-only";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { evidence, guideCategories, guideEvidence, guidePromotions, guideRuleVersions, guideVersions, guides, programs, promotions, ruleVersions, rules } from "@/db/schema";
import { getDatabase } from "@/db/client";
import { readEnvironment } from "@/shared/env";

export async function listGuideCategories() {
  if (readEnvironment().source === "demo") return [];
  return getDatabase().select().from(guideCategories).orderBy(asc(guideCategories.position));
}

export async function listPublishedGuides(search?: string, category?: string) {
  if (readEnvironment().source === "demo") return [];
  return getDatabase().select({ guide: guides, category: guideCategories, program: programs }).from(guides)
    .innerJoin(guideCategories, eq(guides.categoryId, guideCategories.id)).innerJoin(programs, eq(guides.programId, programs.id))
    .where(and(eq(guides.publicationStatus, "published"), eq(guides.isDemo, false), search ? or(ilike(guides.title, `%${search}%`), ilike(guides.summary, `%${search}%`), ilike(guides.body, `%${search}%`)) : undefined, category ? eq(guideCategories.slug, category) : undefined))
    .orderBy(desc(guides.publishedAt), desc(guides.updatedAt));
}

export async function getPublishedGuide(slug: string) {
  if (readEnvironment().source === "demo") return null;
  const db = getDatabase();
  const rows = await db.select({ guide: guides, category: guideCategories, program: programs }).from(guides).innerJoin(guideCategories, eq(guides.categoryId, guideCategories.id)).innerJoin(programs, eq(guides.programId, programs.id)).where(and(eq(guides.slug, slug), eq(guides.publicationStatus, "published"), eq(guides.isDemo, false)));
  if (!rows[0]) return null;
  const [linkedRules, linkedPromotions, linkedEvidence, history] = await Promise.all([
    db.select({ rule: rules, version: ruleVersions }).from(guideRuleVersions).innerJoin(ruleVersions, eq(guideRuleVersions.ruleVersionId, ruleVersions.id)).innerJoin(rules, eq(ruleVersions.ruleId, rules.id)).where(and(eq(guideRuleVersions.guideId, rows[0].guide.id), eq(ruleVersions.publicationStatus, "published"), eq(ruleVersions.isDemo, false))),
    db.select({ promotion: promotions }).from(guidePromotions).innerJoin(promotions, eq(guidePromotions.promotionId, promotions.id)).where(and(eq(guidePromotions.guideId, rows[0].guide.id), eq(promotions.publicationStatus, "published"), eq(promotions.isDemo, false))),
    db.select({ evidence }).from(guideEvidence).innerJoin(evidence, eq(guideEvidence.evidenceId, evidence.id)).where(and(eq(guideEvidence.guideId, rows[0].guide.id), eq(evidence.isDemo, false))),
    db.select().from(guideVersions).where(eq(guideVersions.guideId, rows[0].guide.id)).orderBy(desc(guideVersions.version)).limit(20),
  ]);
  return { ...rows[0], linkedRules, linkedPromotions, linkedEvidence, history };
}
