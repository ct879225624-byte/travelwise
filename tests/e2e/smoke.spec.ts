import { expect, test } from "@playwright/test";

test("公开浏览流程可从首页进入活动详情", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/TravelWise/);
  await expect(page.getByTestId("promotion-card").first()).toBeVisible();
  await page.getByRole("link", { name: "浏览当前情报" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("heading", { name: "发现值得核对的优惠" })).toBeVisible();
  const detailLink = page.getByTestId("promotion-card").first().getByRole("link", { name: /查看规则与证据/ });
  const href = await detailLink.getAttribute("href");
  await detailLink.click();
  await expect(page).toHaveURL(new RegExp(`${href?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(page.getByTestId("promotion-detail")).toBeVisible();
});

test("四个导航入口可用", async ({ page }) => {
  await page.goto("/");
  for (const [label, path] of [["发现", "/discover"], ["攻略", "/guides"], ["计算", "/calculate"], ["我的", "/me"]] as const) {
    await page.getByRole("link", { name: label }).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});
