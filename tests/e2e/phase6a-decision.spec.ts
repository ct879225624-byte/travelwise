import { expect, test } from "@playwright/test";

test("FLOW-B 关联间夜活动不把示例金额当作已经符合活动资格", async ({ page }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "需要真实 PostgreSQL 官方来源夹具");
  await page.goto("/calculate/rewards?promotion=spdb-jinjiang-2026-stay-reward&reward=10000");
  await expect(page.getByText(/当前规则具有官方核实依据/)).toBeVisible();
  await expect(page.getByLabel("资格信息状态")).toHaveValue("information-insufficient");
  await expect(page.getByText(/门槛输入仅支持金额/)).toBeVisible();
  await expect(page.getByText(/预计奖励：0 分/)).toBeVisible();
  await page.getByLabel("资格信息状态").selectOption("meets-known-conditions");
  await expect(page.getByText(/预计奖励：10000 分/)).toBeVisible();
});

test("FLOW-D 无效活动依据不能因手动选择资格而生成确认式奖励", async ({ page }) => {
  await page.goto("/calculate/rewards?promotion=phase6a-no-such-promotion&reward=10000");
  await expect(page.getByText(/活动当前未公开/)).toBeVisible();
  await page.getByLabel("资格信息状态").selectOption("meets-known-conditions");
  await expect(page.getByText(/预计奖励：0 分/)).toBeVisible();
  await expect(page.getByText(/资格信息未达到可确定计算条件/)).toBeVisible();
});
