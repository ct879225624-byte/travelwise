import { expect, test } from "@playwright/test";

test("V1.1 管理入口未登录不可访问", async ({ page }) => {
  await page.goto("/admin/radar");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/smart-entry");
  await expect(page).toHaveURL(/\/admin\/login/);
});
