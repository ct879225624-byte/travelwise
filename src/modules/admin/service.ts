import "server-only";
import { and, desc, eq, ilike, max } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditLogs, evidence, guideCategories, guideEvidence, guideVersions, guides, programs, promotionEvidence, promotionVersions, promotions, ruleVersions, rules } from "@/db/schema";
import type { Database } from "@/db/client";
import { z } from "zod";
import { instantSchema, parseLocalInput, timeZoneSchema } from "@/shared/time";
import { slugSchema } from "@/modules/intelligence/model";
import { opportunityRuleSchema } from "@/modules/personal/opportunity-model";

const dateValue = z.union([instantSchema.transform((value) => new Date(value)), z.date()]).refine((value) => instantSchema.safeParse(value.toISOString()).success, "日期必须能以带时区的四位年份 ISO 时间表示");
const dateOrNull = z.union([dateValue, z.literal(""), z.null()]).optional().transform((value) => value || null);
const list = z.union([z.string(), z.array(z.string())]).optional().transform((value) => Array.isArray(value) ? value : value ? value.split("\n").map((item) => item.trim()).filter(Boolean) : []);
const publicationValues = ["draft", "pending_review", "published", "withdrawn", "archived"] as const;
export const promotionInputSchema = z.object({
  slug: slugSchema, title: z.string().trim().min(1).max(200), summary: z.string().trim().min(1).max(1000),
  category: z.string().min(1).max(80), platform: z.string().min(1).max(80).default("锦江荟"),
  eligibility: list, brands: list, channels: list, regions: list, steps: list, notes: list,
  rewardType: z.string().nullable().optional(), rewardAmount: z.union([z.string(), z.bigint(), z.null()]).optional().transform((value) => typeof value === "bigint" ? value : value ? BigInt(value) : null), rewardUnit: z.string().nullable().optional(),
  startsAt: dateOrNull, endsAt: dateOrNull, enrollmentStartsAt: dateOrNull, enrollmentEndsAt: dateOrNull,
  bookingStartsAt: dateOrNull, bookingEndsAt: dateOrNull, stayStartsAt: dateOrNull, stayEndsAt: dateOrNull,
  claimStartsAt: dateOrNull, claimEndsAt: dateOrNull, otherDeadlineAt: dateOrNull,
  timeZone: timeZoneSchema.default("Asia/Shanghai"), qualification: z.enum(["unknown", "verified", "ineligible"]).default("unknown"),
  stacking: z.enum(["unknown", "allowed", "disallowed"]).default("unknown"), verificationStatus: z.enum(["official_verified", "community", "unverified", "conflict", "reverify"]).default("unverified"),
  ruleVersionId: z.uuid().nullable().optional(),
  isDemo: z.coerce.boolean().default(false), revisionReason: z.string().min(1).max(500).default("编辑内容"),
});
export type PromotionInput = z.input<typeof promotionInputSchema>;
function lifecycleFor(startsAt: Date | null, endsAt: Date | null): "scheduled" | "active" | "ended" | "unknown" { if (!startsAt || !endsAt) return "unknown"; const now = Date.now(); if (now < startsAt.getTime()) return "scheduled"; if (now >= endsAt.getTime()) return "ended"; return "active"; }

