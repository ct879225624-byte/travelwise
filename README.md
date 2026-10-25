# TravelWise

TravelWise 是面向个人使用的旅行优惠情报与决策平台，包含公开优惠与攻略、三类计算器、Owner 个人记录、来源雷达及 V1.1-C 机会和站内提醒。内容通过 PostgreSQL 人工审核发布；V1.1-B 真模型验收仍受阻。

这是从 b227dac2da726f7430368425ca8caa52e5ff4864 导出的独立脱敏仓库。当前交接请先读 [CLOUD_HANDOFF.md](./CLOUD_HANDOFF.md)、[本次验证报告](./CLOUD_BASELINE_REVIEW.md) 和 [来源差异说明](./SOURCE_SNAPSHOT_MAPPING.md)。下面保留各阶段运行说明；阶段报告中的历史验收不等于本次云端验收。

## 技术栈

- Next.js 16.4.3 / App Router / React 19.3.0
- TypeScript 6.0.3 strict mode
- Tailwind CSS 4.3.3，使用 shadcn/ui 的项目约定
- PostgreSQL 17.11（Windows EDB 安装器）+ Drizzle ORM 0.45.4 / drizzle-kit 0.31.11
- Zod 4.6.7、Vitest 5.0.3、Playwright 1.64.0
- Auth.js `next-auth@5.0.0-beta.32` Credentials Provider、bcryptjs 12 rounds

版本已写入 `package.json` 和 `package-lock.json`，安装环境要求 Node.js 24.x。

## Windows 开发启动

在 PowerShell 中：

```powershell
git clone <repository-url>
cd "travel wise"
npm ci
Copy-Item .env.example .env
notepad .env
npm run dev
```

浏览 `http://127.0.0.1:3000`。不配置数据库时，开发环境默认使用内置 DEMO 数据；页面上的 DEMO 标记和规则说明会明确提示数据边界。

## PostgreSQL 与迁移

Windows 开发默认使用 PostgreSQL 17 本地服务；不需要安装 Docker Desktop。Phase 1B 使用 WinGet 的官方 EDB 安装器（当前验证版本 17.11-5）：

```powershell
winget install --id PostgreSQL.PostgreSQL.17 --exact --accept-source-agreements --accept-package-agreements
```

安装时只启用数据库服务和命令行工具，监听 `127.0.0.1:5432`。如果本机已有 PostgreSQL，请复用对应服务，不要卸载或覆盖现有实例。项目也保留了 [compose.yaml](./compose.yaml) 作为没有本地服务时的可复现备用方案：

```powershell
Copy-Item .env.example .env
# 在 .env 填写本地服务创建的 travelwise_dev / travelwise_test 连接串
npm run db:migrate
npm run db:seed
$env:TRAVELWISE_DATA_SOURCE = "postgres"
npm run dev
```

使用 Compose 备用方案时，在填写 `.env` 的两个本地密码后执行：

```powershell
docker compose up -d db
docker compose --profile test up -d db-test
```

`db:generate` 只根据 schema 生成迁移，`db:check` 校验迁移历史，`db:migrate` 执行迁移。DEMO seed 仅接受本机非生产 PostgreSQL，并将开发夹具与审计记录放在同一个事务中。生产环境禁止 DEMO 数据源和 seed。

## 管理后台与管理员初始化

后台地址为 `/admin`，只有一个通过环境变量配置的管理员账户，没有公开注册。先生成密码哈希，再把结果写入被 Git 忽略的 `.env`：

```powershell
# PowerShell 7：隐藏输入，避免明文密码进入命令历史或进程参数
$adminPassword = Read-Host "管理员密码（至少12位，最多72 UTF-8字节）" -MaskInput
$adminPassword | npm run admin:hash -- --stdin
Remove-Variable adminPassword
```

配置 `AUTH_SECRET`、`ADMIN_EMAIL` 和 `ADMIN_PASSWORD_HASH` 后重启开发服务器。Auth.js 负责带 CSRF 保护的登录和加密 JWT 会话；每个页面、Server Action 和 API 写入口都会再次检查管理员邮箱。不要把明文密码、哈希或 `AUTH_SECRET` 写进 README、日志或 Git。

后台支持活动草稿、待审核、发布、撤回、归档，活动编辑会写入 `promotion_versions`；规则修订会生成新的 `rule_versions`；攻略编辑会写入 `guide_versions`；来源可单独登记并关联活动、规则或攻略。发布活动必须至少关联一条来源证据。

## 内容与来源

长期规则使用 `rules` + `rule_versions`，限时活动使用 `promotions`；两者通过 `promotion_rules`、`promotion_evidence` 等关联表连接。活动生命周期（未开始、进行中、已结束、已归档、状态待确认）、信息核实状态（官方已核实、社区经验、待核实、存在冲突、需重新核实）和编辑发布状态是三个独立字段。

