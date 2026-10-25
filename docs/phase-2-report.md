# TravelWise Phase 2 验收报告

日期：2026-10-10（Asia/Hong_Kong）

## 交付内容

- 扩展 PostgreSQL Schema：活动生命周期、活动时间窗口、资格/奖励/渠道字段、内容核实状态、规则结构化内容、攻略与 12 个分类、来源关联表、活动/攻略历史快照、审计操作者。
- 新增 `drizzle/0001_parallel_gamora.sql`，只做增量表、列、枚举和约束变更；旧活动、规则、证据和个人预留表保留。
- 新增 Auth.js Credentials Provider。管理员邮箱、bcrypt 密码哈希和 `AUTH_SECRET` 只从环境变量读取；没有默认密码和公开注册。`npm run admin:hash -- <password>` 生成哈希。
- 后台 `/admin` 支持活动新建、保存草稿、提交审核、发布、撤回、归档、编辑历史；规则创建/修订；攻略创建/编辑/发布；来源登记与关联；审计列表；基础搜索和状态筛选。
- 公开发现页从 PostgreSQL 读取已发布活动，支持标题/类别搜索；详情页展示时间节点、资格、生命周期、核实状态、规则和来源。攻略页和详情页读取已发布攻略。
- Seed 增加 12 个锦江荟攻略目录、一条官方核实的 2026 浦发锦江联名卡住宿达标礼活动、一篇官方协议摘要攻略，DEMO 内容仍明确标记。

## 首批真实资料

1. 浦发银行《浦发银行锦江WeHotel联名信用卡权益细则》：活动期 2026-01-01 至 2026-12-31，官方平台预订并在线支付，累计入住每满 15 间夜获 10000 锦江积分，每自然年最多 5 次；证据状态 `official_verified`，来源 URL 写入数据库。
2. 《锦江荟 App 软件许可及服务协议》：实际支付金额乘适用积分倍数，优惠抵扣金额不计入实际支付金额；证据状态 `official_verified`，用于基础积分攻略。

未确认的会员等级、折上折组合和社区经验没有伪装成官方规则；可以从后台以 `unverified`、`community`、`conflict` 或 `reverify` 状态录入。

## 验收映射

| 验收项 | 结果 |
| --- | --- |
| CONTENT-01 草稿写入且公众不可见 | Playwright PostgreSQL E2E 通过 |
| CONTENT-02 审核发布后公开可见 | Playwright PostgreSQL E2E 通过 |
| CONTENT-03 发布内容修改留历史 | `promotion_versions` + 服务实现；数据库版本快照写入通过 |
| CONTENT-04 归档/撤回 | 后台状态动作与公开查询过滤已实现 |
| CONTENT-05 重复来源/活动提示 | 来源 URL 唯一约束；Slug 唯一约束；API 返回 400 |
| CONTENT-06 未登录写入拒绝 | API E2E 返回 401，数据库无写入 |
| CONTENT-07 规则与证据追溯 | 详情页读取规则版本与证据关联 |
| CONTENT-08 攻略创建发布 | 后台表单、状态动作、公开列表/详情已实现 |
| CONTENT-09 撤回与审计 | 状态动作写 `audit_logs` |
| CONTENT-10 Seed/迁移幂等 | 迁移重复执行、Seed 重复执行和原有 DB 集成测试通过 |

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `npm run check` | 通过：lint、typecheck、8 个单元测试、db:check |
| `npm run test:db` | 通过：6 个真实 PostgreSQL 集成测试 |
| `npm run test:e2e` | 通过：6 项（2 项管理员数据库流程在无数据库的 DEMO 配置下跳过，4 项公开流程 + 2 项未登录拒绝） |
| `npm run test:e2e:db` | 通过：8 项（公开 4、管理员 4） |
| `npm run build` | 通过：Next.js 16.4 生产构建 |
| `npm run db:migrate` | 通过；重复执行安全 |
| `npm run db:seed`（两次） | 通过；固定业务标识和冲突忽略保持幂等 |

## 限制与风险

- Auth.js Credentials Provider 适合本阶段单管理员；没有公开注册、找回密码和多管理员 RBAC。生产使用前必须配置高熵 `AUTH_SECRET`、强密码哈希和 HTTPS。
- 官方活动页面可能更新或下线；当前 Seed 记录的是 2026-10-10 核实快照，不提供自动监控。
- 规则和攻略关联编辑已具备表与写入能力，复杂的可视化版本对比留待 Phase 3。
- 真实 PostgreSQL 开发库保留 Seed 的真实示例、DEMO 和审计记录；E2E 产生的临时活动已按固定 `e2e-promotion-*` 标识清理，避免覆盖其他内容。

## Git

提交 SHA 见最终交付回复；完成提交后工作区应清洁。

## Gate

`TRAVELWISE_PHASE_2_GATE=PASS`
