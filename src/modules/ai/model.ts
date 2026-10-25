import { z } from "zod";

export const extractionFieldNames = [
  "activityName", "platform", "partner", "activityType", "reward", "threshold", "eligibility", "enrollmentWindow", "spendWindow", "bookingWindow", "stayWindow", "claimWindow", "creditCondition", "deadline", "limit", "steps", "channels", "stacking", "otherTerms",
] as const;
export type ExtractionFieldName = typeof extractionFieldNames[number];
const field = z.object({ value: z.string(), evidence: z.array(z.string()).default([]), uncertain: z.boolean().default(true), manuallyRevised: z.boolean().default(false) });
type ExtractionField = z.infer<typeof field>;
export type ActivityExtraction = { [K in ExtractionFieldName]: ExtractionField } & { source: { url: string | null; evidence: string[] }; conflicts: string[] };
const extractionObjectSchema = z.object(Object.fromEntries(extractionFieldNames.map((name) => [name, field])) as Record<string, z.ZodTypeAny>).extend({ source: z.object({ url: z.string().nullable(), evidence: z.array(z.string()).default([]) }), conflicts: z.array(z.string()).default([]) });
export const activityExtractionSchema = extractionObjectSchema as unknown as z.ZodType<ActivityExtraction>;

export function emptyExtraction(url: string | null = null): ActivityExtraction {
  const fields = Object.fromEntries(extractionFieldNames.map((name) => [name, { value: "未知", evidence: [], uncertain: true, manuallyRevised: false }])) as unknown as Record<ExtractionFieldName, z.infer<typeof field>>;
  return { ...fields, source: { url, evidence: [] }, conflicts: [] };
}

export function parseActivityExtraction(input: unknown, sourceUrl: string | null) {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const complete = Object.fromEntries(extractionFieldNames.map((name) => [name, record[name] ?? { value: "未知", evidence: [], uncertain: true, manuallyRevised: false }])) as Record<string, unknown>;
  complete.source = { ...(record.source && typeof record.source === "object" ? record.source : {}), url: sourceUrl ?? (record.source as { url?: string | null } | undefined)?.url ?? null };
  complete.conflicts = Array.isArray(record.conflicts) ? record.conflicts : [];
  return activityExtractionSchema.parse(complete);
}

export const aiInputSchema = z.object({ url: z.string().url().nullable(), text: z.string().max(200_000).nullable(), imageBase64: z.string().max(5_500_000).nullable(), imageMime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]).nullable() }).refine((value) => value.url || value.text || value.imageBase64, "至少提供链接、原文或截图");
