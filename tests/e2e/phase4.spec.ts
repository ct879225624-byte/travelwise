import { expect, test } from "@playwright/test";

test("房价计算器显示 DEC-01 结果并可修改积分估值", async ({ page }) => {
  await page.goto("/calculate/rates");
  await expect(page.getByRole("heading", { name: "普通房价 vs 多倍积分房价" })).toBeVisible();
  await expect(page.getByText("¥-3").first()).toBeVisible();
  await expect(page.getByText("¥0.0212766/分")).toBeVisible();
  await page.getByLabel("我的积分估值（元/分）").fill("0");
  await expect(page.getByText("¥-50").first()).toBeVisible();
});

test("优惠叠加未知时被阻止，明确勾选后才显示假设模拟", async ({ page }) => {
  await page.goto("/calculate/offers");
  await expect(page.getByText("组合被阻止")).toBeVisible();
  await page.getByLabel("允许假设模拟（非已核实可用优惠）").check();
  await expect(page.getByText("假设模拟，非已核实可用优惠", { exact: true })).toBeVisible();
});

test("活动回报区分额外消费和预计奖励", async ({ page }) => {
  await page.goto("/calculate/rewards");
  await page.getByLabel("原本计划消费（元）").fill("0");
  await page.getByLabel("为了达标额外消费（元）").fill("3000");
  await page.getByLabel("新增经济成本（元）").fill("3000");
  await expect(page.getByText("¥-2840").first()).toBeVisible();
  await expect(page.getByText(/额外消费被单独计入增量成本/)).toBeVisible();
});

for (const width of [375, 390]) {
  test(`Phase 4 计算器在 ${width}px 无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/calculate/rates", "/calculate/offers", "/calculate/rewards"]) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
    }
  });
}
