import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "需要 PostgreSQL E2E 配置");
  await page.goto("/admin/login");
  await page.getByLabel("邮箱").fill("admin@test.travelwise.local");
  await page.getByLabel("密码").fill("TravelWiseTest!2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("优惠雷达后台页面可用并保留移动/桌面截图", async ({ page }, testInfo) => {
  await page.goto("/admin/radar");
  await expect(page.getByRole("heading", { name: "优惠雷达" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("v11-radar.png"), fullPage: true });
});

test("智能录入后台页面可用并保留移动/桌面截图", async ({ page }, testInfo) => {
  await page.goto("/admin/smart-entry");
  await expect(page.getByRole("heading", { name: "智能录入" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("v11-smart-entry.png"), fullPage: true });
});
