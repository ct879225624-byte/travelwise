import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireTestDatabaseUrl } from "@/shared/env";
import { formatLocalInput } from "@/shared/time";

test.describe.configure({ mode: "serial" });
const day = (n: number) => new Date(Date.now() + n * 86400000);
async function login(page: Page) { await page.goto("/admin/login"); await page.getByLabel("邮箱").fill("admin@test.travelwise.local"); await page.getByLabel("密码").fill("TravelWiseTest!2026"); await page.getByRole("button", { name: "登录", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/); }
async function engine(page: Page) { const r = await page.request.get("/api/personal/opportunities"); expect(r.status()).toBe(200); expect(r.headers()["cache-control"]).toContain("no-store"); return r.json(); }
async function mutate(page: Page, url: string, body: Record<string, unknown>, method = "POST") { const r = await page.request.fetch(url, { method, data: body, headers: { Origin: new URL(page.url()).origin } }); expect(r.ok(), await r.text()).toBe(true); return r.json(); }

test("C private endpoints protect anonymous requests", async ({ page, request }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  expect((await request.get("/api/personal/opportunities")).status()).toBe(401);
  expect((await request.post("/api/personal/opportunities", { data: {} })).status()).toBe(401);
  expect((await request.patch(`/api/personal/reminders/${randomUUID()}`, { data: { status: "read" } })).status()).toBe(401);
  await page.goto("/me"); await expect(page).toHaveURL(/\/admin\/login/);
});

test("C empty data shows genuine no-opportunity and normal reminder state", async ({ page }, info) => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  await login(page); await page.goto("/me");
  await expect(page.getByRole("heading", { name: "今天有什么值得我做？" })).toBeVisible();
  // This dedicated acceptance runs first against a new browser DB. The full
  // V1 regression may have already created memberships, so assert that case too.
  const read = await engine(page);
  if (read.opportunities.length === 0) await expect(page.getByText("暂无适用于你的正式优惠机会", { exact: true })).toBeVisible();
  if (!read.reminders.some((r: { active: boolean; status: string }) => r.active && ["pending", "read"].includes(r.status))) await expect(page.getByText("当前没有需要处理的提醒，状态正常。")).toBeVisible();
  await expect(page.getByRole("link", { name: "公共发现", exact: true })).toBeVisible();
  await mkdir("docs/screenshots/v1.1-c", { recursive: true });
  if (read.opportunities.length === 0 && !read.reminders.some((r: { active: boolean }) => r.active)) await page.screenshot({ path: `docs/screenshots/v1.1-c/empty-${info.project.name}.png`, fullPage: true });
});

