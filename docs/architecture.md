# TravelWise 架构说明

## 范围

Phase 2 继续使用 Next.js App Router 的模块化单体。页面、服务、数据模型在一个项目中，但公开页面仍只读取公开 DTO；后台页面、Server Action 和 API Route 在服务端检查 Auth.js 管理员会话后写 PostgreSQL。没有微服务、队列或 Kubernetes。

## 模块边界

```text
app (公开页面)
  -> components (展示)
  -> intelligence/service (服务端读取)
      -> intelligence/queries (只读公开查询)
          -> db/client + db/schema (PostgreSQL)
      -> intelligence/demo (明确的开发夹具)

knowledge (公开攻略读取)
admin (管理员内容写入、审计、版本)
decision (无状态计算与规则校验)
personal (Owner 钱包、流水、活动参与、待办、私人方案与收益)
```

公开页面不导入 `db` 或个人业务查询；活动页只读取认证布尔值以显示个人操作入口，不读取个人进度；`/admin` 页面只通过受保护的 admin service 读取和写入。ESLint 的受限导入规则和服务端 `server-only` 边界防止个人数据进入公开页面。

Phase 3 的公开读取路径为：`app -> intelligence/knowledge service -> public query -> public DTO`。活动查询只允许 `publication_status = published`，并在服务端验证搜索参数；关键词同时匹配标题和摘要，查询使用 12 条分页限制。活动的生命周期由存储状态与当前时钟共同判断，截止时间优先于过期的编辑状态。攻略查询只允许已发布、非 DEMO 内容，并通过显式关联表展示规则、活动和证据。

## 数据模型

| 概念 | 表 | 关键设计 |
| --- | --- | --- |
| Program | `programs` | `code` 是通用会员计划标识；没有写死某个品牌 |
| Rule / RuleVersion | `rules`, `rule_versions` | 版本有生效区间、时区、条款快照；活动通过复合外键绑定对应计划 |
| Promotion | `promotions` | 活动时间窗口可为空；生命周期、核实状态、编辑状态、Demo 状态分开 |
| PromotionVersion | `promotion_versions` | 每次后台保存的不可变 JSON 快照和修订原因 |
| Guide | `guides`, `guide_categories` | 12 个 V1 研究目录、正文、标签、发布状态 |
| Evidence | `evidence` + 关联表 | 来源 URL、发布者类别、摘要、采集/核实时间；真实证据必须有 URL |
| Owner / Wallet | `owners`, `wallets` | Auth.js 管理员邮箱映射为 V1 Owner；`owner_id + program_id` 保留未来隔离边界，钱包保存等级、有效期、权益和人工核对信息 |
| 积分批次 / 流水 | `point_batches`, `point_transactions` | 来源、到账、剩余、到期和 signed 变动分开，使用 bigint；消费按到期优先顺序锁批次 |
| Action / Task | `actions`, `action_tasks` | 个人周期参与与公共活动分开；任务保留截止日期来源，不因公共活动结束删除 |
| 私人方案 | `saved_scenarios` | 保存三类计算器的输入、报价、估值、规则快照、结果、假设和未确认事项 |
| 收益记录 | `reward_records` | `expected`、`acquired`、`realized` 分层；现金、积分、成本和放弃价值字段独立，幂等键防重复入账 |
| AuditLog | `audit_logs` | 管理变更存操作、实体和安全字段名；不保存密码或会员账号详情 |

`Quote` 和 `ScenarioSnapshot` 仍在 Phase 4 作为无状态领域快照类型实现，计算器不会因为登录状态改变。Phase 5 的 `saved_scenarios` 只在用户明确保存时持久化快照，并保留当时的规则版本、输入和结果；重新计算通过新请求创建新快照，历史记录不会静默改写。

## 约束与真实性

- 时间使用 PostgreSQL `timestamptz`，输入必须带时区偏移或 `Z`；展示时根据记录的 IANA 时区格式化。
- 金额基础工具以 CNY 分为 bigint，避免 JavaScript 浮点误差；其他币种需要单独定义最小单位规则。
- DEMO 活动的标题必须以 `DEMO` 开头；生产环境拒绝 `TRAVELWISE_DATA_SOURCE=demo`。
- 资格与叠加关系有 `unknown` 状态，公开 DTO 保留未知，不会默认有效。
- `promotion.ends_at` 与个人 `actions.claim_deadline` 是两个字段，活动过期不能推导个人领取截止日。
- 活动必须是 `published` 才能公开查询；`draft` 和 `archived` 只可由未来的管理服务访问。
- `point_batches.expiry_status` 明确区分 `unknown`、`known` 和 `never`；`known` 必须有到期时间，`never` 必须没有到期时间。预计奖励不创建批次，直到 Owner 确认到账。
- `point_transactions.points` 使用 signed bigint：到账为正，消费/到期为负，调整可正可负；数据库检查约束、Owner+幂等键唯一约束和事务行锁共同防止负余额及重复扣减。