首批 PostgreSQL Seed 内容包含 12 个攻略目录、一条官方核实的浦发锦江 WeHotel 联名卡 2026 住宿达标礼活动和一篇官方协议摘要攻略。来源链接和核实时间保存在 `evidence`；DEMO 内容保持明确标记。Seed 使用固定业务标识和 `onConflictDoNothing`，可以重复执行。

## 测试与检查

```powershell
npm run lint
npm run typecheck
npm test
npm run db:check
npm run test:e2e
npm run build
npm run db:migrate
npm run db:seed
```

首次运行页面冒烟测试时先安装 Chromium：`npm run test:install`。浏览器文件放在项目的 `.cache/ms-playwright`，已被 Git 忽略。

浏览器冒烟测试使用 DEMO 数据，不依赖数据库。数据库集成测试需要独立的测试库，名称必须以 `_test` 结尾；`.env` 中的 `TEST_DATABASE_URL` 应指向 `travelwise_test`：

```powershell
npm run test:db
```

`npm run test:e2e:db` 会先迁移并 Seed 独立的 `TEST_DATABASE_URL`，再启动连接该测试库的服务器；浏览器测试不向开发库写入。覆盖发布内容、草稿隔离、个人事务闭环、筛选 URL、空状态和 375/390px 视口。没有 PostgreSQL 时，静态检查、单元测试和 DEMO 浏览器测试仍可运行；迁移执行与数据库集成测试必须记录为环境阻碍，不得把跳过或失败说成通过。

## Phase 3 公开体验

- `/` 是正式首页：只展示已发布内容，支持数据稀疏空态，并明确当前仅支持锦江荟。
- `/discover` 使用服务端 PostgreSQL 查询，支持标题/摘要搜索、类别、平台、生命周期、可信度、排序和分页；条件保存在 URL。
- `/discover/[slug]` 分开呈现活动生命周期、信息可信度和资格状态，展示所有已记录时间窗口、奖励口径、操作步骤、规则、关联攻略、来源和公开版本时间。
- `/guides` 与 `/guides/[slug]` 提供分类、搜索、纯文本安全排版、关联规则/活动和来源引用。草稿、待审核、撤回、管理员字段不会进入公开 DTO。
- `TRAVELWISE_DATA_SOURCE=demo` 只用于开发和公开冒烟测试，DEMO 内容始终带标记；生产环境只能读取 PostgreSQL。

## Phase 4 计算中心

- `/calculate` 展示三类计算器；也可以直接打开 `/calculate/rates`、`/calculate/offers`、`/calculate/rewards`。
- 房价比较使用整数分和微元积分估值：`净增量价值 = 额外积分 × 每积分估值 − 额外现金 − 其他成本`。积分未知、退改权益不同或报价时间不同会降低结论确定性。
- 优惠比较支持最终报价模式和叠加模拟模式。叠加关系逐对检查；未知或有条件关系会阻止“已确认可用”结果，用户明确勾选后才进行假设模拟。
- 活动回报以“不参加活动”为基准，只把用户输入的新增经济成本、参与费用和放弃权益计入成本；预期积分和待领取奖励不会被解释为已兑现现金收益。
- `src/modules/decision` 是无 React、无数据库依赖的纯函数领域层，包含金额边界、报价、叠加、活动、资格和规则适用性判断。`Quote` 与 `ScenarioSnapshot` 仍是无状态计算输入/输出；保存动作由 Phase 5 私人快照表完成，不改变原有计算路径。
- 活动详情页只在有结构化奖励口径时提供“计算这项活动收益”跳转；官方核实且非 DEMO 的积分数量才会预填，其他情况只带活动引用。

## Phase 5 个人权益与收益

- `/me` 是受认证保护的个人工作台，复用 Auth.js 管理员身份作为 V1 Owner；没有公开注册、锦江账户登录或银行卡凭据存储。
- 会员钱包保存计划、等级（允许未知）、积分有效期、等级到期、权益/联名卡持有状态、备注和人工核对日期。个人活动记录与公开 `promotions` 分离，支持收藏、计划参加、参与、领取、到账和完成等状态，并允许按周期重复参与。
- 积分采用 `point_batches` 批次 + `point_transactions` 流水。到账、消费、到期和调整都保留记录；消费按到期优先顺序在 PostgreSQL 事务中锁定批次，幂等键和请求摘要防止重复扣减或把同一键用于另一笔请求。预计奖励只保存在个人活动的预计字段，不进入可用余额。
- 活动确认奖励到账时，在同一事务中创建积分批次、流水、奖励记录并更新个人活动；`reward_records` 将预计、已获得和已兑现分开，积分机会成本和现金节省不会重复统计。
- 三类计算器结果可保存原始输入、报价来源/时间、积分估值、规则版本快照、结果、假设和未确认事项；重复保存使用幂等键，只能修改名称和备注，重新计算后另存新快照。未登录请求在服务端统一返回 401，公开活动 DTO 不携带个人状态。
- 会员条件核对读取当前保存的等级与联名卡状态，只核对 Owner 列出的已知条件，不代表官方账户或完整活动资格验证。
- 站内待办支持官方确认、规则推算、人工设定和未确认截止时间；不会声称在网站关闭时发送外部通知。

