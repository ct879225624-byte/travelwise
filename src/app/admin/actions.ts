"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getAdmin } from "@/modules/admin/auth";
import { parseLocalInput } from "@/shared/time";
import { promotionInputFromForm, savePromotion, setPromotionStatus, saveGuide, setGuideStatus, saveEvidence, saveRule, setRuleVersionStatus, reviewEvidence } from "@/modules/admin/service";
import { getRadarEvent, runMonitorSource, reviewRadarEvent, saveMonitorSource, setMonitorSourceEnabled } from "@/modules/radar/service";
import { createAiTask, saveDraftFromAiTask } from "@/modules/ai/service";
import { extractionFieldNames, type ExtractionFieldName } from "@/modules/ai/model";

async function actor() { const admin = await getAdmin(); if (!admin) throw new Error("登录已失效，请重新登录后重试"); return admin.email; }
const verificationValues = ["official_verified", "community", "unverified", "conflict", "reverify"] as const;
const sourceValues = ["official", "community", "other"] as const;
type Verification = typeof verificationValues[number];
const optional = (form: FormData, name: string) => String(form.get(name) || "") || undefined;

function feedback(error: unknown) {
  if (error instanceof ZodError) return { error: "字段格式无效，请检查名称、Slug、日期、关联项和必填内容。" };
  const cause = error instanceof Error && error.cause ? error.cause : error;
  const code = typeof cause === "object" && cause && "code" in cause ? cause.code : undefined;
  if (code === "23505") return { error: "Slug、规则代码或来源网址已存在，请检查现有记录后重试。" };
  if (code === "23503") return { error: "关联的活动、规则或分类不存在，请刷新并重新选择。" };
  if (code === "23514") return { error: "数据未满足约束，请检查日期先后顺序、金额及 DEMO 标记。" };
  if (error instanceof Error && /^(发布.*前必须关联来源证据|登录已失效|规则版本不存在|关联规则不存在|时间)/.test(error.message)) return { error: error.message };
  return { error: "操作未完成。请检查输入、来源证据和数据库连接后重试；原输入仍保留。" };
}

export async function savePromotionAction(form: FormData) {
  let id: string | null;
  try { id = await savePromotion(promotionInputFromForm(form), optional(form, "id") ?? null, await actor()); } catch (error) { return feedback(error); }
  redirect(`/admin/promotions/${id}`);
}
export async function statusPromotionAction(form: FormData) {
  try { await setPromotionStatus(String(form.get("id")), String(form.get("status")) as "draft" | "pending_review" | "published" | "withdrawn" | "archived", await actor()); } catch (error) { return feedback(error); }
  redirect("/admin");
}
export async function saveGuideAction(form: FormData) {
  let id: string | null;
  try {
    const email = await actor(); const verificationStatus = String(form.get("verificationStatus") || "unverified");
    if (!verificationValues.includes(verificationStatus as Verification)) throw new Error("Invalid guide status");
    id = await saveGuide({ slug: String(form.get("slug")), title: String(form.get("title")), summary: String(form.get("summary")), body: String(form.get("body")), categoryId: String(form.get("categoryId")), tags: String(form.get("tags") ?? "").split("\n").filter(Boolean), verificationStatus: verificationStatus as Verification, isDemo: form.get("isDemo") === "true", revisionReason: String(form.get("revisionReason") || "编辑内容") }, optional(form, "id") ?? null, email);
  } catch (error) { return feedback(error); }
  redirect(`/admin/guides/${id}`);
}
export async function statusGuideAction(form: FormData) {
  try { await setGuideStatus(String(form.get("id")), String(form.get("status")) as "draft" | "pending_review" | "published" | "withdrawn" | "archived", await actor()); } catch (error) { return feedback(error); }
  redirect("/admin");
}
export async function saveEvidenceAction(form: FormData) {
  try {
    const email = await actor(); const sourceKind = String(form.get("sourceKind")); const verificationStatus = String(form.get("verificationStatus"));
    if (!sourceValues.includes(sourceKind as typeof sourceValues[number]) || !verificationValues.includes(verificationStatus as Verification)) throw new Error("Invalid evidence status");
    await saveEvidence({ sourceLabel: String(form.get("sourceLabel")), sourceUrl: optional(form, "sourceUrl") ?? null, sourceKind: sourceKind as typeof sourceValues[number], excerpt: String(form.get("excerpt")), scope: String(form.get("scope") || ""), verificationStatus: verificationStatus as Verification, promotionId: optional(form, "promotionId"), guideId: optional(form, "guideId"), ruleVersionId: optional(form, "ruleVersionId"), actor: email });
  } catch (error) { return feedback(error); }
  redirect("/admin/evidence");
}
export async function saveRuleAction(form: FormData) {
  let version: number;
  try {
    const email = await actor(); const verificationStatus = String(form.get("verificationStatus") || "unverified");
    if (!verificationValues.includes(verificationStatus as Verification)) throw new Error("Invalid rule status");
    const timeZone = String(form.get("timeZone") || "Asia/Shanghai");
    const result = await saveRule({ opportunity: form.get("opportunity") ? JSON.parse(String(form.get("opportunity"))) : undefined, code: String(form.get("code")), name: String(form.get("name")), type: String(form.get("type")), terms: String(form.get("terms") ?? "").split("\n").filter(Boolean), applicability: String(form.get("applicability") ?? "").split("\n").filter(Boolean), validFrom: parseLocalInput(String(form.get("validFrom")), timeZone), validUntil: form.get("validUntil") ? parseLocalInput(String(form.get("validUntil")), timeZone) : undefined, timeZone, verificationStatus: verificationStatus as Verification, revisionReason: String(form.get("revisionReason") || "首次录入"), ruleId: optional(form, "ruleId") }, email);
    version = result.version;
  } catch (error) { return feedback(error); }
  redirect(`/admin/rules?created=${version}`);
}
export async function publishRuleAction(form: FormData) {
  try { await setRuleVersionStatus(String(form.get("id")), await actor()); } catch (error) { return feedback(error); }
  redirect("/admin/rules");
}
export async function reviewEvidenceAction(form: FormData) {
  try { await reviewEvidence(String(form.get("id")), String(form.get("verificationStatus")) as Verification, await actor()); } catch (error) { return feedback(error); }
  redirect("/admin/evidence");
}

