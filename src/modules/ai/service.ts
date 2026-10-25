import "server-only";
import { desc, eq, ilike, or } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { aiExtractionTasks, auditLogs, promotions, radarEvents } from "@/db/schema";
import { saveEvidence, savePromotion } from "@/modules/admin/service";
import { fetchPublicResource, normalizeContent } from "@/modules/radar/model";
import { analyzeWithAvailableProvider } from "./provider";
import { aiInputSchema, emptyExtraction, extractionFieldNames, type ActivityExtraction, type ExtractionFieldName } from "./model";

export type AiInput = { inputType: "url" | "text" | "image" | "radar"; url?: string | null; text?: string | null; imageBase64?: string | null; imageMime?: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | null; sourceId?: string | null; radarEventId?: string | null };

export async function createAiTask(input: AiInput, actor: string) {
  const raw = aiInputSchema.parse({ url: input.url ?? null, text: input.text ?? null, imageBase64: input.imageBase64 ?? null, imageMime: input.imageMime ?? null });
  let text = raw.text; let error: string | null = null;
  if (raw.url) {
    try { text = normalizeContent((await fetchPublicResource(raw.url)).body); } catch (cause) { error = cause instanceof Error ? cause.message : "来源读取失败"; }
  }
  const storedText = raw.imageBase64 && raw.imageMime ? `data:${raw.imageMime};base64,${raw.imageBase64}` : text;
  const base = { sourceId: input.sourceId ?? null, radarEventId: input.radarEventId ?? null, inputType: input.inputType, sourceUrl: raw.url, sourceText: storedText, sourceMime: raw.imageMime, createdBy: actor };
  if (error) {
    const inserted = await getDatabase().insert(aiExtractionTasks).values({ ...base, status: "blocked", errorMessage: error, result: emptyExtraction(raw.url) }).returning({ id: aiExtractionTasks.id });
    return inserted[0].id;
  }
  let result: Awaited<ReturnType<typeof analyzeWithAvailableProvider>>;
  try { result = await analyzeWithAvailableProvider({ url: raw.url, text, imageBase64: raw.imageBase64, imageMime: raw.imageMime }); }
  catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 500) : "AI 提取失败";
    const inserted = await getDatabase().insert(aiExtractionTasks).values({ ...base, status: "failed", errorMessage: message, result: emptyExtraction(raw.url) }).returning({ id: aiExtractionTasks.id });
    await getDatabase().insert(auditLogs).values({ actor, operation: "ai.extract.failed", entityType: "ai_extraction", entityId: inserted[0].id, changedFields: ["status", "errorMessage"] });
    return inserted[0].id;
  }
  const blocked = "blocked" in result;
  const provider = "blocked" in result ? null : result.provider; const model = "blocked" in result ? null : result.model; const errorMessage = "blocked" in result ? result.reason : null;
  const inserted = await getDatabase().insert(aiExtractionTasks).values({ ...base, status: blocked ? "blocked" : "ready_for_review", provider, model, errorMessage, result: result.extraction }).returning({ id: aiExtractionTasks.id });
  await getDatabase().insert(auditLogs).values({ actor, operation: blocked ? "ai.extract.blocked" : "ai.extract.created", entityType: "ai_extraction", entityId: inserted[0].id, changedFields: ["status", "result", "provider"] });
  return inserted[0].id;
}

export async function listAiTasks() { return getDatabase().select().from(aiExtractionTasks).orderBy(desc(aiExtractionTasks.createdAt)).limit(50); }
export async function getAiTask(id: string) { return (await getDatabase().select().from(aiExtractionTasks).where(eq(aiExtractionTasks.id, id)))[0] ?? null; }

function value(extraction: ActivityExtraction, key: keyof ActivityExtraction) { const field = extraction[key]; return typeof field === "object" && field && "value" in field ? String(field.value) : "未知"; }
function lines(valueText: string) { return valueText === "未知" ? [] : valueText.split(/[\n；;]/).map((item) => item.trim()).filter(Boolean); }
function slugify(valueText: string, id: string) { const base = valueText.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "ai-draft"; return `${base}-${id.slice(0, 8)}`; }
function rewardAmount(valueText: string) { const match = valueText.match(/(?<!\d)(\d+(?:\.\d+)?)(?!\d)/); return match ? BigInt(Math.round(Number(match[1]))) : null; }

export async function listPotentialDuplicates(title: string) {
  const cleaned = title.trim(); if (!cleaned || cleaned === "未知") return [];
  return getDatabase().select({ id: promotions.id, title: promotions.title, slug: promotions.slug, publicationStatus: promotions.publicationStatus }).from(promotions).where(or(ilike(promotions.title, `%${cleaned.slice(0, 30)}%`), ilike(promotions.summary, `%${cleaned.slice(0, 30)}%`))).limit(10);
}

export async function saveDraftFromAiTask(taskId: string, actor: string, overrides: Partial<Record<ExtractionFieldName, string>> = {}) {
  const task = await getAiTask(taskId); if (!task) throw new Error("AI 提取任务不存在");
  const extraction = structuredClone(task.result as unknown as ActivityExtraction) as ActivityExtraction;
  for (const name of extractionFieldNames) if (overrides[name] !== undefined) { extraction[name].value = overrides[name] || "未知"; extraction[name].manuallyRevised = true; extraction[name].uncertain = !overrides[name]; }
  const title = value(extraction, "activityName"); const reward = value(extraction, "reward"); const threshold = value(extraction, "threshold");
  const promotionId = await savePromotion({ slug: slugify(title, task.id), title: title === "未知" ? `待核实活动 ${task.id.slice(0, 8)}` : title, summary: [reward, threshold].filter((item) => item !== "未知").join("；") || "AI 提取草稿，待人工核实", category: value(extraction, "activityType") === "未知" ? "待分类" : value(extraction, "activityType"), platform: value(extraction, "platform") === "未知" ? "待核实" : value(extraction, "platform"), eligibility: lines(value(extraction, "eligibility")), brands: [], channels: lines(value(extraction, "channels")), regions: [], steps: lines(value(extraction, "steps")), notes: [value(extraction, "otherTerms"), value(extraction, "stacking")].filter((item) => item !== "未知"), rewardType: reward === "未知" ? null : reward, rewardAmount: rewardAmount(reward), rewardUnit: reward.match(/积分|点数|元|%/)?.[0] ?? null, timeZone: "Asia/Shanghai", qualification: "unknown", stacking: "unknown", verificationStatus: "unverified", isDemo: false, revisionReason: "AI 智能录入草稿" }, null, actor);
  if (!promotionId) throw new Error("活动草稿创建失败");
  if (task.sourceUrl) await saveEvidence({ sourceLabel: "AI 智能录入原始来源", sourceUrl: task.sourceUrl, sourceKind: "other", excerpt: task.sourceText?.slice(0, 3000) || "原始来源待人工复核", verificationStatus: "unverified", promotionId, actor });
  await getDatabase().update(aiExtractionTasks).set({ promotionId, result: extraction, status: "completed", updatedAt: new Date() }).where(eq(aiExtractionTasks.id, taskId));
  if (task.radarEventId) await getDatabase().update(radarEvents).set({ promotionId, updatedAt: new Date() }).where(eq(radarEvents.id, task.radarEventId));
  await getDatabase().insert(auditLogs).values({ actor, operation: "ai.draft.create", entityType: "promotion", entityId: promotionId, changedFields: ["promotionId", "publicationStatus"] });
  return promotionId;
}
