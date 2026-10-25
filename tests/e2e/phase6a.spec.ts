import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("邮箱").fill("admin@test.travelwise.local");
  await page.getByLabel("密码").fill("TravelWiseTest!2026");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function source(page: Page, marker: string, ruleLabel: string, promotion?: string) {
  await page.goto("/admin/evidence");
  await page.getByLabel("来源机构/发布者").fill(`验收测试 · 浦发银行来源 ${marker}`);
  await page.getByLabel("来源网址").fill("https://www.spdbccc.com.cn/zh/wap/miniSite/1435/tk.html");
  await page.getByLabel("证据摘要").fill("验收测试夹具；采用官方来源链接演练维护，不构成新增正式优惠。规则与叠加仍需核实。");
  await page.getByRole("combobox", { name: "核实状态", exact: true }).selectOption("unverified");
  await page.getByRole("combobox", { name: "关联规则版本", exact: true }).selectOption({ label: ruleLabel });
  if (promotion) await page.getByLabel("关联活动", { exact: true }).selectOption({ label: promotion });
  await page.getByRole("button", { name: "保存证据", exact: true }).click();
  await expect(page.getByText(`验收测试 · 浦发银行来源 ${marker}`, { exact: true })).toBeVisible();
}

test("PHASE6A FLOW-A Owner 通过真实表单维护来源、规则、草稿、审核、历史与归档", async ({ page, request }) => {
  test.setTimeout(120000);
  test.skip(!process.env.TEST_DATABASE_URL, "需要隔离 PostgreSQL 验收库");
  const marker = randomUUID(); const name = `验收测试活动 ${marker}`; const ruleName = `验收测试规则 ${marker}`; const slug = `phase6a-${marker}`;
  await login(page);
  await page.goto("/admin/rules/new");
  await page.getByLabel("规则代码").fill(`phase6a-rule-${marker}`);
  await page.getByLabel("规则名称").fill(ruleName);
  await page.getByLabel("条款").fill("验收测试 V1：每15间夜奖励10000积分，具体资格以来源为准。");
  await page.getByLabel("适用条件").fill("验收测试，不是正式优惠；本人符合持卡资格。");
  await page.getByLabel("生效时间").fill("2026-01-01T00:00");
  await page.getByLabel("失效时间").fill("2026-12-31T23:59");
  await page.getByRole("combobox", { name: "核实状态", exact: true }).selectOption("unverified");
  await page.getByRole("button", { name: "保存新版本" }).click();
  await expect(page).toHaveURL(/\/admin\/rules\?created=1/);
  let row = page.locator("div.rounded-2xl").filter({ hasText: ruleName }).first();
  await row.getByRole("button", { name: "发布规则 V1" }).click();
  await expect(row.getByRole("alert")).toContainText("必须关联来源证据");
  const revisionHref = await row.getByRole("link", { name: "修订", exact: true }).getAttribute("href");
  await page.goto("/admin/promotions/new");
  await page.getByLabel("主要规则版本").selectOption({ label: `${ruleName} · V1 · draft` });
  await page.getByLabel("Slug", { exact: true }).fill(slug);
  await page.getByLabel("标题", { exact: true }).fill(name);
  await page.getByLabel("活动类型/分类").fill("验收测试");
  await page.getByLabel("摘要", { exact: true }).fill("验收测试专用；用于隔离环境演练，未核实业务条件。");
  await page.getByLabel("参与资格").fill("仅隔离验收夹具");
  await page.getByLabel("消费/活动开始").fill("2026-01-01T00:00");
  await page.getByLabel("消费/活动截止").fill("2026-12-31T23:59");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/promotions\/[a-f0-9-]+$/);
  const editPath = new URL(page.url()).pathname;
  expect(await (await request.get(`/discover/${slug}`)).text()).not.toContain(name);
  await page.getByRole("button", { name: "审核并发布" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("必须关联来源证据");
  await source(page, marker, `${ruleName} · V1`, name);
  let sourceRow = page.locator("div.rounded-2xl").filter({ hasText: `验收测试 · 浦发银行来源 ${marker}` }).first();
  const captured = await sourceRow.locator("p").filter({ hasText: "采集：" }).innerText();
  await sourceRow.getByText("复核来源", { exact: true }).click();
  await sourceRow.getByRole("combobox", { name: "复核状态", exact: true }).selectOption("reverify");
  await sourceRow.getByRole("button", { name: "保存复核", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/evidence$/);
  sourceRow = page.locator("div.rounded-2xl").filter({ hasText: `验收测试 · 浦发银行来源 ${marker}` }).first();
  await expect(sourceRow).toContainText("reverify");
  await expect(sourceRow.locator("p").filter({ hasText: "采集：" })).toHaveText(captured);
  await page.goto("/admin/rules");
  row = page.locator("div.rounded-2xl").filter({ hasText: ruleName }).first();
  await row.getByRole("button", { name: "发布规则 V1" }).click();
  // A same-URL redirect is already satisfied before the action commits. Wait
  // for the server-rendered publication state before leaving the page.
  await expect(row.locator("p").last()).toContainText(" · published");
  await expect(row.getByRole("button", { name: "发布规则 V1" })).toHaveCount(0);
  await page.goto(editPath);
  await expect(page.getByLabel("消费/活动开始")).toHaveValue("2026-01-01T00:00");
  await page.getByRole("button", { name: "提交审核", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(editPath);
  await page.getByRole("button", { name: "审核并发布" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/");
  await expect(page.getByTestId("promotion-card").filter({ hasText: name }).getByRole("link", { name: "查看规则与证据" })).toBeVisible();
  await page.goto(`/discover?q=${encodeURIComponent(name)}&verification=unverified&lifecycle=active`);
  await expect(page.getByTestId("promotion-card").filter({ hasText: name }).getByRole("link", { name: "查看规则与证据" })).toBeVisible();
  await page.getByTestId("promotion-card").filter({ hasText: name }).getByRole("link", { name: "查看规则与证据" }).click();
  await expect(page.getByTestId("promotion-detail")).toContainText("待核实");
  await expect(page.getByTestId("promotion-detail")).toContainText("验收测试 V1");
  await page.goto(revisionHref!);
  await expect(page.getByLabel("条款")).toHaveValue(/验收测试 V1/);
  await expect(page.getByLabel("生效时间")).toHaveValue("2026-01-01T00:00");
  await page.getByLabel("条款").fill("验收测试 V2：更正领取期限；叠加关系未知。");
  await page.getByRole("button", { name: "保存新版本" }).click();
  await expect(page).toHaveURL(/created=2/);
  await source(page, `${marker}-v2`, `${ruleName} · V2`);
  await page.goto("/admin/rules");
  const revisedRule = page.locator("div.rounded-2xl").filter({ hasText: ruleName }).filter({ hasText: "版本 2" });
  await revisedRule.getByRole("button", { name: "发布规则 V2" }).click();
  await expect(revisedRule.locator("p").last()).toContainText(" · published");
  await expect(revisedRule.getByRole("button", { name: "发布规则 V2" })).toHaveCount(0);
  await page.goto(editPath);
  await page.getByLabel("主要规则版本").selectOption({ label: `${ruleName} · V2 · published` });
  await page.getByLabel("修订原因").fill("验收测试：关联修订后的规则，保留旧版本");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("V2", { exact: true })).toBeVisible();
  await expect(page.getByText("V1", { exact: true })).toBeVisible();
  await page.goto(`/discover/${slug}`);
  await expect(page.getByTestId("promotion-detail")).toContainText("验收测试 V2");
  await page.goto("/admin");
  await page.locator("div.rounded-2xl").filter({ hasText: name }).getByRole("button", { name: "归档", exact: true }).click();
  await expect(page.locator("div.rounded-2xl").filter({ hasText: name })).toContainText("已归档");
  expect(await (await request.get(`/discover/${slug}`)).text()).not.toContain(name);
  await page.goto("/admin/audit");
  await expect(page.locator("body")).toContainText("rule.version.published");
  await expect(page.locator("body")).toContainText("promotion.archived");
  await expect(page.locator("body")).toContainText("evidence.review");
});

test("PHASE6A Owner 无代码新增、编辑、发布攻略并收到重复错误反馈", async ({ page }) => {
  test.setTimeout(120000);
  test.skip(!process.env.TEST_DATABASE_URL, "需要隔离 PostgreSQL 验收库");
  await login(page); const marker = randomUUID(); const title = `验收测试攻略 ${marker}`; const slug = `phase6a-guide-${marker}`;
  await page.goto("/admin/guides/new");
  await page.getByLabel("Slug", { exact: true }).fill(slug);
  await page.getByLabel("标题", { exact: true }).fill(title);
  await page.getByLabel("摘要", { exact: true }).fill("验收测试；仅用于隔离环境。");
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("验收测试攻略原始正文；规则待核实。");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/guides\/[a-f0-9-]+$/);
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("验收测试攻略修订正文；使用官方来源前需人工复核。");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue(/修订正文/);
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/guides/${slug}`);
  await expect(page.locator("body")).toContainText("修订正文");
  await expect(page.locator("body")).toContainText("待核实");
  await page.goto("/admin/guides/new");
  await page.getByLabel("Slug", { exact: true }).fill(slug);
  await page.getByLabel("标题", { exact: true }).fill(title);
  await page.getByLabel("摘要", { exact: true }).fill("重复验收");
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("重复验收");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("已存在");
  await expect(page.getByLabel("标题", { exact: true })).toHaveValue(title);
});

test("PHASE6A 真实登录 Cookie、安全响应头及退出后的私人接口失效", async ({ page, context }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "需要隔离 PostgreSQL 验收库");
  await login(page);
  const cookie = (await context.cookies()).find((item) => item.name.endsWith("authjs.session-token"));
  expect(cookie).toBeDefined(); expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe("Lax");
  // This is isolated HTTP; production Secure/HSTS needs the actual HTTPS proxy.
  expect(cookie?.secure).toBe(false);
  const response = await page.request.get("/api/personal/summary");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  expect((await page.request.get("/api/personal/summary")).status()).toBe(401);
  expect((await context.cookies()).some((item) => item.name.endsWith("authjs.session-token"))).toBe(false);
});

for (const width of [375, 390, 768, 1280, 1440]) {
  test(`PHASE6A 全站 ${width}px 真实 Chromium 截图、布局与标签验收`, async ({ page }, testInfo) => {
    test.skip(!process.env.TEST_DATABASE_URL, "需要隔离 PostgreSQL 验收库");
    test.skip(testInfo.project.name !== "desktop", "同一真实 Chromium 的五档宽度仅运行一次，避免截图覆盖");
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 960 }); await login(page);
    await mkdir("docs/screenshots/phase6a", { recursive: true });
    const pages = [
      ["home", "/"], ["discover", "/discover"], ["promotion", "/discover/spdb-jinjiang-2026-stay-reward"],
      ["guides", "/guides"], ["guide", "/guides/jinjiang-points-earning-basics"],
      ["rates", "/calculate/rates"], ["offers", "/calculate/offers"], ["rewards", "/calculate/rewards"],
      ["personal", "/me/records"], ["decision-home", "/me"], ["admin", "/admin"], ["admin-promotion", "/admin/promotions/new"],
      ["admin-evidence", "/admin/evidence"], ["admin-rules", "/admin/rules"], ["admin-guide", "/admin/guides/new"],
      ["empty", "/discover?q=phase6a-no-such-content"], ["not-found", "/phase6a-no-such-page"],
    ];
    for (const [name, path] of pages) {
      await page.goto(path); await expect(page.locator("main h1, main h2").first()).toBeVisible();
      const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(dimensions.page, `${name} overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
      const unlabeled = await page.locator('input:not([type="hidden"]):not([type="submit"]),textarea,select').evaluateAll((controls) => controls.filter((control) => !(control as HTMLInputElement).labels?.length && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby")).map((control) => control.getAttribute("name")));
      expect(unlabeled, `${name} controls need accessible labels`).toEqual([]);
      await page.screenshot({ path: name === "decision-home" ? testInfo.outputPath(`${width}-decision-home.png`) : `docs/screenshots/phase6a/${width}-${name}.png`, fullPage: true, caret: "initial" });
      if (name === "personal") for (const id of ["points", "activities", "tasks", "decisions", "earnings"]) await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await page.goto("/discover");
    await page.getByLabel("关键词", { exact: true }).fill("浦发");
    await page.getByRole("button", { name: "应用筛选" }).click();
    await expect(page).toHaveURL(/q=/);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  });
}
