import { z } from "zod";
import { instantSchema, timeZoneSchema } from "@/shared/time";
import { browseSchema } from "@/shared/browse";

export const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const sourceUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));

export const publicPromotionSchema = z.object({
  id: z.uuid(), slug: slugSchema, title: z.string().min(1), summary: z.string().min(1), category: z.string().min(1),
  programId: z.uuid(), programName: z.string().min(1), pointsName: z.string().min(1),
  platform: z.string().default("锦江荟"), isDemo: z.boolean(), isSuspended: z.boolean(), startsAt: instantSchema.nullable(), endsAt: instantSchema.nullable(), timeZone: timeZoneSchema,
  lifecycleStatus: z.enum(["scheduled", "active", "ended", "archived", "unknown"]).default("unknown"),
  verificationStatus: z.enum(["official_verified", "community", "unverified", "conflict", "reverify"]).default("unverified"),
  eligibility: z.array(z.string()).default([]), rewardType: z.string().nullable().default(null), rewardAmount: z.string().nullable().default(null), rewardUnit: z.string().nullable().default(null),
  dates: z.object({ enrollmentStartsAt: instantSchema.nullable(), enrollmentEndsAt: instantSchema.nullable(), bookingStartsAt: instantSchema.nullable(), bookingEndsAt: instantSchema.nullable(), stayStartsAt: instantSchema.nullable(), stayEndsAt: instantSchema.nullable(), claimStartsAt: instantSchema.nullable(), claimEndsAt: instantSchema.nullable(), otherDeadlineAt: instantSchema.nullable() }).default({ enrollmentStartsAt: null, enrollmentEndsAt: null, bookingStartsAt: null, bookingEndsAt: null, stayStartsAt: null, stayEndsAt: null, claimStartsAt: null, claimEndsAt: null, otherDeadlineAt: null }),
  brands: z.array(z.string()).default([]), channels: z.array(z.string()).default([]), regions: z.array(z.string()).default([]), steps: z.array(z.string()).default([]), notes: z.array(z.string()).default([]),
  qualification: z.enum(["unknown", "verified", "ineligible"]), stacking: z.enum(["unknown", "allowed", "disallowed"]),
  publishedAt: instantSchema.nullable().default(null), updatedAt: instantSchema,
  ruleVersion: z.object({ id: z.uuid(), version: z.int().positive(), terms: z.array(z.string().min(1)).min(1), isDemo: z.boolean() }).nullable(),
  linkedRules: z.array(z.object({ id: z.uuid(), name: z.string(), version: z.int().positive() })).default([]),
  relatedGuides: z.array(z.object({ slug: slugSchema, title: z.string().min(1), summary: z.string().min(1) })).default([]),
  relatedPromotions: z.array(z.object({ slug: slugSchema, title: z.string() })).default([]),
  history: z.array(z.object({ version: z.int(), createdAt: instantSchema })).default([]),
  evidence: z.array(z.object({
    id: z.uuid(), sourceLabel: z.string().min(1), sourceUrl: sourceUrl.nullable(), excerpt: z.string().min(1), sourceKind: z.enum(["official", "community", "other"]).default("other"), originalPublishedAt: instantSchema.nullable().default(null),
    isDemo: z.boolean(), capturedAt: instantSchema, verifiedAt: instantSchema.nullable(), scope: z.string().nullable().default(null), verificationStatus: z.enum(["official_verified", "community", "unverified", "conflict", "reverify"]).default("unverified"),
  }).refine((value) => value.isDemo || value.sourceUrl !== null, "Real evidence requires a source URL")).default([]),
}).refine((value) => !value.startsAt || !value.endsAt || Date.parse(value.endsAt) > Date.parse(value.startsAt), "Invalid promotion time range.")
  .refine((value) => !value.isDemo || value.title.startsWith("DEMO"), "Demo titles must start with DEMO.")
  .refine((value) => value.isDemo || (!value.ruleVersion?.isDemo && value.evidence.every((item) => !item.isDemo)), "Real promotions must not use DEMO rules or evidence.");

export type PublicPromotion = z.infer<typeof publicPromotionSchema>;

export const discoverSearchSchema = browseSchema;

export type DiscoverSearch = z.infer<typeof discoverSearchSchema>;

export function effectiveLifecycle(promotion: Pick<PublicPromotion, "startsAt" | "endsAt" | "isSuspended"> & { lifecycleStatus?: PublicPromotion["lifecycleStatus"] }, now = new Date()): PublicPromotion["lifecycleStatus"] {
  if (promotion.lifecycleStatus === "archived") return "archived";
  if (promotion.lifecycleStatus === "ended" || (promotion.endsAt && now.getTime() >= Date.parse(promotion.endsAt))) return "ended";
  if (promotion.isSuspended) return "unknown";
  if (promotion.startsAt && now.getTime() < Date.parse(promotion.startsAt)) return "scheduled";
  if (!promotion.startsAt || !promotion.endsAt) return "unknown";
  return promotion.lifecycleStatus === "unknown" ? "unknown" : "active";
}

// End is exclusive: an offer that ends at 00:00 is no longer active at 00:00.
export function getPromotionState(promotion: Pick<PublicPromotion, "startsAt" | "endsAt" | "isSuspended">, now = new Date()) {
  if (promotion.isSuspended) return "已暂停";
  return { scheduled: "未开始", active: "进行中", ended: "已结束", archived: "已归档", unknown: "状态待确认" }[effectiveLifecycle(promotion, now)];
}
