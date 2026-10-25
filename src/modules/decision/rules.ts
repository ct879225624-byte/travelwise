import type { RuleApplicability, RuleVerification } from "./types";

export function validateRuleApplicability(rule: RuleVerification, eventDate: string, requireEvidence = true): RuleApplicability {
  const reasons: string[] = [];
  const eventTime = Date.parse(eventDate);
  const from = Date.parse(rule.validFrom);
  const until = rule.validUntil ? Date.parse(rule.validUntil) : null;
  if (Number.isNaN(eventTime) || Number.isNaN(from) || until !== null && Number.isNaN(until)) reasons.push("规则或事件日期无效");
  if (rule.publicationStatus !== "published") reasons.push("规则版本未发布");
  if (rule.verificationStatus !== "official_verified") reasons.push("规则尚未达到官方核实状态");
  if (requireEvidence && rule.evidenceIds.length === 0) reasons.push("规则没有关联来源证据");
  if (!Number.isNaN(eventTime) && !Number.isNaN(from) && eventTime < from) reasons.push("事件日期早于规则生效时间");
  if (!Number.isNaN(eventTime) && until !== null && !Number.isNaN(until) && eventTime >= until) reasons.push("事件日期已超出规则有效期");
  const status = reasons.length === 0 ? "usable" : rule.publicationStatus === "published" && rule.verificationStatus === "official_verified" && reasons.every((reason) => reason.includes("事件日期")) ? "not-usable" : "unknown";
  return { status, reasons, rule };
}

export function detectManualConflict(manualValue: string | number | null | undefined, verifiedValue: string | number | null | undefined, label: string): string | null {
  if (manualValue === null || manualValue === undefined || verifiedValue === null || verifiedValue === undefined) return null;
  return String(manualValue) === String(verifiedValue) ? null : `${label}与数据库已核实参数冲突：手动输入 ${manualValue}，规则参数 ${verifiedValue}`;
}
