import "server-only";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { evidence, guidePromotions, guideRuleVersions, guides, programs, promotionEvidence, promotionRules, promotions, promotionVersions, ruleVersions, rules } from "@/db/schema";
import type { Database } from "@/db/client";
import { PAGE_SIZE, searchPattern, type BrowseFilters } from "@/shared/browse";
import { publicPromotionSchema, slugSchema } from "./model";

// Shared by filtering and presentation; clock expiry wins over stale stored status.
const lifecycle = sql<string>`CASE
  WHEN ${promotions.lifecycleStatus} = 'archived' THEN 'archived'
  WHEN ${promotions.lifecycleStatus} = 'ended' OR ${promotions.endsAt} <= CURRENT_TIMESTAMP THEN 'ended'
  WHEN ${promotions.isSuspended} THEN 'unknown'
  WHEN ${promotions.startsAt} > CURRENT_TIMESTAMP THEN 'scheduled'
  WHEN ${promotions.startsAt} IS NULL OR ${promotions.endsAt} IS NULL OR ${promotions.lifecycleStatus} = 'unknown' THEN 'unknown'
  ELSE 'active' END`;

const visible = (includeDemo: boolean) => and(eq(promotions.publicationStatus, "published"), includeDemo ? undefined : eq(promotions.isDemo, false));
function conditions(filters: BrowseFilters, includeDemo: boolean) {
  return and(visible(includeDemo),
    filters.q ? or(ilike(promotions.title, searchPattern(filters.q)), ilike(promotions.summary, searchPattern(filters.q))) : undefined,
    filters.category ? eq(promotions.category, filters.category) : undefined,
    filters.platform ? eq(promotions.platform, filters.platform) : undefined,
    filters.lifecycle ? eq(lifecycle, filters.lifecycle) : undefined,
    filters.verification ? eq(promotions.verificationStatus, filters.verification) : undefined);
}
export async function queryPromotionFacets(db: Database, includeDemo: boolean) {
  const rows = await db.selectDistinct({ category: promotions.category, platform: promotions.platform }).from(promotions).where(visible(includeDemo));
  return { categories: [...new Set(rows.map((row) => row.category))].sort(), platforms: [...new Set(rows.map((row) => row.platform))].sort() };
}
export async function countPublishedPromotions(db: Database, filters: BrowseFilters, includeDemo: boolean) {
  const rows = await db.select({ total: count() }).from(promotions).where(conditions(filters, includeDemo));
  return rows[0].total;
}