function splitLines(value: FormDataEntryValue | null) { return typeof value === "string" ? value.split("\n").map((item) => item.trim()).filter(Boolean) : []; }
export function promotionInputFromForm(form: FormData) {
  const zone = String(form.get("timeZone") || "Asia/Shanghai");
  const date = (name: string) => form.get(name) ? parseLocalInput(String(form.get(name)), zone) : undefined;
  return promotionInputSchema.parse({
    slug: form.get("slug"), title: form.get("title"), summary: form.get("summary"), category: form.get("category"), platform: form.get("platform") || "锦江荟",
    eligibility: splitLines(form.get("eligibility")), brands: splitLines(form.get("brands")), channels: splitLines(form.get("channels")), regions: splitLines(form.get("regions")), steps: splitLines(form.get("steps")), notes: splitLines(form.get("notes")),
    rewardType: form.get("rewardType") || undefined, rewardAmount: form.get("rewardAmount") || undefined, rewardUnit: form.get("rewardUnit") || undefined,
    startsAt: date("startsAt"), endsAt: date("endsAt"), enrollmentStartsAt: date("enrollmentStartsAt"), enrollmentEndsAt: date("enrollmentEndsAt"),
    bookingStartsAt: date("bookingStartsAt"), bookingEndsAt: date("bookingEndsAt"), stayStartsAt: date("stayStartsAt"), stayEndsAt: date("stayEndsAt"),
    claimStartsAt: date("claimStartsAt"), claimEndsAt: date("claimEndsAt"), otherDeadlineAt: date("otherDeadlineAt"),
    ruleVersionId: form.get("ruleVersionId") || null,
    timeZone: form.get("timeZone") || "Asia/Shanghai", qualification: form.get("qualification") || "unknown", stacking: form.get("stacking") || "unknown", verificationStatus: form.get("verificationStatus") || "unverified", isDemo: form.get("isDemo") === "true", revisionReason: form.get("revisionReason") || "编辑内容",
  });
}

async function programId() {
  const db = getDatabase();
  const existing = await db.select({ id: programs.id }).from(programs).where(eq(programs.code, "jinjiang-rewards"));
  if (existing[0]) return existing[0].id;
  const created = await db.insert(programs).values({ code: "jinjiang-rewards", name: "锦江荟", kind: "hotel", pointsName: "锦江积分" }).returning({ id: programs.id });
  return created[0].id;
}

async function audit(tx: Pick<Database, "insert">, actor: string, operation: string, entityType: string, entityId: string, changedFields: string[]) {
  await tx.insert(auditLogs).values({ actor, operation, entityType, entityId, changedFields });
}

export async function listAdminPromotions(search = "", status = "all") {
  const db = getDatabase();
  return db.select({ promotion: promotions, program: programs }).from(promotions).innerJoin(programs, eq(promotions.programId, programs.id))
    .where(and(search ? ilike(promotions.title, `%${search}%`) : undefined, status !== "all" ? eq(promotions.publicationStatus, status as "draft") : undefined)).orderBy(desc(promotions.updatedAt));
}

export async function getAdminPromotion(id: string) {
  const db = getDatabase();
  const rows = await db.select().from(promotions).where(eq(promotions.id, id));
  return rows[0] ?? null;
}

export async function listPromotionVersions(id: string) { return getDatabase().select().from(promotionVersions).where(eq(promotionVersions.promotionId, id)).orderBy(desc(promotionVersions.version)); }

