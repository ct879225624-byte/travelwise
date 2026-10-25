import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const dbOnly = () => { test.skip(!process.env.TEST_DATABASE_URL, "SKIP: 个人持久化验收需要 PostgreSQL E2E 配置"); };
const unique = (prefix: string) => `${prefix}-${randomUUID()}`;
async function login(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("邮箱").fill("admin@test.travelwise.local");
  await page.getByLabel("密码").fill("TravelWiseTest!2026");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/me/records");
  await expect(page.getByRole("heading", { name: "我的权益工作台" })).toBeVisible();
}
async function mutate(page: Page, url: string, body: Record<string, unknown>, method = "POST") {
  return page.evaluate(async ({ url, body, method }) => {
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { url, body, method });
}
async function summary(page: Page) { const response = await page.request.get("/api/personal/summary"); expect(response.status()).toBe(200); return response.json(); }

test("PERSONAL-14 未登录和无效会话不能读取或写入私人数据", async ({ page, request, browser }) => {
  dbOnly();
  const paths = ["/api/personal/summary", "/api/personal/points", "/api/personal/scenarios", "/api/personal/actions", "/api/personal/tasks"];
  for (const path of paths) { const response = await request.get(path); expect(response.status()).toBe(401); expect(await response.text()).not.toContain("availablePoints"); }
  for (const path of ["/api/personal/membership", "/api/personal/points", "/api/personal/scenarios", "/api/personal/actions", "/api/personal/tasks", "/api/personal/rewards/credit", "/api/personal/rewards/realize", "/api/personal/qualification"]) expect((await request.post(path, { data: {} })).status()).toBe(401);
  await page.goto("/me/records"); await expect(page).toHaveURL(/\/admin\/login/);
  const invalid = await browser.newContext();
  try {
    await invalid.addCookies([{ name: "authjs.session-token", value: "invalid-session", domain: "127.0.0.1", path: "/" }]);
    expect((await invalid.request.get("http://127.0.0.1:3100/api/personal/summary")).status()).toBe(401);
  } finally { await invalid.close(); }
});

test("PERSONAL-01/03/04 Owner 持久化会员、批次及幂等兑换", async ({ page, browser }) => {
  dbOnly(); await login(page);
  // Both browser projects use the single V1 Owner. Keep the editable membership
  // value equal so their independent ledger assertions cannot race this field.
  const marker = "Phase 5 E2E 会员持久化记录";
  await page.getByText("会员资料与持有权益", { exact: true }).click();
  await page.getByLabel("会员等级（可以未知）").selectOption("白金");
  await page.getByRole("textbox", { name: "会员备注", exact: true }).fill(marker);
  await page.getByRole("button", { name: "保存会员资料", exact: true }).click();
  await expect.poll(async () => (await summary(page)).wallets.find((row: { program: { code: string } }) => row.program.code === "jinjiang-rewards")?.wallet.notes).toBe(marker);
  const creditKey = unique("e2e-credit");
  const creditBody = { op: "credit", programCode: "jinjiang-rewards", source: marker, sourceType: "initial_balance", points: "120", expiryStatus: "unknown", expiresAt: null, idempotencyKey: creditKey };
  expect((await mutate(page, "/api/personal/points", creditBody)).status).toBe(201);
  expect((await mutate(page, "/api/personal/points", creditBody)).status).toBe(201);
  expect((await mutate(page, "/api/personal/points", { ...creditBody, points: "121" })).status).toBe(400);
  const debitKey = unique("e2e-debit");
  const debit = { op: "consume", programCode: "jinjiang-rewards", points: "50", idempotencyKey: debitKey, note: marker };
  expect((await mutate(page, "/api/personal/points", debit)).status).toBe(200);
  expect((await mutate(page, "/api/personal/points", debit)).status).toBe(200);
  expect((await mutate(page, "/api/personal/points", { ...debit, points: "51" })).status).toBe(400);
  const read = await summary(page);
  expect(read.batches.filter((row: { idempotencyKey: string }) => row.idempotencyKey === creditKey)).toHaveLength(1);
  const debits = read.transactions.filter((row: { idempotencyKey: string }) => row.idempotencyKey === debitKey);
  expect(debits).toHaveLength(1); expect(debits[0].points).toBe("-50");
  expect(debits[0].allocations.reduce((sum: bigint, row: { delta: string }) => sum + BigInt(row.delta), 0n)).toBe(-50n);
  expect(read.reconciliation.balanced).toBe(true);
  const relogin = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try { const newPage = await relogin.newPage(); await login(newPage); await expect(newPage.locator("#points")).toContainText(marker); }
  finally { await relogin.close(); }
});

test("PERSONAL-09 活动收藏和经用户确认的待办独立于公共活动", async ({ page }) => {
  dbOnly(); await login(page);
  const cycle = unique("e2e-cycle");
  await page.goto("/discover/spdb-jinjiang-2026-stay-reward");
  const publicSections = await page.getByTestId("promotion-detail").locator(":scope > section").allTextContents();
  await page.getByLabel("参与周期", { exact: true }).fill(cycle);
  await page.getByRole("button", { name: "收藏活动", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已收藏活动");
  let read = await summary(page);
  const action = read.actions.find((row: { action: { cycleKey: string } }) => row.action.cycleKey === cycle)?.action;
  expect(action?.status).toBe("saved");
  expect(read.tasks.filter((row: { actionId: string }) => row.actionId === action.id)).toHaveLength(0);
  await page.getByText("核对活动待办草稿", { exact: true }).click();
  const selected = page.locator('input[type="checkbox"][name^="select-"]').first();
  await selected.check();
  const draft = selected.locator("xpath=../..");
  await draft.getByRole("combobox").selectOption("unconfirmed");
  await page.getByLabel("我已核对所选任务的必要性、时间和来源，确认创建站内待办。").check();
  await page.getByRole("button", { name: "确认创建选中的待办", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("选中的待办已创建");
  await page.getByRole("button", { name: "确认创建选中的待办", exact: true }).click();
  read = await summary(page);
  const tasks = read.tasks.filter((row: { actionId: string }) => row.actionId === action.id);
  expect(tasks).toHaveLength(1); expect(tasks[0].deadlineSource).toBe("unconfirmed"); expect(tasks[0].deadlineAt).toBeNull();
  // Only public activity data sits in this component. Owner progress is fetched
  // separately and must not alter the public description or structured metadata.
  expect(await page.getByTestId("promotion-detail").locator(":scope > section").allTextContents()).toEqual(publicSections);
  expect(await page.locator("head").innerHTML()).not.toContain(cycle);
  await page.goto("/me/records#activities"); await expect(page.locator("#activities")).toContainText(cycle);
});

test("PERSONAL-05/06/12/17 奖励到账与实际兑换不会重复统计", async ({ page }) => {
  dbOnly(); await login(page);
  await page.goto("/discover/spdb-jinjiang-2026-stay-reward");
  const cycle = unique("reward-cycle"); await page.getByLabel("参与周期", { exact: true }).fill(cycle);
  await page.getByRole("button", { name: "加入我的计划", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已加入我的计划");
  let read = await summary(page);
  const action = read.actions.find((row: { action: { cycleKey: string } }) => row.action.cycleKey === cycle).action;
  expect(action.rewardCreditedAt).toBeNull();
  expect(read.rewards.filter((row: { actionId: string }) => row.actionId === action.id)).toHaveLength(0);
  const key = unique("reward-credit");
  const receipt = { actionId: action.id, actualPoints: "8000", expiryStatus: "unknown", expiresAt: null, idempotencyKey: key };
  expect((await mutate(page, "/api/personal/rewards/credit", receipt)).status).toBe(200);
  expect((await mutate(page, "/api/personal/rewards/credit", receipt)).status).toBe(200);
  expect((await mutate(page, "/api/personal/rewards/credit", { ...receipt, actualPoints: "8001" })).status).toBe(400);
  const realizationKey = unique("reward-realized");
  const realization = { programCode: "jinjiang-rewards", actionId: action.id, points: "8000", cashMinor: "16000", pointValueMicros: "20000", costMinor: "1000", foregoneValueMinor: "500", source: cycle, note: "现金可比价200元，积分加现金40元，差额160元", idempotencyKey: realizationKey };
  expect((await mutate(page, "/api/personal/rewards/realize", realization)).status).toBe(201);
  expect((await mutate(page, "/api/personal/rewards/realize", realization)).status).toBe(201);
  read = await summary(page);
  expect(read.rewards.filter((row: { actionId: string; kind: string }) => row.actionId === action.id && row.kind === "acquired")).toHaveLength(1);
  const realized = read.rewards.filter((row: { idempotencyKey: string }) => row.idempotencyKey === realizationKey);
  expect(realized).toHaveLength(1); expect(realized[0].cashMinor).toBe("16000"); expect(realized[0].transactionId).toBeTruthy();
  const allRealized = read.rewards.filter((row: { kind: string }) => row.kind === "realized");
  expect(BigInt(read.summary.realizedCashMinor)).toBe(allRealized.reduce((sum: bigint, row: { cashMinor: string | null }) => sum + BigInt(row.cashMinor ?? "0"), 0n));
  expect(read.reconciliation.balanced).toBe(true);
});

for (const calculator of [
  { path: "rates", type: "rate-comparison", label: "酒店", key: "hotel", original: "历史酒店报价", revised: "重新核对酒店" },
  { path: "offers", type: "offer-comparison", label: "报价来源", key: "source", original: "历史活动渠道报价", revised: "重新核对渠道报价" },
  { path: "rewards", type: "activity-reward", label: "报价/规则来源", key: "source", original: "历史人工活动依据", revised: "重新核对活动依据" },
]) {
  test(`PERSONAL-10/11 ${calculator.type} 从计算器保存并恢复原始输入重算`, async ({ page }) => {
    dbOnly(); await login(page);
    const name = unique(calculator.path); const newName = `${name}-recalculated`;
    await page.goto(`/calculate/${calculator.path}${calculator.path === "rewards" ? "?promotion=spdb-jinjiang-2026-stay-reward" : ""}`);
    await page.getByLabel(calculator.label, { exact: true }).fill(calculator.original);
    await page.getByLabel("查询时间", { exact: true }).first().fill("2026-10-19T12:34");
    page.once("dialog", (dialog) => dialog.accept(name));
    await page.getByRole("button", { name: "保存当前方案", exact: true }).click();
    await expect(page.getByRole("button", { name: "方案已保存", exact: true })).toBeDisabled();
    const before = (await summary(page)).scenarios.find((row: { name: string }) => row.name === name);
    expect(before.calculatorType).toBe(calculator.type); expect(before.inputSnapshot[calculator.key]).toBe(calculator.original);
    expect(before.pointValueMicros).toBe("20000"); expect(before.ruleSnapshots.length).toBeGreaterThan(0);
    if (calculator.path === "rewards") {
      expect(before.ruleVersionIds).toHaveLength(1);
      const basis = before.ruleSnapshots.find((item: { kind: string }) => item.kind === "public-activity-basis");
      expect(basis.ruleVersion.id).toBe(before.ruleVersionIds[0]);
      expect(basis.evidence.length).toBeGreaterThan(0);
    }
    expect(before.quotedAt).not.toBeNull(); expect(before.result.calculatedAt).toBeTruthy();
    await page.goto("/me/records#decisions");
    const record = page.locator("#decisions details").filter({ has: page.locator("summary", { hasText: name }) }).first();
    await record.locator(":scope > summary").click();
    await record.getByText("原始输入与会员快照", { exact: true }).click();
    await expect(record).toContainText(calculator.original);
    await record.getByRole("button", { name: "根据原始输入重新计算", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/calculate/${calculator.path}\\?restore=1`));
    await expect(page.getByLabel(calculator.label, { exact: true })).toHaveValue(calculator.original);
    await page.getByLabel(calculator.label, { exact: true }).fill(calculator.revised);
    page.once("dialog", (dialog) => dialog.accept(newName));
    await page.getByRole("button", { name: "保存当前方案", exact: true }).click();
    await expect(page.getByRole("button", { name: "方案已保存", exact: true })).toBeDisabled();
    const after = (await summary(page)).scenarios;
    expect(after.find((row: { name: string }) => row.name === name)).toEqual(before);
    const revised = after.find((row: { name: string }) => row.name === newName);
    expect(revised.id).not.toBe(before.id); expect(revised.inputSnapshot[calculator.key]).toBe(calculator.revised);
  });
}

test("个人字段作为文本展示，跨来源写入被拒绝且私人信息不进入公开元数据", async ({ page, request }) => {
  dbOnly(); await login(page);
  const marker = unique("private-text"); const injected = `${marker}<img src=x onerror=window.phase5Injected=true>`;
  const result = await mutate(page, "/api/personal/scenarios", { name: injected.slice(0, 150), notes: injected, calculatorType: "activity-reward", inputSnapshot: { marker: injected }, result: { marker: injected }, ruleSnapshots: [], idempotencyKey: unique("inert-text") });
  expect(result.status).toBe(201);
  await page.goto("/me/records#decisions");
  await page.reload(); // A hash-only navigation does not refetch the server-rendered records.
  await expect(page.locator("#decisions")).toContainText(marker);
  expect(await page.evaluate(() => (window as typeof window & { phase5Injected?: boolean }).phase5Injected)).toBeUndefined();
  const forbidden = await page.request.post("/api/personal/membership", { headers: { Origin: "https://attacker.invalid", "Sec-Fetch-Site": "cross-site" }, data: { programCode: "jinjiang-rewards", membershipTier: "unauthorized-change" } });
  expect(forbidden.status()).toBe(403);
  const publicResponse = await request.get("/discover/spdb-jinjiang-2026-stay-reward");
  expect(await publicResponse.text()).not.toContain(marker);
  const privateResponse = await page.request.get("/api/personal/summary");
  expect(privateResponse.headers()["cache-control"]).toContain("no-store");
});

for (const width of [375, 390]) {
  test(`PERSONAL-15 ${width}px 积分、活动、待办、方案和收益均可操作`, async ({ page }, testInfo) => {
    dbOnly(); await login(page); await page.setViewportSize({ width, height: 900 });
    await page.goto("/me/records");
    for (const id of ["points", "activities", "tasks", "decisions", "earnings"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }
    await page.getByText("新增积分到账 / 期初余额", { exact: true }).click();
    await page.getByLabel("到账积分", { exact: true }).fill("1");
    await page.getByLabel("来源说明", { exact: true }).fill(unique(`mobile-${width}`));
    await page.getByRole("button", { name: "确认积分到账", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "已保存" }).first()).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
    if (testInfo.project.name === "desktop") { await page.evaluate(() => window.scrollTo(0, 0)); await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0); await page.screenshot({ path: `docs/screenshots/phase5-me-mobile-${width}.png`, fullPage: true }); }
  });
}

test("Phase 5 桌面收益和个人历史截图", async ({ page }, testInfo) => {
  dbOnly(); await login(page);
  await expect(page.locator("#earnings")).toContainText("考虑积分机会成本的综合经济价值");
  await expect(page.locator("#earnings")).toContainText("实际现金流与兑现记录");
  if (testInfo.project.name === "desktop") await page.screenshot({ path: "docs/screenshots/phase5-me-desktop.png", fullPage: true });
});
