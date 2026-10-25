import { expect, test } from "@playwright/test";

test("发现页会保留筛选 URL 并显示状态控件", async ({ page }) => {
  await page.goto("/discover?q=锦江&lifecycle=active&verification=official_verified&sort=updated");
  await expect(page.getByRole("heading", { name: "发现值得核对的优惠" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "关键词" })).toHaveValue("锦江");
  await expect(page.locator("select[name=lifecycle]")).toHaveValue("active");
  await expect(page.locator("select[name=verification]")).toHaveValue("official_verified");
  await expect(page.getByRole("link", { name: "清除条件" })).toBeVisible();
});

test("无搜索结果给出明确空状态且不泄露私有内容", async ({ page }) => {
  await page.goto("/discover?q=绝不应该存在的活动标题");
  await expect(page.getByText("没有匹配的公开活动")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("E2E 活动草稿");
});

test("主要公开表单具备可识别标签", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByRole("searchbox", { name: "搜索活动和攻略" })).toBeVisible();
  await expect(page.getByLabel("关键词")).toBeVisible();
  await expect(page.getByLabel("类别")).toBeVisible();
  await expect(page.getByLabel("活动生命周期")).toBeVisible();
  await page.goto("/guides");
  await expect(page.getByLabel("搜索攻略")).toBeVisible();
});

for (const width of [375, 390]) {
  test(`移动端 ${width}px 没有横向溢出且筛选可触控`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/discover");
    await expect(page.getByRole("button", { name: "应用筛选" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.getByRole("button", { name: "应用筛选" }).click();
    await expect(page).toHaveURL(/discover/);
  });
}
