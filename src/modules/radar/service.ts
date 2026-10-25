import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditLogs, monitorRuns, monitorSources, monitorVersions, programs, radarEvents } from "@/db/schema";
import { assertPublicUrl, compareContent, extractMonitorRegion, fingerprint, monitorUrlSchema, normalizeContent, PublicFetchError } from "./model";
import { z } from "zod";

const sourceType = z.enum(["web", "rss", "atom", "announcement", "help", "bank"]);
export const monitorSourceInputSchema = z.object({ name: z.string().trim().min(1).max(160), url: monitorUrlSchema, sourceType, programId: z.uuid().nullable().optional(), enabled: z.coerce.boolean().default(true), frequencyHours: z.coerce.number().int().min(1).max(168).default(12), selector: z.string().trim().max(200).nullable().optional() });
export type MonitorSourceInput = z.input<typeof monitorSourceInputSchema>;

const activeRuns = new Map<string, Promise<MonitorResult>>();
type MonitorResult = { sourceId: string; status: "success" | "unchanged" | "changed" | "error" | "blocked"; eventId?: string; message?: string };

async function audit(actor: string, operation: string, entityType: string, entityId: string, changedFields: string[]) {
  await getDatabase().insert(auditLogs).values({ actor, operation, entityType, entityId, changedFields });
}

export async function listMonitorSources() { return getDatabase().select({ source: monitorSources, program: programs }).from(monitorSources).leftJoin(programs, eq(monitorSources.programId, programs.id)).orderBy(desc(monitorSources.updatedAt)); }
export async function listRadarPrograms() { return getDatabase().select({ id: programs.id, name: programs.name }).from(programs).orderBy(programs.name); }
export async function listRadarEvents(status?: "pending" | "confirmed" | "ignored" | "duplicate") {
  return getDatabase().select({ event: radarEvents, source: monitorSources, version: monitorVersions }).from(radarEvents).innerJoin(monitorSources, eq(radarEvents.sourceId, monitorSources.id)).innerJoin(monitorVersions, eq(radarEvents.newVersionId, monitorVersions.id)).where(status ? eq(radarEvents.status, status) : undefined).orderBy(desc(radarEvents.detectedAt));
}
export async function getRadarEvent(id: string) {
  const rows = await getDatabase().select({ event: radarEvents, source: monitorSources, next: monitorVersions }).from(radarEvents).innerJoin(monitorSources, eq(radarEvents.sourceId, monitorSources.id)).innerJoin(monitorVersions, eq(radarEvents.newVersionId, monitorVersions.id)).where(eq(radarEvents.id, id));
  if (!rows[0]) return null;
  const previous = rows[0].event.previousVersionId ? await getDatabase().select().from(monitorVersions).where(eq(monitorVersions.id, rows[0].event.previousVersionId)) : [];
  return { ...rows[0], previous: previous[0] ?? null };
}

export async function saveMonitorSource(input: MonitorSourceInput, actor: string) {
  const data = monitorSourceInputSchema.parse(input);
  await assertPublicUrl(data.url);
  const db = getDatabase();
  const source = await db.insert(monitorSources).values({ ...data, programId: data.programId ?? null, selector: data.selector ?? null }).returning({ id: monitorSources.id });
  await audit(actor, "monitor.source.create", "monitor_source", source[0].id, ["name", "url", "sourceType", "frequencyHours", "enabled"]);
  return source[0].id;
}

export async function setMonitorSourceEnabled(id: string, enabled: boolean, actor: string) {
  await getDatabase().update(monitorSources).set({ enabled, updatedAt: new Date(), errorMessage: enabled ? null : "已暂停监控" }).where(eq(monitorSources.id, id));
  await audit(actor, enabled ? "monitor.source.resume" : "monitor.source.pause", "monitor_source", id, ["enabled"]);
}