export async function savePromotion(input: PromotionInput | z.output<typeof promotionInputSchema>, id: string | null, actor: string) {
  const data = promotionInputSchema.parse(input);
  const db = getDatabase();
  const pid = await programId();
  return db.transaction(async (tx) => {
    const current = id ? (await tx.select().from(promotions).where(eq(promotions.id, id)).for("update"))[0] : undefined;
    if (id && !current) throw new Error("活动不存在");
    const primaryRuleId = data.ruleVersionId === undefined ? current?.ruleVersionId : data.ruleVersionId;
    if (primaryRuleId) {
      const [version] = await tx.select().from(ruleVersions).where(and(eq(ruleVersions.id, primaryRuleId), eq(ruleVersions.programId, pid)));
      if (!version || version.isDemo !== data.isDemo) throw new Error("关联规则不存在或 DEMO 类型不一致，请重新选择");
    }
    const values = {
      programId: pid, ruleVersionId: primaryRuleId ?? null, slug: data.slug, title: data.title, summary: data.summary, category: data.category, platform: data.platform,
      eligibility: data.eligibility, brands: data.brands, channels: data.channels, regions: data.regions, steps: data.steps, notes: data.notes,
      rewardType: data.rewardType ?? null, rewardAmount: data.rewardAmount ?? null, rewardUnit: data.rewardUnit ?? null, startsAt: data.startsAt, endsAt: data.endsAt,
      enrollmentStartsAt: data.enrollmentStartsAt, enrollmentEndsAt: data.enrollmentEndsAt, bookingStartsAt: data.bookingStartsAt, bookingEndsAt: data.bookingEndsAt,
      stayStartsAt: data.stayStartsAt, stayEndsAt: data.stayEndsAt, claimStartsAt: data.claimStartsAt, claimEndsAt: data.claimEndsAt, otherDeadlineAt: data.otherDeadlineAt,
      timeZone: data.timeZone, qualification: data.qualification, stacking: data.stacking, verificationStatus: data.verificationStatus, isDemo: data.isDemo, updatedAt: new Date(),
      lifecycleStatus: lifecycleFor(data.startsAt, data.endsAt),
    };
    let promotionId = id;
    if (id) {
      await tx.update(promotions).set(values).where(eq(promotions.id, id));
      const latest = await tx.select({ latest: max(promotionVersions.version) }).from(promotionVersions).where(eq(promotionVersions.promotionId, id));
      await tx.insert(promotionVersions).values({ promotionId: id, version: Number(latest[0]?.latest ?? 0) + 1, snapshot: values, revisionReason: data.revisionReason, actor });
      await audit(tx, actor, "promotion.update", "promotion", id, Object.keys(values));
    } else {
      const inserted = await tx.insert(promotions).values(values).returning({ id: promotions.id });
      promotionId = inserted[0].id;
      await tx.insert(promotionVersions).values({ promotionId, version: 1, snapshot: values, revisionReason: data.revisionReason, actor });
      await audit(tx, actor, "promotion.create", "promotion", promotionId, Object.keys(values));
    }
    return promotionId;
  });
}

export async function setPromotionStatus(id: string, status: "draft" | "pending_review" | "published" | "withdrawn" | "archived", actor: string) {
  if (!publicationValues.includes(status)) throw new Error("Invalid publication status");
  const db = getDatabase();
  await db.transaction(async (tx) => {
    if (status === "published") { const sources = await tx.select({ id: promotionEvidence.evidenceId }).from(promotionEvidence).where(eq(promotionEvidence.promotionId, id)); if (!sources.length) throw new Error("发布活动前必须关联来源证据"); }
    await tx.update(promotions).set({ publicationStatus: status, lifecycleStatus: status === "archived" ? "archived" : undefined, publishedAt: status === "published" ? new Date() : undefined, updatedAt: new Date() }).where(eq(promotions.id, id));
    await audit(tx, actor, `promotion.${status}`, "promotion", id, ["publicationStatus"]);
  });
}