Phase 5 正式迁移为 `drizzle/0002_phase5_personal_rewards.sql` 至 `drizzle/0005_phase5_ledger_integrity.sql`。重复运行 `db:migrate`、`db:seed` 不覆盖私人数据。详细验收、收益口径和限制见 [docs/phase-5-report.md](./docs/phase-5-report.md)。

## 目录与文档

`src/app` 和 `src/components` 负责页面与 Route Handler；`src/db` 负责 Drizzle schema、迁移连接和开发 seed；`src/modules/intelligence` 负责公开活动 DTO，`src/modules/knowledge` 负责公开攻略读取，`src/modules/admin` 负责后台授权、内容写入和审计；`src/modules/decision` 负责 Phase 4 计算与规则校验；`src/modules/personal` 负责 Owner 会话、钱包、批次流水、活动参与、待办、私人方案和收益事务；`src/shared` 提供环境、金额和时区工具。`drizzle/` 保存 SQL 迁移，`tests/` 保存单元、数据库集成和页面冒烟测试。

设计细节见 [docs/architecture.md](./docs/architecture.md)，Phase 1 记录见 [docs/phase-1-report.md](./docs/phase-1-report.md)，Phase 2 记录见 [docs/phase-2-report.md](./docs/phase-2-report.md)，Phase 3 记录见 [docs/phase-3-report.md](./docs/phase-3-report.md)，Phase 4 记录见 [docs/phase-4-report.md](./docs/phase-4-report.md)。计算器截图见 [docs/screenshots](./docs/screenshots)。Auth.js 配置参考 [Credentials Provider](https://authjs.dev/getting-started/providers/credentials) 和 [Next.js 安装说明](https://authjs.dev/getting-started/installation?framework=Next.js)。

## V1.1 私测功能

V1.1-A 在管理员后台新增 `/admin/radar`「优惠雷达」。来源配置、内容版本、运行日志和变化事件只保存在 PostgreSQL 私有表；首次检查建立基线，后续只有有意义的奖励、门槛、时间或参与条件变化才进入收件箱。检查使用 ETag/Last-Modified、正文规范化、指纹、Diff、超时、响应大小上限、DNS/重定向 SSRF 校验、并发上限和退避重试。使用现有系统任务执行一次检查：

```powershell
npm run radar:run
npm run radar:run -- --watch
```

V1.1-B 在 `/admin/smart-entry` 提供链接、原文和截图智能录入。`OPENAI_API_KEY` 只在服务端使用；结构化结果必须通过 Zod，字段会同时显示原文证据、不确定状态和人工修订状态。未配置密钥时任务明确为 BLOCKED 并转人工录入，不会把结果自动发布。截图只接受 PNG/JPEG/WEBP/GIF，单张不超过 4MB，原始内容不写入公开静态目录。

新增迁移为 `drizzle/0007_icy_clea.sql`。详细边界和验收见 [V1.1-A 报告](./docs/v1.1-a-gate.md)、[V1.1-B 报告](./docs/v1.1-b-gate.md) 与 [架构说明](./docs/architecture.md)。部署前需要在服务端环境补充 `OPENAI_API_KEY`（可选）和已有的 `DATABASE_URL`、`AUTH_SECRET`、管理员配置；本轮不部署生产。

## V1.1-C 私人决策首页

`/me` 整合个人机会、确定性优先级、站内提醒与权益概览；原会员、积分、活动、待办、收益和方案管理保留在 `/me/records`。公共首页、发现和三类计算器继续可访问。

机会只匹配有官方核实来源、已审核发布且当前有效的正式活动。管理员可在规则修订页人工登记结构化条件；原纯文本规则、未知资格和有效期不会被自动解释为可参加。提醒按真实日期去重并保存已读、完成、忽略与稍后状态；访问时更新，不提供外部推送。缺少收益输入时显示“收益待计算”，预计奖励不进入积分余额或实际收益。C 无需 AI Key。

迁移 `0008_youthful_forge.sql` 只增加私人条件和提醒表。详细边界、排序及规则格式见 [C 架构](./docs/v1.1-c-architecture.md)，验证和截图见 [C 验收](./docs/v1.1-c-gate.md)。执行数据库浏览器测试前，可先 `npm run build`，设置 `TRAVELWISE_E2E_PRODUCTION=1` 后运行 `npm run test:e2e:db`，使用独立测试库验证生产构建；不设置时保留原开发模式测试。
