import { z } from "zod";

export type SearchParams = Record<string, string | string[] | undefined>;
export const lifecycleValues = ["scheduled", "active", "ended", "archived", "unknown"] as const;
export const verificationValues = ["official_verified", "community", "unverified", "conflict", "reverify"] as const;
export const browseSchema = z.object({
  q: z.string().trim().max(100).catch(""), category: z.string().trim().max(80).catch(""),
  platform: z.string().trim().max(80).catch(""),
  lifecycle: z.enum(lifecycleValues).or(z.literal("")).catch(""),
  verification: z.enum(verificationValues).or(z.literal("")).catch(""),
  sort: z.enum(["newest", "ending", "updated"]).catch("newest"),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
export type BrowseFilters = z.infer<typeof browseSchema>;
export const PAGE_SIZE = 12;
export function browseHref(path: string, filters: Partial<BrowseFilters>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && !(key === "page" && value === 1) && !(key === "sort" && value === "newest")) query.set(key, String(value));
  return `${path}${query.size ? `?${query}` : ""}`;
}

// Treat user text literally in LIKE searches, including % and _.
export function searchPattern(value: string) { return `%${value.replace(/[\\%_]/g, "\\$&")}%`; }