export async function listRules() { return getDatabase().select({ rule: rules, version: ruleVersions }).from(rules).leftJoin(ruleVersions, eq(rules.id, ruleVersions.ruleId)).orderBy(desc(rules.updatedAt)); }
export async function setRuleVersionStatus(id: string, actor: string) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    const current = await tx.select().from(ruleVersions).where(eq(ruleVersions.id, id));
    if (!current[0]) throw new Error("规则版本不存在");
    const sources = await tx.select({ id: evidence.id }).from(evidence).where(eq(evidence.ruleVersionId, id));
    if (!sources.length) throw new Error("发布规则前必须关联来源证据");
    await tx.update(ruleVersions).set({ publicationStatus: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(ruleVersions.id, id));
    await audit(tx, actor, "rule.version.published", "rule", current[0].ruleId, ["publicationStatus"]);
  });
}
export async function listGuides(search = "", status = "all") { return getDatabase().select({ guide: guides, category: guideCategories }).from(guides).innerJoin(guideCategories, eq(guides.categoryId, guideCategories.id)).where(and(search ? ilike(guides.title, `%${search}%`) : undefined, status !== "all" ? eq(guides.publicationStatus, status as "draft") : undefined)).orderBy(desc(guides.updatedAt)); }
export async function getGuide(id: string) { const rows = await getDatabase().select({ guide: guides, category: guideCategories }).from(guides).innerJoin(guideCategories, eq(guides.categoryId, guideCategories.id)).where(eq(guides.id, id)); return rows[0] ?? null; }
export async function listGuideCategories() { return getDatabase().select().from(guideCategories).orderBy(guideCategories.position); }
export async function listEvidence() { return getDatabase().select().from(evidence).orderBy(desc(evidence.createdAt)); }
export async function reviewEvidence(id: string, verificationStatus: typeof evidence.$inferInsert.verificationStatus, actor: string) {
  if (!verificationStatus || !["official_verified", "community", "unverified", "conflict", "reverify"].includes(verificationStatus)) throw new Error("Invalid evidence status");
  const db = getDatabase();
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(evidence).where(eq(evidence.id, z.uuid().parse(id)));
    if (!before) throw new Error("来源证据不存在");
    const verifiedAt = verificationStatus === "official_verified" ? new Date() : before.verifiedAt;
    await tx.update(evidence).set({ verificationStatus, verifiedAt, updatedAt: new Date() }).where(eq(evidence.id, id));
    await audit(tx, actor, "evidence.review", "evidence", id, [`verificationStatus:${before.verificationStatus}->${verificationStatus}`, `verifiedAt:${before.verifiedAt?.toISOString() ?? "unknown"}->${verifiedAt?.toISOString() ?? "unknown"}`]);
  });
}
export async function listAuditLogs() { return getDatabase().select().from(auditLogs).orderBy(desc(auditLogs.occurredAt)).limit(100); }

export const guideInputSchema = z.object({ slug: slugSchema, title: z.string().min(1).max(200), summary: z.string().min(1).max(1000), body: z.string().min(1), categoryId: z.uuid(), tags: list, verificationStatus: z.enum(["official_verified", "community", "unverified", "conflict", "reverify"]).default("unverified"), isDemo: z.coerce.boolean().default(false), revisionReason: z.string().min(1).default("编辑内容") });
export async function saveGuide(input: z.input<typeof guideInputSchema> | z.output<typeof guideInputSchema>, id: string | null, actor: string) {
  const data = guideInputSchema.parse(input); const pid = await programId(); const db = getDatabase();
  return db.transaction(async (tx) => {
    const values = { programId: pid, categoryId: data.categoryId, slug: data.slug, title: data.title, summary: data.summary, body: data.body, tags: data.tags, verificationStatus: data.verificationStatus, isDemo: data.isDemo, updatedAt: new Date() };
    let guideId = id;
    if (id) { const current = await tx.select().from(guides).where(eq(guides.id, id)); if (!current[0]) throw new Error("攻略不存在"); await tx.update(guides).set(values).where(eq(guides.id, id)); const latest = await tx.select({ latest: max(guideVersions.version) }).from(guideVersions).where(eq(guideVersions.guideId, id)); await tx.insert(guideVersions).values({ guideId: id, version: Number(latest[0]?.latest ?? 0) + 1, snapshot: values, revisionReason: data.revisionReason, actor }); await audit(tx, actor, "guide.update", "guide", id, Object.keys(values)); }
    else { const inserted = await tx.insert(guides).values(values).returning({ id: guides.id }); guideId = inserted[0].id; await tx.insert(guideVersions).values({ guideId, version: 1, snapshot: values, revisionReason: data.revisionReason, actor }); await audit(tx, actor, "guide.create", "guide", guideId, Object.keys(values)); }
    return guideId;
  });
}
export async function setGuideStatus(id: string, status: "draft" | "pending_review" | "published" | "withdrawn" | "archived", actor: string) { if (!publicationValues.includes(status)) throw new Error("Invalid publication status"); const db = getDatabase(); await db.transaction(async (tx) => { await tx.update(guides).set({ publicationStatus: status, publishedAt: status === "published" ? new Date() : undefined, updatedAt: new Date() }).where(eq(guides.id, id)); await audit(tx, actor, `guide.${status}`, "guide", id, ["publicationStatus"]); }); }