// Public DTOs contain no actor, audit log, private snapshot, or unpublished rule content.
export async function queryPublishedPromotions(db: Database, options: { slug?: string; includeDemo: boolean; filters: BrowseFilters }) {
  const { filters, includeDemo } = options;
  const rows = await db.select({ promotion: promotions, program: programs, ruleVersion: ruleVersions, lifecycle })
    .from(promotions).innerJoin(programs, eq(promotions.programId, programs.id))
    .leftJoin(ruleVersions, and(eq(promotions.ruleVersionId, ruleVersions.id), eq(ruleVersions.publicationStatus, "published")))
    .where(options.slug ? and(visible(includeDemo), eq(promotions.slug, slugSchema.parse(options.slug))) : conditions(filters, includeDemo))
    .orderBy(sql`${promotions.isDemo} ASC`, filters.sort === "ending" ? sql`${promotions.endsAt} ASC NULLS LAST` : filters.sort === "updated" ? desc(promotions.updatedAt) : sql`${promotions.publishedAt} DESC NULLS LAST`, desc(promotions.createdAt), promotions.id)
    .limit(options.slug ? 1 : PAGE_SIZE).offset(options.slug ? 0 : (filters.page - 1) * PAGE_SIZE);
  if (!rows.length) return [];
  const ruleIds = rows.flatMap((row) => row.ruleVersion?.id ? [row.ruleVersion.id] : []);
  const promotionIds = rows.map((row) => row.promotion.id);
  const linked = await db.select({ promotionId: promotionEvidence.promotionId, evidence }).from(promotionEvidence).innerJoin(evidence, eq(promotionEvidence.evidenceId, evidence.id)).where(inArray(promotionEvidence.promotionId, promotionIds));
  const sources = ruleIds.length ? await db.select().from(evidence).where(inArray(evidence.ruleVersionId, ruleIds)) : [];
  const linkedGuides = options.slug && ruleIds.length ? await db.select({ guide: { slug: guides.slug, title: guides.title, summary: guides.summary }, promotionId: guidePromotions.promotionId, ruleVersionId: guideRuleVersions.ruleVersionId }).from(guides).leftJoin(guidePromotions, eq(guidePromotions.guideId, guides.id)).leftJoin(guideRuleVersions, eq(guideRuleVersions.guideId, guides.id)).where(and(eq(guides.publicationStatus, "published"), includeDemo ? undefined : eq(guides.isDemo, false), or(inArray(guidePromotions.promotionId, promotionIds), inArray(guideRuleVersions.ruleVersionId, ruleIds)))) : [];
  const linkedRules = options.slug ? await db.select({ id: ruleVersions.id, name: rules.name, version: ruleVersions.version }).from(promotionRules).innerJoin(ruleVersions, eq(promotionRules.ruleVersionId, ruleVersions.id)).innerJoin(rules, eq(ruleVersions.ruleId, rules.id)).where(and(inArray(promotionRules.promotionId, promotionIds), eq(ruleVersions.publicationStatus, "published"), includeDemo ? undefined : eq(ruleVersions.isDemo, false))) : [];
  const primaryRule = options.slug && ruleIds.length ? await db.select({ id: ruleVersions.id, name: rules.name, version: ruleVersions.version }).from(ruleVersions).innerJoin(rules, eq(ruleVersions.ruleId, rules.id)).where(inArray(ruleVersions.id, ruleIds)) : [];
  // Only revision numbers and timestamps are public; reasons, snapshots and actors stay private.
  const history = options.slug ? await db.select({ version: promotionVersions.version, createdAt: promotionVersions.createdAt }).from(promotionVersions).where(inArray(promotionVersions.promotionId, promotionIds)).orderBy(desc(promotionVersions.version)).limit(20) : [];
  const related = options.slug && ruleIds.length ? await db.select({ slug: promotions.slug, title: promotions.title }).from(promotions).where(and(visible(includeDemo), inArray(promotions.ruleVersionId, ruleIds), sql`${promotions.id} <> ${promotionIds[0]}`)).limit(6) : [];
  return rows.map(({ promotion, program, ruleVersion, lifecycle: state }) => publicPromotionSchema.parse({
    id: promotion.id, slug: promotion.slug, title: promotion.title, summary: promotion.summary, category: promotion.category,
    programId: program.id, programName: program.name, pointsName: program.pointsName,
    platform: promotion.platform, isDemo: promotion.isDemo, isSuspended: promotion.isSuspended,
    startsAt: promotion.startsAt?.toISOString() ?? null, endsAt: promotion.endsAt?.toISOString() ?? null,
    lifecycleStatus: state, verificationStatus: promotion.verificationStatus, eligibility: promotion.eligibility,
    rewardType: promotion.rewardType, rewardAmount: promotion.rewardAmount?.toString() ?? null, rewardUnit: promotion.rewardUnit,
    dates: Object.fromEntries(["enrollmentStartsAt", "enrollmentEndsAt", "bookingStartsAt", "bookingEndsAt", "stayStartsAt", "stayEndsAt", "claimStartsAt", "claimEndsAt", "otherDeadlineAt"].map((key) => [key, (promotion[key as keyof typeof promotion] as Date | null)?.toISOString() ?? null])),
    brands: promotion.brands, channels: promotion.channels, regions: promotion.regions, steps: promotion.steps, notes: promotion.notes,
    timeZone: promotion.timeZone, qualification: promotion.qualification, stacking: promotion.stacking,
    publishedAt: promotion.publishedAt?.toISOString() ?? null, updatedAt: promotion.updatedAt.toISOString(),
    ruleVersion: ruleVersion ? { id: ruleVersion.id, version: ruleVersion.version, terms: ruleVersion.terms, isDemo: ruleVersion.isDemo } : null,
    linkedRules: [...primaryRule, ...linkedRules].filter((rule, index, list) => list.findIndex((item) => item.id === rule.id) === index),
    relatedGuides: linkedGuides.filter((item) => item.promotionId === promotion.id || item.ruleVersionId === ruleVersion?.id).map((item) => item.guide).filter((guide): guide is NonNullable<typeof guide> => Boolean(guide)).filter((guide, index, list) => list.findIndex((item) => item.slug === guide.slug) === index),
    relatedPromotions: related, history: history.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    evidence: [...sources.filter((source) => source.ruleVersionId === ruleVersion?.id), ...linked.filter((item) => item.promotionId === promotion.id).map((item) => item.evidence)]
      .filter((source, index, list) => list.findIndex((item) => item.id === source.id) === index)
      .filter((source) => promotion.isDemo || !source.isDemo).map((source) => ({
        id: source.id, sourceLabel: source.sourceLabel, sourceUrl: source.sourceUrl, excerpt: source.excerpt, sourceKind: source.sourceKind, scope: source.scope,
        originalPublishedAt: source.originalPublishedAt?.toISOString() ?? null, isDemo: source.isDemo,
        capturedAt: source.capturedAt.toISOString(), verifiedAt: source.verifiedAt?.toISOString() ?? null, verificationStatus: source.verificationStatus,
      })),
  }));
}