test("C real dashboard publication, facts, calculators, reminders and rule changes", async ({ page }, info) => {
  test.setTimeout(120000); test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  page.setDefaultTimeout(15000);
  await login(page);
  const profile = await (await page.request.get("/api/personal/summary")).json();
  const client = postgres(requireTestDatabaseUrl(), { max: 2, onnotice: () => {} });
  const db = drizzle(client, { schema: s }); const key = randomUUID();
  let promotionId = "";
  try {
    const [program] = await db.insert(s.programs).values({ code: `e2ec-${key}`, name: `旅行权益验收 ${info.project.name}`, kind: "hotel", pointsName: "测试积分" }).returning();
    const [rule] = await db.insert(s.rules).values({ programId: program.id, code: "acceptance", name: "隔离条件" }).returning();
    const [version] = await db.insert(s.ruleVersions).values({ ruleId: rule.id, programId: program.id, version: 1, terms: ["仅用于隔离自动化验收"], structuredContent: { opportunity: { complete: true, membershipTiers: ["白金"], enrollmentRequired: true, minSpendMinor: "10000", minNights: 1 } }, validFrom: day(-30), timeZone: "Asia/Hong_Kong", publicationStatus: "published", verificationStatus: "official_verified" }).returning();
    const [p] = await db.insert(s.promotions).values({ programId: program.id, ruleVersionId: version.id, slug: `e2ec-${key}`, title: `周末住宿权益 · ${info.project.name}`, summary: "隔离测试数据，不代表真实优惠", category: "隔离验收", publicationStatus: "pending_review", verificationStatus: "official_verified", lifecycleStatus: "active", startsAt: day(-10), endsAt: day(20), enrollmentEndsAt: day(2), stayEndsAt: day(10), rewardAmount: 1000n, rewardUnit: "积分", timeZone: "Asia/Hong_Kong" }).returning(); promotionId = p.id;
    const [source] = await db.insert(s.evidence).values({ ruleVersionId: version.id, sourceLabel: "验收官方来源引用（仅测试）", sourceUrl: "https://example.com/isolated-test", sourceKind: "official", verificationStatus: "official_verified", capturedAt: day(-1), verifiedAt: new Date(), excerpt: "隔离数据库内容" }).returning();
    await db.insert(s.promotionEvidence).values({ promotionId: p.id, evidenceId: source.id });
    await db.insert(s.promotionVersions).values({ promotionId: p.id, version: 1, snapshot: {}, actor: "e2e", revisionReason: "隔离验收" });
    await mutate(page, "/api/personal/membership", { programCode: program.code, membershipTier: "白金" });
    expect((await engine(page)).opportunities.some((o: { id: string }) => o.id === p.id)).toBe(false);
    await page.goto(`/admin/promotions/${p.id}`); await page.getByRole("button", { name: "审核并发布", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/me"); let card = page.getByTestId("opportunity").filter({ hasText: p.title }); await expect(card).toContainText("信息不足"); await expect(card).toContainText("收益待计算");
    await card.getByText("补充或重新确认个人条件", { exact: true }).click();
    await card.getByRole("combobox", { name: "报名状态", exact: true }).selectOption("true"); await card.getByLabel("合资格消费（元）").fill("100"); await card.getByLabel("已确认入住晚数").fill("1"); await card.getByLabel(/入住日期与时间/).fill(formatLocalInput(day(3), "Asia/Hong_Kong"));
    await card.getByRole("button", { name: "保存并重新核对", exact: true }).click(); await expect(card).toContainText("符合已知条件");
    await page.getByRole("combobox", { name: "资格筛选", exact: true }).selectOption("fails-known-conditions"); await expect(card).toHaveCount(0); await page.getByRole("combobox", { name: "资格筛选", exact: true }).selectOption("");
    await page.getByRole("combobox", { name: "会员计划", exact: true }).selectOption(program.id); await expect(page.getByTestId("opportunity")).toHaveCount(1); await page.getByRole("combobox", { name: "截止时间", exact: true }).selectOption("14"); await page.getByRole("combobox", { name: "机会排序", exact: true }).selectOption("deadline");
    await mutate(page, "/api/personal/scenarios", { name: `周末返还估算 ${key}`, calculatorType: "activity-reward", quoteSource: "本人保存的测试报价", quotedAt: new Date().toISOString(), pointValueMicros: "20000", ruleVersionIds: [version.id], assumptions: ["人工积分估值，不代表现金"], unresolved: ["奖励尚未到账，以下为预期价值，不是现金收益"], inputSnapshot: { promotionRef: p.slug, threshold: "100", qualifying: "100", planned: "100", extra: "0", rewardPoints: "1000", pointValue: "0.02", extraCost: "1", foregone: "0", fee: "0", used: "0", limit: "", claimStatus: "required-not-claimed", rewardStatus: "pending" }, result: { netIncrementalValueMicros: "99999999999" } });
    await mutate(page, "/api/personal/points", { op: "credit", programCode: program.code, source: `周末积分 ${key}`, points: "500", expiryStatus: "known", expiresAt: day(5).toISOString(), idempotencyKey: key });
    const taskTitle = `核对预订 ${key}`;
    await mutate(page, "/api/personal/tasks", { title: taskTitle, deadlineSource: "manual", deadlineAt: day(-1).toISOString() });
    await page.reload(); card = page.getByTestId("opportunity").filter({ hasText: p.title }); await expect(card).toContainText("预计返还 ¥19");
    await page.getByRole("combobox", { name: "价值筛选", exact: true }).selectOption("calculated"); await expect(card).toHaveCount(1); await page.getByRole("combobox", { name: "机会排序", exact: true }).selectOption("value");
    let reminder = page.getByTestId("reminder").filter({ hasText: taskTitle }); await reminder.getByRole("button", { name: "已读", exact: true }).click(); await expect(reminder.getByRole("button", { name: "已读", exact: true })).toBeDisabled();
    await reminder.getByRole("button", { name: "稍后一天", exact: true }).click(); await expect(reminder).toHaveCount(0);
    await page.getByRole("button", { name: "已处理与稍后", exact: true }).click(); reminder = page.getByTestId("reminder").filter({ hasText: taskTitle }); await expect(reminder).toContainText("稍后处理");
    await reminder.getByRole("button", { name: "忽略", exact: true }).click(); await expect(reminder).toContainText("已忽略");
    await reminder.getByRole("button", { name: "完成", exact: true }).click(); await expect(reminder).toContainText("已完成");
    await page.getByRole("button", { name: "待处理提醒", exact: true }).click();
    const before = await engine(page); const after = await engine(page); expect(after.reminders.map((r: { id: string }) => r.id).sort()).toEqual(before.reminders.map((r: { id: string }) => r.id).sort());
    const denied = await page.request.post("/api/personal/opportunities", { headers: { Origin: "https://attacker.invalid", "Sec-Fetch-Site": "cross-site" }, data: { promotionId: p.id, fingerprint: before.opportunities.find((o: { id: string }) => o.id === p.id).fingerprint, facts: {} } }); expect(denied.status()).toBe(403);
    await mkdir("docs/screenshots/v1.1-c", { recursive: true });
    const widths = info.project.name === "mobile" ? [375, 390] : [1280];
    for (const width of widths) { await page.setViewportSize({ width, height: 900 }); await page.evaluate(() => window.scrollTo(0, 0)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await page.screenshot({ path: `docs/screenshots/v1.1-c/dashboard-${width}.png`, fullPage: true }); }
    await db.update(s.ruleVersions).set({ terms: ["更新后的正式规则条款"] }).where(eq(s.ruleVersions.id, version.id));
    await page.reload(); card = page.getByTestId("opportunity").filter({ hasText: p.title }); await expect(card).toContainText("信息不足"); await expect(card).toContainText("收益待计算"); await expect(page.getByTestId("reminder").filter({ hasText: `规则变化，重新确认资格：${p.title}` })).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/v1.1-c/rule-change-${info.project.name}.png`, fullPage: true });
    const summary = await (await page.request.get("/api/personal/summary")).json(); expect(summary.owner.id).toBe(profile.owner.id); expect(summary.tasks.find((t: { title: string }) => t.title === taskTitle).status).toBe("completed");
  } finally { if (promotionId) await db.update(s.promotions).set({ publicationStatus: "withdrawn" }).where(eq(s.promotions.id, promotionId)); await client.end(); }
});