async function executeMonitor(sourceId: string, actor = "radar-runner", attempt = 1): Promise<MonitorResult> {
  const db = getDatabase();
  const source = (await db.select().from(monitorSources).where(eq(monitorSources.id, sourceId)))[0];
  if (!source) throw new Error("监控来源不存在");
  if (!source.enabled) return { sourceId, status: "blocked", message: "来源已暂停" };
  const startedAt = new Date();
  const previous = (await db.select().from(monitorVersions).where(eq(monitorVersions.sourceId, sourceId)).orderBy(desc(monitorVersions.version)).limit(1))[0];
  try {
    const { fetchPublicResource } = await import("./model");
    const result = await fetchPublicResource(source.url, { etag: source.etag, lastModified: source.lastModified });
    if (result.notModified) {
      await db.update(monitorSources).set({ lastCheckedAt: new Date(), lastSuccessAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(monitorSources.id, sourceId));
      await db.insert(monitorRuns).values({ sourceId, status: "unchanged", httpStatus: result.status, attempt, startedAt, finishedAt: new Date() });
      return { sourceId, status: "unchanged", message: "HTTP 条件请求未变化" };
    }
    const normalized = normalizeContent(extractMonitorRegion(result.body, source.selector));
    const hash = fingerprint(normalized);
    if (previous?.fingerprint === hash) {
      await db.update(monitorSources).set({ lastCheckedAt: new Date(), lastSuccessAt: new Date(), latestFingerprint: hash, etag: result.etag, lastModified: result.lastModified, errorMessage: null, updatedAt: new Date() }).where(eq(monitorSources.id, sourceId));
      await db.insert(monitorRuns).values({ sourceId, status: "unchanged", httpStatus: result.status, attempt, startedAt, finishedAt: new Date() });
      return { sourceId, status: "unchanged", message: "内容指纹未变化" };
    }
    const version = (await db.select({ version: monitorVersions.version }).from(monitorVersions).where(eq(monitorVersions.sourceId, sourceId)).orderBy(desc(monitorVersions.version)).limit(1))[0]?.version ?? 0;
    const inserted = await db.insert(monitorVersions).values({ sourceId, version: version + 1, fingerprint: hash, normalizedContent: normalized, httpStatus: result.status, contentType: result.contentType, etag: result.etag, lastModified: result.lastModified, fetchedAt: new Date() }).onConflictDoNothing().returning({ id: monitorVersions.id });
    if (!inserted[0]) return { sourceId, status: "unchanged", message: "并发运行已写入相同版本" };
    const diff = compareContent(previous?.normalizedContent ?? null, normalized);
    let eventId: string | undefined;
    if (diff.meaningful) {
      const event = await db.insert(radarEvents).values({ sourceId, previousVersionId: previous?.id ?? null, newVersionId: inserted[0].id, summary: diff.summary, diff: { added: diff.added, removed: diff.removed, changed: diff.changed }, detectedAt: new Date() }).onConflictDoNothing().returning({ id: radarEvents.id });
      eventId = event[0]?.id;
    }
    await db.update(monitorSources).set({ lastCheckedAt: new Date(), lastSuccessAt: new Date(), latestFingerprint: hash, etag: result.etag, lastModified: result.lastModified, errorMessage: null, updatedAt: new Date() }).where(eq(monitorSources.id, sourceId));
    await db.insert(monitorRuns).values({ sourceId, status: diff.meaningful ? "changed" : "unchanged", httpStatus: result.status, attempt, startedAt, finishedAt: new Date() });
    if (eventId) await audit(actor, "monitor.event.create", "radar_event", eventId, ["status", "diff"]);
    return { sourceId, status: diff.meaningful ? "changed" : "unchanged", eventId, message: diff.summary };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "来源访问失败";
    const httpStatus = error instanceof PublicFetchError ? error.status : undefined;
    const blocked = /禁止|受限|SSRF|私有|metadata/i.test(message);
    await db.update(monitorSources).set({ lastCheckedAt: new Date(), errorMessage: message, updatedAt: new Date() }).where(eq(monitorSources.id, sourceId));
    await db.insert(monitorRuns).values({ sourceId, status: blocked ? "blocked" : "error", httpStatus, attempt, errorMessage: message, startedAt, finishedAt: new Date() });
    return { sourceId, status: blocked ? "blocked" : "error", message };
  }
}

export function runMonitorSource(sourceId: string, actor?: string) {
  const existing = activeRuns.get(sourceId); if (existing) return existing;
  const run = (async () => { let last: MonitorResult = { sourceId, status: "error" }; for (let attempt = 0; attempt < 3; attempt += 1) { last = await executeMonitor(sourceId, actor, attempt + 1); if (!["error"].includes(last.status)) break; await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt)); } return last; })().finally(() => activeRuns.delete(sourceId));
  activeRuns.set(sourceId, run); return run;
}

export async function runDueMonitorSources(actor = "radar-scheduler") {
  const rows = await getDatabase().select().from(monitorSources).where(eq(monitorSources.enabled, true));
  const due = rows.filter((source) => !source.lastCheckedAt || Date.now() - source.lastCheckedAt.getTime() >= source.frequencyHours * 3_600_000);
  const results: MonitorResult[] = []; const limit = 2;
  for (let i = 0; i < due.length; i += limit) results.push(...await Promise.all(due.slice(i, i + limit).map((source) => runMonitorSource(source.id, actor))));
  return results;
}

export async function reviewRadarEvent(id: string, status: "confirmed" | "ignored" | "duplicate", actor: string, duplicateOf?: string) {
  const event = (await getDatabase().select().from(radarEvents).where(eq(radarEvents.id, id)))[0]; if (!event) throw new Error("情报不存在");
  await getDatabase().update(radarEvents).set({ status, duplicateOf: status === "duplicate" ? duplicateOf ?? null : null, reviewedAt: new Date(), reviewedBy: actor, updatedAt: new Date() }).where(eq(radarEvents.id, id));
  await audit(actor, `radar.event.${status}`, "radar_event", id, ["status", "reviewedAt", "reviewedBy"]);
}