export async function saveEvidence(input: { sourceLabel: string; sourceUrl: string | null; sourceKind: "official" | "community" | "other"; excerpt: string; scope?: string; verificationStatus: "official_verified" | "community" | "unverified" | "conflict" | "reverify"; promotionId?: string; guideId?: string; ruleVersionId?: string; actor: string }) {
  input = { ...input, sourceLabel: z.string().trim().min(1).parse(input.sourceLabel), excerpt: z.string().trim().min(1).parse(input.excerpt), sourceUrl: z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)).parse(input.sourceUrl) };
  const db = getDatabase(); return db.transaction(async (tx) => { const inserted = await tx.insert(evidence).values({ sourceLabel: input.sourceLabel, sourceUrl: input.sourceUrl, sourceKind: input.sourceKind, excerpt: input.excerpt, scope: input.scope ?? null, verificationStatus: input.verificationStatus, capturedAt: new Date(), verifiedAt: input.verificationStatus === "official_verified" ? new Date() : null }).returning({ id: evidence.id }); const evidenceId = inserted[0].id; if (input.promotionId) await tx.insert(promotionEvidence).values({ promotionId: input.promotionId, evidenceId }); if (input.guideId) await tx.insert(guideEvidence).values({ guideId: input.guideId, evidenceId }); if (input.ruleVersionId) await tx.update(evidence).set({ ruleVersionId: input.ruleVersionId }).where(eq(evidence.id, evidenceId)); await audit(tx, input.actor, "evidence.create", "evidence", evidenceId, ["sourceLabel", "sourceUrl", "verificationStatus"]); return evidenceId; });
}

export const ruleInputSchema = z.object({ opportunity: opportunityRuleSchema.optional(), code: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), name: z.string().min(1), type: z.string().min(1), terms: list.pipe(z.array(z.string().trim().min(1)).min(1)), applicability: list, validFrom: dateValue, validUntil: dateOrNull, timeZone: timeZoneSchema.default("Asia/Shanghai"), verificationStatus: z.enum(["official_verified", "community", "unverified", "conflict", "reverify"]).default("unverified"), revisionReason: z.string().min(1).default("首次录入"), ruleId: z.uuid().optional() });
export async function saveRule(input: z.input<typeof ruleInputSchema>, actor: string) {
  const data = ruleInputSchema.parse(input); const pid = await programId(); const db = getDatabase();
  return db.transaction(async (tx) => {
    let ruleId = data.ruleId;
    if (!ruleId) { const inserted = await tx.insert(rules).values({ programId: pid, code: data.code, name: data.name, type: data.type }).returning({ id: rules.id }); ruleId = inserted[0].id; await audit(tx, actor, "rule.create", "rule", ruleId, ["code", "name", "type"]); }
    const latest = await tx.select({ latest: max(ruleVersions.version) }).from(ruleVersions).where(eq(ruleVersions.ruleId, ruleId));
    const version = Number(latest[0]?.latest ?? 0) + 1;
    const inserted = await tx.insert(ruleVersions).values({ ruleId, programId: pid, version, terms: data.terms, applicability: data.applicability, validFrom: data.validFrom, validUntil: data.validUntil, timeZone: data.timeZone, verificationStatus: data.verificationStatus, revisionReason: data.revisionReason, structuredContent: data.opportunity ? { opportunity: data.opportunity } : {} }).returning({ id: ruleVersions.id });
    await tx.update(rules).set({ updatedAt: new Date() }).where(eq(rules.id, ruleId));
    await audit(tx, actor, "rule.version.create", "rule", ruleId, ["version", "terms", "applicability", "validFrom", "validUntil", "verificationStatus"]);
    return { ruleId, versionId: inserted[0].id, version };
  });
}
