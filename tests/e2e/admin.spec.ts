import { expect, test } from "@playwright/test";

test("未登录管理写入被拒绝", async ({ request }) => {
  const response = await request.post("/api/admin/promotions", { data: { slug: "blocked-write", title: "Blocked", summary: "Blocked", category: "test" } });
  expect(response.status()).toBe(401);
});

test("管理员可创建草稿、关联证据并发布活动", async ({ page }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "需要 PostgreSQL E2E 配置");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("邮箱").fill("admin@test.travelwise.local");
  await page.getByLabel("密码").fill("TravelWiseTest!2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const slug = `e2e-promotion-${Date.now()}`;
  const created = await page.evaluate(async (payload) => { const response = await fetch("/api/admin/promotions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); return { status: response.status, body: await response.json() }; }, { slug, title: "E2E 活动草稿", summary: "仅用于验收流程", category: "测试", platform: "锦江荟", eligibility: ["测试资格"], steps: ["测试步骤"], notes: ["测试注意事项"], timeZone: "Asia/Shanghai", qualification: "unknown", stacking: "unknown", verificationStatus: "unverified", isDemo: false, revisionReason: "E2E" });
  expect(created.status).toBe(201);
  const { id } = created.body as { id: string };
  const draftPage = await page.request.get(`/discover/${slug}`);
  expect([200, 404]).toContain(draftPage.status());
  expect(await draftPage.text()).not.toContain("E2E 活动草稿");
  const evidence = await page.evaluate(async (payload) => { const response = await fetch("/api/admin/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); return { status: response.status, body: await response.json() }; }, { sourceLabel: "E2E 官方来源", sourceUrl: `https://example.com/e2e/${id}`, sourceKind: "official", verificationStatus: "official_verified", excerpt: "E2E 证据", promotionId: id });
  expect(evidence.status).toBe(201);
  await page.goto(`/admin/promotions/${id}`);
  const origin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "审核并发布" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`${origin}/discover/${slug}`);
  await expect(page.getByTestId("promotion-detail")).toContainText("E2E 活动草稿");
});
