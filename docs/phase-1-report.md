# TravelWise Phase 1B 验收记录

日期：2026-10-10（Asia/Hong_Kong）

## 本轮完成

- 核对 Windows 11 x64、Node.js 24.16.0、npm 11.13.0、Git 2.55.0；确认 5432 初始未占用，安装 PostgreSQL 17.11-5 官方 EDB 安装器。
- 验证 Windows 服务 `postgresql-x64-17` 运行并设置为自动启动；服务重启后仅监听 `127.0.0.1:5432`，数据库连接使用 UTC。
- 建立独立的 `travelwise_dev` 和 `travelwise_test` 数据库；应用角色分别为 `travelwise_dev` / `travelwise_test`，均为非超级用户、不可建库/建角色、无复制和绕过 RLS 权限。撤销 PUBLIC CONNECT 后，测试角色访问开发库会被拒绝。
- 执行迁移并重复执行 seed；扩充真实数据库约束测试，覆盖迁移重复执行、表和约束、DEMO seed 幂等、唯一键、CHECK、普通/复合外键、bigint 积分和金额、带时区时间、NO ACTION 更新删除。测试库每次运行后只清理自身数据。
- 增加时间工具单元测试；seed 拒绝 `_test` 数据库；环境模板、README 和 Compose 备用配置统一到 PostgreSQL 17；修复 PostgreSQL E2E 配置重复启动 DEMO/数据库两个服务器的问题。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `npm run db:migrate` | 通过；迁移实际写入 `travelwise_dev` |
| `npm run db:seed` | 通过；第一次成功 |
| `npm run db:seed` | 通过；第二次成功且幂等 |
| `npm run test:db` | 通过：1 个文件、6 个真实 PostgreSQL 测试 |
| `npm run check` | 通过：lint、typecheck、unit、db:check |
| `npm run test:e2e` | 通过：DEMO 数据桌面/移动共 4 个测试 |
| `npm run test:e2e:db` | 通过：PostgreSQL 数据源桌面/移动共 4 个测试 |
| `npm run build` | 通过：Next.js 生产构建成功 |
| 服务/安全检查 | 通过：服务 Running/Auto、仅回环监听、角色非超级用户、测试角色不能连接开发库、测试库清理后活动数为 0 |

## 数据验证结果

开发库包含 10 张迁移表、1 条明确标记的 DEMO 活动、1 条 DEMO 证据和 1 条 seed 审计记录。测试库迁移后运行 6 个测试，清理完成后没有遗留活动记录。数据库服务没有暴露到公网接口。

## 已知限制

页面默认仍使用明确标记的 DEMO 夹具；没有接入锦江荟账户、真实活动、AI、爬虫、预订、报名、积分领取或生产部署。Phase 2 未开始。`.env` 仅存在本机且被 Git 忽略，密码没有写入提交或测试输出。

## 下一阶段建议

仅在 Owner 单独授权 Phase 2 后，从绑定 `rule_version_id` 的 Scenario/Quote 纯函数计算器开始，再扩展知识库版本浏览。认证和服务端授权完成前，不开放 Personal/Admin 写接口。

## Gate

`TRAVELWISE_PHASE_1_GATE=PASS`
