import "server-only";
import { cache } from "react";
import { readEnvironment } from "@/shared/env";
import { getDatabase } from "@/db/client";
import { browseSchema, PAGE_SIZE, type BrowseFilters } from "@/shared/browse";
import { demoPromotions } from "./demo";
import { effectiveLifecycle, slugSchema } from "./model";
import { countPublishedPromotions, queryPromotionFacets, queryPublishedPromotions } from "./queries";

export async function browsePromotions(options: Partial<BrowseFilters> = {}) {
  const filters = browseSchema.parse(options);
  if (readEnvironment().source === "demo") {
    const all = structuredClone(demoPromotions).map((item) => ({ ...item, lifecycleStatus: effectiveLifecycle(item) }));
    const matched = all.filter((item) => (!filters.q || `${item.title} ${item.summary}`.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.category || item.category === filters.category) && (!filters.platform || item.platform === filters.platform) && (!filters.lifecycle || item.lifecycleStatus === filters.lifecycle) && (!filters.verification || item.verificationStatus === filters.verification));
    return { items: matched.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE), total: matched.length, categories: [...new Set(all.map((item) => item.category))], platforms: [...new Set(all.map((item) => item.platform))] };
  }
  const db = getDatabase(); const includeDemo = process.env.NODE_ENV !== "production";
  const [items, total, facets] = await Promise.all([queryPublishedPromotions(db, { filters, includeDemo }), countPublishedPromotions(db, filters, includeDemo), queryPromotionFacets(db, includeDemo)]);
  return { items, total, ...facets };
}
export async function listPromotions(options: Partial<BrowseFilters> = {}) { return (await browsePromotions(options)).items; }

export const getPromotion = cache(async (slug: string) => {
  const parsed = slugSchema.safeParse(slug); if (!parsed.success) return null;
  if (readEnvironment().source === "demo") { const item = structuredClone(demoPromotions.find((item) => item.slug === parsed.data) ?? null); return item ? { ...item, lifecycleStatus: effectiveLifecycle(item) } : null; }
  const rows = await queryPublishedPromotions(getDatabase(), { slug: parsed.data, filters: browseSchema.parse({}), includeDemo: process.env.NODE_ENV !== "production" });
  return rows[0] ?? null;
});