## 权限边界

Phase 2 使用 Auth.js Credentials Provider。管理员邮箱和 bcrypt 密码哈希只来自环境变量，JWT 会话默认 8 小时，登录入口由 Auth.js 处理 CSRF。`requireAdmin` 在页面和 Server Action 内执行，API 写入口还要求 same-origin 或 `Sec-Fetch-Site: same-origin`。Phase 5 的 `requireOwner` 复用同一认证会话，把管理员邮箱映射到 `owners.auth_subject`；所有个人 API 在读取或解析输入前执行服务端 Owner 校验，写入口同时检查 CSRF。公开活动查询不连接 `owners`、`actions` 或其他私人表，私人方案不会进入 SEO 元数据。关键发布、撤回、归档、规则修订、证据写入和攻略修改写入 `audit_logs`。

## 数据源

开发默认 `demo`，用于稳定地完成公开页面冒烟测试。设置 `TRAVELWISE_DATA_SOURCE=postgres` 后，公开页面只从已迁移的 PostgreSQL 读取；数据库连接失败会报错，不会悄悄回退到 DEMO。生产配置模板默认 PostgreSQL，禁止 DEMO。后台始终使用 PostgreSQL，因为草稿、审核和审计不能保存在本地状态。

## 运行与迁移

`drizzle.config.ts` 只负责 schema、迁移目录和 SQL 生成/检查；`scripts/migrate.ts` 使用 `DATABASE_URL` 执行迁移，并将连接错误压缩为不泄漏凭据的消息。`scripts/seed.ts` 仅允许本机非生产连接，并将 DEMO 数据和 `AuditLog` 写入同一事务。

Windows 本地验收使用 PostgreSQL 17 服务 `postgresql-x64-17`，只监听 `127.0.0.1:5432`。`travelwise_dev` 和 `travelwise_test` 是独立数据库，分别由同名的非超级用户角色拥有；撤销 PUBLIC CONNECT 后，测试角色不能连接开发库。集成测试只清理已确认的测试库，开发库不会被测试清空。密码只存在被 Git 忽略的环境文件中。

## Phase 2 数据来源

首批真实内容来自可访问的官方公开页面：浦发银行《浦发银行锦江WeHotel联名信用卡权益细则》（活动期、15 间夜/10000 积分和领取窗口）以及锦江荟 App 软件许可及服务协议（实际支付金额积分公式与优惠抵扣不计积分）。系统保存 URL、来源类别、摘录、记录时间和核实状态；来源失效或条款变化时应创建新规则版本并填写修订原因。

## 公开状态与浏览边界

活动详情同时展示生命周期、可信度和资格/叠加关系。`official_verified` 只代表来源已核实，不代表活动仍在进行，也不代表用户一定符合资格。公开活动详情可以出现“官方已核实 + 已结束”。来源证据和版本历史只投影公开的标签、摘录和时间；管理员、审计操作者、修订原因和 JSON 快照不会返回。

## Phase 5 事务边界

积分到账在一个数据库事务内创建批次和正向流水；所有积分写入口先 `SELECT owners ... FOR UPDATE` 锁定当前 Owner，再校验 Owner+幂等键与规范化请求的 SHA-256 摘要；消费通过 `SELECT ... FOR UPDATE` 按到期时间锁定有效批次并逐批扣减，记录每批 delta 与 remainingAfter，余额不足时整笔回滚。单一 Owner 采用串行写入是 V1 的明确取舍，不引入复杂账务系统。活动奖励到账额外锁定个人 `actions` 行，更新活动、批次、流水和 `reward_records`；重复请求返回原记录。活动收藏只写个人 `actions`，待办仅在 Owner 显式确认草稿后写入 `action_tasks`，不会修改公共活动。迁移和 Seed 使用 Drizzle 历史及固定业务键，重复执行不覆盖私人数据。

## 已知边界

V1 只有一个真实 Owner，身份仍是管理员邮箱映射；没有锦江官方账户同步、自动报名/领奖、银行流水、外部消息推送或多用户注册。积分到期和奖励到账依赖 Owner 的人工证据；综合收益只对已记录的现金金额和积分字段统计，没有可比较现金基准的兑换不会被凭空算成节省。
# Phase 4 决策计算层

Phase 4 延续模块化单体，不把公式放入 React 页面，也不让客户端传入的规则 ID直接决定计算参数。`src/modules/decision` 只依赖 Zod 和 TypeScript 类型：