export async function saveMonitorSourceAction(form: FormData) {
  try {
    const email = await actor();
    await saveMonitorSource({ name: String(form.get("name")), url: String(form.get("url")), sourceType: String(form.get("sourceType") || "web") as "web" | "rss" | "atom" | "announcement" | "help" | "bank", enabled: form.get("enabled") !== "false", frequencyHours: Number(form.get("frequencyHours") || 12), selector: String(form.get("selector") || "") || null, programId: String(form.get("programId") || "") || null }, email);
  } catch (error) { return feedback(error); }
  redirect("/admin/radar");
}
export async function toggleMonitorSourceAction(form: FormData) {
  try { await setMonitorSourceEnabled(String(form.get("id")), form.get("enabled") === "true", await actor()); } catch (error) { return feedback(error); }
  redirect("/admin/radar");
}
export async function runMonitorSourceAction(form: FormData) {
  try { await runMonitorSource(String(form.get("id")), await actor()); } catch (error) { return feedback(error); }
  redirect("/admin/radar");
}
export async function reviewRadarEventAction(form: FormData) {
  try { await reviewRadarEvent(String(form.get("id")), String(form.get("status")) as "confirmed" | "ignored" | "duplicate", await actor(), String(form.get("duplicateOf") || "") || undefined); } catch (error) { return feedback(error); }
  redirect("/admin/radar");
}
export async function extractRadarEventAction(form: FormData) {
  let taskId: string;
  try {
    const event = await getRadarEvent(String(form.get("id"))); if (!event) throw new Error("情报不存在");
    taskId = await createAiTask({ inputType: "radar", url: event.source.url, text: event.next.normalizedContent, sourceId: event.source.id, radarEventId: event.event.id }, await actor());
  } catch (error) { return feedback(error); }
  redirect(`/admin/smart-entry?task=${taskId}`);
}

function detectImageMime(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png" as const;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg" as const;
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp" as const;
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.slice(0, 6)))) return "image/gif" as const;
  return null;
}
export async function extractAiAction(form: FormData) {
  let taskId: string;
  try {
    const email = await actor(); const url = String(form.get("url") || "") || null; const text = String(form.get("text") || "") || null; const file = form.get("image");
    let imageBase64: string | null = null; let imageMime: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | null = null;
    if (file instanceof File && file.size) {
      if (file.size > 4 * 1024 * 1024) throw new Error("截图不能超过 4MB");
      const bytes = new Uint8Array(await file.arrayBuffer()); imageMime = detectImageMime(bytes); if (!imageMime) throw new Error("仅支持 PNG、JPEG、WEBP 或 GIF 截图"); imageBase64 = Buffer.from(bytes).toString("base64");
    }
    taskId = await createAiTask({ inputType: imageBase64 ? "image" : url ? "url" : "text", url, text, imageBase64, imageMime }, email);
  } catch (error) { return feedback(error); }
  redirect(`/admin/smart-entry?task=${taskId}`);
}
export async function saveAiDraftAction(form: FormData) {
  let promotionId: string;
  try {
    const overrides: Partial<Record<ExtractionFieldName, string>> = {};
    for (const name of extractionFieldNames) { const value = form.get(`field_${name}`); if (typeof value === "string") overrides[name] = value; }
    const created = await saveDraftFromAiTask(String(form.get("taskId")), await actor(), overrides); if (!created) throw new Error("活动草稿创建失败"); promotionId = created;
  } catch (error) { return feedback(error); }
  redirect(`/admin/promotions/${promotionId}`);
}
