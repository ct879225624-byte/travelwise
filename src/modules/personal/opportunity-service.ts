import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, type Database } from "@/db/client";
import { actions, actionTasks, auditLogs, evidence, opportunityProfiles, owners, personalReminders, pointBatches, programs, promotionEvidence, promotionRules, promotions, ruleVersions, savedScenarios, wallets } from "@/db/schema";
import { requireOwner } from "./auth";
import { evaluateOpportunity, isCurrent, isFormal, officialSources, opportunityFactsSchema, opportunityRuleSchema, rankOpportunity, sortOpportunities, type Opportunity, type OpportunityFacts } from "./opportunity-model";
import { calculateOpportunityValue } from "./opportunity-value";
import { closedAction, enrolledAction, generateReminders } from "./reminder-model";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
function fingerprint(value: unknown) {
  const canonical = (v: unknown): unknown => typeof v === "bigint" ? v.toString() : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
async function readEngine(tx: Tx, ownerId: string, now: Date) {
  const mineWallets = await tx.select().from(wallets).where(eq(wallets.ownerId, ownerId));
  const mineActions = await tx.select().from(actions).where(eq(actions.ownerId, ownerId));
  const mineBatches = await tx.select().from(pointBatches).where(eq(pointBatches.ownerId, ownerId));
  const mineTasks = await tx.select().from(actionTasks).where(eq(actionTasks.ownerId, ownerId));
  const mineProfiles = await tx.select().from(opportunityProfiles).where(eq(opportunityProfiles.ownerId, ownerId));
  const scenarios = await tx.select().from(savedScenarios).where(eq(savedScenarios.ownerId, ownerId));
  const candidates = await tx.select({ promotion: promotions, program: programs }).from(promotions).innerJoin(programs, eq(promotions.programId, programs.id)).where(and(eq(promotions.publicationStatus, "published"), eq(promotions.isDemo, false), eq(promotions.verificationStatus, "official_verified")));
  const ids = candidates.map(({ promotion }) => promotion.id);
  const links = ids.length ? await tx.select().from(promotionRules).where(inArray(promotionRules.promotionId, ids)) : [];
  const ruleIds = [...new Set([...candidates.flatMap(({ promotion }) => promotion.ruleVersionId ? [promotion.ruleVersionId] : []), ...links.map((l) => l.ruleVersionId)])];
  const versions = ruleIds.length ? await tx.select().from(ruleVersions).where(inArray(ruleVersions.id, ruleIds)) : [];
  const evidenceLinks = ids.length ? await tx.select().from(promotionEvidence).where(inArray(promotionEvidence.promotionId, ids)) : [];
  const evidenceIds = evidenceLinks.map((l) => l.evidenceId);
  const sources = evidenceIds.length || ruleIds.length ? await tx.select().from(evidence).where(
    // Only public content tables are queried across owners.
    or(evidenceIds.length ? inArray(evidence.id, evidenceIds) : undefined, ruleIds.length ? inArray(evidence.ruleVersionId, ruleIds) : undefined),
  ) : [];
  const opportunities: Opportunity[] = [];
  const formal: Array<{ promotion: typeof promotions.$inferSelect; rules: typeof ruleVersions.$inferSelect[]; tracked: boolean }> = [];
  for (const { promotion: p, program } of candidates) {
    const pRules = versions.filter((r) => r.programId === p.programId && (r.id === p.ruleVersionId || links.some((l) => l.promotionId === p.id && l.ruleVersionId === r.id))).sort((a, b) => a.id.localeCompare(b.id));
    const pSources = sources.filter((s) => evidenceLinks.some((l) => l.promotionId === p.id && l.evidenceId === s.id) || pRules.some((r) => r.id === s.ruleVersionId));
    const wallet = mineWallets.find((w) => w.programId === p.programId);
    const relevantActions = mineActions.filter((a) => a.promotionId === p.id);
    if ((!wallet && !relevantActions.length) || !isFormal(p, pSources)) continue;
    const profile = mineProfiles.find((f) => f.promotionId === p.id);
    const approvedRules = pRules.filter((r) => r.publicationStatus === "published" && r.verificationStatus === "official_verified" && !r.isDemo && r.validFrom <= now && (!r.validUntil || r.validUntil > now) && officialSources(pSources).some((source) => source.ruleVersionId === r.id));
    formal.push({ promotion: p, tracked: Boolean(profile?.confirmedAt), rules: approvedRules });
    if (!isCurrent(p, pSources, now) || (relevantActions.length > 0 && relevantActions.every(closedAction))) continue;
    const hash = fingerprint({ programId: p.programId, rules: pRules.map((r) => ({ id: r.id, version: r.version, terms: r.terms, applicability: r.applicability, structuredContent: r.structuredContent, validFrom: r.validFrom, validUntil: r.validUntil, publicationStatus: r.publicationStatus, verificationStatus: r.verificationStatus })), eligibility: p.eligibility, qualification: p.qualification, brands: p.brands, regions: p.regions, channels: p.channels, rewardType: p.rewardType, rewardAmount: p.rewardAmount, rewardUnit: p.rewardUnit, dates: [p.startsAt, p.endsAt, p.enrollmentStartsAt, p.enrollmentEndsAt, p.bookingStartsAt, p.bookingEndsAt, p.stayStartsAt, p.stayEndsAt, p.claimStartsAt, p.claimEndsAt, p.otherDeadlineAt] });
    const changed = profile ? profile.ruleFingerprint !== hash : relevantActions.some((a) => a.ruleVersionId !== p.ruleVersionId);
    const latestAction = relevantActions.filter((a) => !closedAction(a) && a.ruleVersionId === p.ruleVersionId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const progress = Object.fromEntries(Object.entries(latestAction?.progress ?? {}).filter(([key]) => key in opportunityFactsSchema.shape));
    const parsed = opportunityFactsSchema.safeParse(!changed ? { ...progress, ...profile?.facts } : {});
    const facts: OpportunityFacts = parsed.success ? parsed.data : {};
    if (facts.enrolled === undefined && relevantActions.some(enrolledAction)) facts.enrolled = true;
    const evaluation = evaluateOpportunity({ promotion: p, rules: pRules, sources: pSources, wallet, facts, batches: mineBatches, changed, now });
    const pRuleIds = pRules.map((r) => r.id);
    const value = !changed && evaluation.eligibility.status === "meets-known-conditions" ? scenarios.filter((s) => s.inputSnapshot.opportunityFingerprint === hash).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((s) => calculateOpportunityValue(s, p, pRuleIds, evaluation.eligibility.status, pRules)).find((v) => v !== null) ?? null : null;
    const spendDeadlines = approvedRules.flatMap((r) => { const parsed = opportunityRuleSchema.safeParse(r.structuredContent.opportunity); return parsed.success && parsed.data.spendEndsAt ? [new Date(parsed.data.spendEndsAt)] : []; });
    const deadlines = [p.enrollmentEndsAt && !facts.enrolled ? p.enrollmentEndsAt : null, p.bookingEndsAt, p.stayEndsAt, p.endsAt, ...spendDeadlines].filter((d): d is Date => d !== null && d > now);
    const nextStep = changed ? "重新确认当前版本的个人条件" : evaluation.eligibility.status === "fails-known-conditions" ? "核对未满足条件，暂勿按可参加安排消费" : evaluation.eligibility.status !== "meets-known-conditions" ? "补充条件并核对官方规则" : !facts.enrolled && p.enrollmentEndsAt ? "前往官方渠道完成报名并登记状态" : p.steps[0] ?? "查看官方活动步骤并保存参与计划";
    const item: Opportunity = { id: p.id, title: p.title, slug: p.slug, programId: p.programId, programName: program.name, fingerprint: hash, enrolled: facts.enrolled, ...evaluation, reasons: [wallet ? `你已登记${program.name}${wallet.membershipTier ? ` · ${wallet.membershipTier}` : ""}` : "你已保存该活动的参与记录", ...(facts.enrolled ? ["已登记报名或参与状态"] : [])], ruleChanged: changed, deadline: new Date(Math.min(...deadlines.map((d) => d.getTime()))), timeZone: p.timeZone, nextStep, href: `/discover/${p.slug}`, sources: officialSources(pSources).map((s) => ({ id: s.id, label: s.sourceLabel, url: s.sourceUrl! })), rules: pRules.map((r) => ({ id: r.id, version: r.version })), value, score: 0, scoreReasons: [] };
    Object.assign(item, rankOpportunity(item, Boolean(wallet), now)); opportunities.push(item);
  }
  return { opportunities: sortOpportunities(opportunities), drafts: generateReminders({ opportunities, promotions: formal, actions: mineActions, batches: mineBatches, tasks: mineTasks, now }), profiles: mineProfiles };
}

export async function personalOpportunityEngine(now = new Date()) {
  const owner = await requireOwner(); const db = getDatabase();
  return db.transaction(async (tx) => {
    // Same owner lock as the V1 ledger: refresh and status mutations cannot race.
    await tx.select({ id: owners.id }).from(owners).where(eq(owners.id, owner.id)).for("update");
    const result = await readEngine(tx, owner.id, now);
    // Remember the first observed official basis even before the Owner supplies
    // facts, so subsequent semantic changes are visible rather than silently new.
    for (const o of result.opportunities) if (!result.profiles.some((p) => p.promotionId === o.id)) {
      const [profile] = await tx.insert(opportunityProfiles).values({ ownerId: owner.id, promotionId: o.id, ruleFingerprint: o.fingerprint }).onConflictDoNothing().returning();
      if (profile) result.profiles.push(profile);
    }
    await tx.update(personalReminders).set({ active: false }).where(and(eq(personalReminders.ownerId, owner.id), eq(personalReminders.active, true)));
    for (const draft of result.drafts) await tx.insert(personalReminders).values({ ...draft, ownerId: owner.id }).onConflictDoUpdate({ target: [personalReminders.ownerId, personalReminders.sourceKey], set: { ...draft, active: true } });
    const reminders = await tx.select().from(personalReminders).where(eq(personalReminders.ownerId, owner.id));
    // Wake snoozed reminders once, without generating a new notification.
    for (const reminder of reminders) if (reminder.status === "snoozed" && reminder.snoozedUntil && reminder.snoozedUntil <= now) {
      await tx.update(personalReminders).set({ status: "pending", snoozedUntil: null, updatedAt: now }).where(and(eq(personalReminders.id, reminder.id), eq(personalReminders.ownerId, owner.id)));
      reminder.status = "pending"; reminder.snoozedUntil = null;
    }
    return { evaluatedAt: now.toISOString(), opportunities: result.opportunities, profiles: result.profiles, reminders: reminders.sort((a, b) => (a.deadlineAt?.getTime() ?? Infinity) - (b.deadlineAt?.getTime() ?? Infinity) || a.sourceKey.localeCompare(b.sourceKey)) };
  });
}
export const confirmOpportunitySchema = z.object({ promotionId: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), facts: opportunityFactsSchema }).strict();
export async function scenarioOpportunityBasis(ref: unknown, ruleIds: string[]) {
  if (typeof ref !== "string" || !ref) return null;
  const owner = await requireOwner();
  return getDatabase().transaction(async (tx) => {
    const current = (await readEngine(tx, owner.id, new Date())).opportunities.find((o) => o.id === ref || o.slug === ref);
    return current && current.rules.length === ruleIds.length && current.rules.every((r) => ruleIds.includes(r.id)) ? current.fingerprint : null;
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function confirmOpportunity(input: z.input<typeof confirmOpportunitySchema>) {
  const owner = await requireOwner(); const value = confirmOpportunitySchema.parse(input);
  return getDatabase().transaction(async (tx) => {
    await tx.select({ id: owners.id }).from(owners).where(eq(owners.id, owner.id)).for("update");
    const current = (await readEngine(tx, owner.id, new Date())).opportunities.find((o) => o.id === value.promotionId);
    if (!current || current.fingerprint !== value.fingerprint) throw new Error("活动或规则已变化，请刷新后重新核对");
    const row = (await tx.insert(opportunityProfiles).values({ ownerId: owner.id, promotionId: value.promotionId, facts: value.facts, ruleFingerprint: current.fingerprint, confirmedAt: new Date() }).onConflictDoUpdate({ target: [opportunityProfiles.ownerId, opportunityProfiles.promotionId], set: { facts: value.facts, ruleFingerprint: current.fingerprint, confirmedAt: new Date() } }).returning())[0];
    await tx.insert(auditLogs).values({ actorOwnerId: owner.id, operation: "opportunity.confirm", entityType: "opportunity_profile", entityId: row.id, changedFields: ["facts", "ruleFingerprint"] }); return row;
  });
}
export const reminderUpdateSchema = z.object({ status: z.enum(["pending", "read", "completed", "ignored", "snoozed"]), snoozedUntil: z.iso.datetime({ offset: true }).optional() }).strict();
export async function updateReminder(id: string, input: z.input<typeof reminderUpdateSchema>) {
  const owner = await requireOwner(); z.uuid().parse(id); const value = reminderUpdateSchema.parse(input);
  const until = value.status === "snoozed" && value.snoozedUntil ? new Date(value.snoozedUntil) : null;
  if (value.status === "snoozed" && (!until || until.getTime() <= Date.now() || until.getTime() > Date.now() + 90 * 86400000)) throw new Error("稍后时间必须在未来 90 天内");
  return getDatabase().transaction(async (tx) => {
    await tx.select({ id: owners.id }).from(owners).where(eq(owners.id, owner.id)).for("update");
    const row = (await tx.update(personalReminders).set({ status: value.status, snoozedUntil: until, updatedAt: new Date() }).where(and(eq(personalReminders.id, id), eq(personalReminders.ownerId, owner.id))).returning())[0];
    if (!row) throw new Error("提醒不存在");
    // Completing a task reminder completes the original task atomically.
    if (row.kind === "task" && value.status === "completed") {
      const taskId = row.sourceKey.split(":")[1];
      await tx.update(actionTasks).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(actionTasks.id, taskId), eq(actionTasks.ownerId, owner.id)));
    }
    await tx.insert(auditLogs).values({ actorOwnerId: owner.id, operation: "reminder.update", entityType: "personal_reminder", entityId: row.id, changedFields: ["status", "snoozedUntil"] }); return row;
  });
}