- `math.ts` 使用 bigint 表示人民币分，使用 bigint 微元表示每积分估值；格式化字符串只在 UI 边界生成。
- `rate-comparison.ts` 计算普通价与多倍积分价的现金差、积分差、增量价值和盈亏平衡点；积分未知或权益不可比时不输出无条件推荐。
- `offers.ts` 比较最终报价，并按用户给出的顺序模拟百分比、固定、满减和积分抵扣。所有选中优惠的两两关系都必须明确为已核实可叠加，未知关系只能返回阻断或假设模拟。
- `activity.ts` 计算满额、分档、固定积分和百分比现金返还，区分计划消费、额外消费、参与费用、放弃权益和奖励到账状态；`calculateTransactionPoints` 按单笔取整。
- `qualification.ts` 返回“符合已知条件 / 不符合已知条件 / 信息不足”；`rules.ts` 检查发布时间、官方核实状态、有效期、证据和手动参数冲突；`service.ts` 只从非 DEMO 数据中读取规则，并在服务端再次检查这些条件。

Quote 和 Scenario 目前是无状态领域快照类型。它们可复制、导出并携带规则版本 ID、估值假设和计算时间，但不会把私人报价自动写入数据库，Phase 4 本身没有个人账户历史账本；Phase 5 由独立的认证保存入口持久化。现有 `rule_versions`、`promotions`、`evidence` 和版本审计表已经满足追溯要求，因此 Phase 4 不新增迁移。

UI 使用 `/calculate` 计算中心以及三个专用路径；活动详情只在奖励口径足够可靠时预填积分，其余输入由用户确认。所有结果区域同时展示现金、积分、估算价值、未知项和公式。


## Phase 5 余额与收益核对

余额来自尚未过期批次的剩余积分；已知到期时即不可兑换，Owner 确认到期操作补记负向流水。未知到期日和有依据永不过期分别存储，不推断统一有效期。未来 30 天到期提示不截断批次数量。批次全部剩余量与所有 signed 流水合计核对，未登记过期金额单独披露。迁移为旧批次的剩余余额建立期初流水，保留其原 earned_points。

已获得积分（累计正向 credit）、当前可用资产、预计奖励、兑换消耗与到期损失分别展示；手动调整保留独立 adjustment 流水。兑现现金只合计 Owner 有比较基准并注明依据的金额，不把积分获得估值重复加入。综合经济价值（微元）＝（兑现现金分 − 额外成本分 − 放弃权益分）×10000 − 消耗积分×每分估值微元；缺现金基准或积分估值时不输出完整合计。

私人方案只允许更新名称和备注，输入、计算结果、会员快照、规则与证据快照不可由编辑 API 覆写。重算恢复原始输入，读取当前公开关联依据，再保存为新记录。会员条件核对使用当前 Wallet；历史快照与操作流水保持原值。个人 API 设置 private/no-store 和 noindex，未登录在解析输入前拒绝，跨来源写入返回 403；错误响应不返回数据库 SQL 或个人参数。

备份、恢复、异常处理及验收证据见 [Phase 5 报告](./phase-5-report.md)。

## V1.1 雷达与智能录入

V1.1 继续使用 Next.js App Router + Auth.js + Drizzle 的模块化单体。`src/modules/radar` 只在管理员服务端路径运行：`monitor_sources` 保存公开来源配置，`monitor_versions` 保存规范化正文和指纹，`monitor_runs` 保存每次 HTTP 结果，`radar_events` 保存有意义变化及 Diff。首次检查只建立基线；只有包含日期、金额、积分、门槛、条件或参与限制等条款的变化才进入收件箱。来源访问使用 ETag/Last-Modified、超时、响应大小上限、最多三次重试和并发上限；每个重定向重新做 DNS 和受限网络校验。

`scripts/radar-runner.ts` 提供一次性或 `--watch` 轻量执行器，部署时由现有系统任务每 6–12 小时调用，不依赖 Redis、Kafka 或 Kubernetes。来源故障隔离在 `monitor_runs` 和来源错误字段内；进程内同一来源使用幂等运行锁，数据库唯一键防止重复版本和情报。雷达数据、草稿和 AI 原文不进入公开查询。

`src/modules/ai` 通过 `AiProvider` 接口隔离模型供应商。当前可选 OpenAI Responses API；服务端只读取 `OPENAI_API_KEY`，原文按不可信资料注入并明确禁止工具调用。所有输出先经过 Zod 结构化校验，每个字段保存值、原文证据、不确定标记和人工修订标记；无凭据时保存 BLOCKED 任务并提供人工回退，不冒充模型成功。截图仅接受 PNG/JPEG/WEBP/GIF，单张 4MB，实际文件头验证后保存在受保护数据库任务内，不写入 `public`。AI 草稿沿用 `promotions`、`promotion_versions`、`evidence` 和原有管理员发布门槛，任何结果都不能自动发布。
# V1.1-C Personal Opportunity Engine

私人机会、提醒状态机、确定性排序、结构化规则格式、三类计算器复算及数据隔离说明见 [V1.1-C 架构](./v1.1-c-architecture.md)。原个人工作台保留为 `/me/records`，`/me` 提供每日决策视图；仅增加迁移 0008，不改变 V1 账本或 V1.1-A/B 的审核边界。
