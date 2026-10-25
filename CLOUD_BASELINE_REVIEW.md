# TravelWise 云端干净基线审核资料
日期：2026-10-26（Asia/Hong_Kong）。

## 审核结论与范围
本次只准备独立本地仓库及非敏感交接资料，没有新业务开发、原仓库历史改写、原数据库修改、生产操作或任何远程写入。
来源为 b227dac2da726f7430368425ca8caa52e5ff4864，云端仓库是没有原父提交的新 main 根提交。新 SHA 和最终扫描证据在 Owner 本地配套最终报告中；也可执行 git rev-parse HEAD 查询。本文件不嵌入自身提交 SHA，避免循环引用。

原固定提交有 311 个文件，排除 106 个，保留 205 个；增加 6 个交接/安全说明文件，最终上传白名单为 211 个文件，0 张图片。业务源码、测试、脚本、迁移和依赖锁逐文件 SHA-256 对齐来源提交。具体差异见 SOURCE_SNAPSHOT_MAPPING.md。

## 本次实际执行的验证
以下全部在独立 Windows 导出目录重新执行，不是引用历史验收：
| 项目 | 结果 |
| --- | --- |
| 全新 npm ci（锁定依赖） | 退出码 0 |
| npm run check | 退出码 0，包含 lint/typecheck、54 项单元测试及迁移历史结构检查 |
| npm run build | 退出码 0，Next standalone 构建 |
| npm run test:install | 退出码 0 |
| DEMO E2E | 30 PASS / 52 SKIP / 0 FAIL |
| 隔离 PostgreSQL 集成测试 | 40 PASS / 0 FAIL |
| standalone 生产运行模式 + 隔离 PostgreSQL E2E | 77 PASS / 5 SKIP / 0 FAIL |

DEMO 的跳过为依赖数据库的用例。数据库 E2E 的 5 个跳过是 mobile 项目中的重复五档截图检查；相同五档检查已在 desktop 项目执行，不是遗漏 5 个业务测试。
数据库测试使用新建的 loopback PostgreSQL 17 实例、两个专用 _test 数据库和临时凭据；结束后实例已停止。未连接原项目开发库或生产库。原数据库和生产数据未迁移到此目录。
构建自动生成的 next-env.d.ts 在验证后恢复为来源字节；只改变构建生成的声明路径，没有业务变更。下一次构建仍可能重建该声明。

## 安全与上传边界
最终文件检查、新仓库 Gitleaks 历史检查及全对象补充检查由配套本地审计报告记录，未全部通过不得上传。检查覆盖密钥/会话模式、原本地已知秘密精确匹配、原提交身份、私人路径和基础设施标识；不输出敏感值。
安全扫描不能证明绝对不存在泄露。所有历史截图均保守排除，因此上传清单及 Git 对象中没有图片；测试新生成截图只在被忽略的本地目录。
.env.example 和两份单元测试里的连接 URL 是公开模板或人工测试夹具，不能作为真实连接凭据。没有放宽扫描器规则或用忽略规则掩盖历史泄露。
原历史 20 个提交、分支、security worktree、原始运维和备份只在 Owner 本地保留，不导入云端。原历史仍包含身份和运维隐私，禁止改用原仓库或原 bundle 上传。

上传对象仅限审核后的 Git 提交。工作目录内的 node_modules、.next、浏览器缓存、日志、截图不在提交内，不能把整个工作目录打包上传。原始审计目录也不得上传。

## GitHub Free 与 Muse 接入
Owner 确认个人套餐为 GitHub Free；只读 GitHub API 确认账号，未提供套餐字段，所以不是 API 独立核实账单。当前官方文档显示 Free 私有仓库不支持所需主分支保护及 branch/tag Rulesets。
[分支保护官方说明](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)，[Rulesets 官方说明](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)。

替代流程：Muse 使用只对一个仓库生效的只读 deploy key，添加时不勾选 Allow write access；或仅选该仓库、Contents: Read-only 的有期限细粒度 PAT。Deploy key 没有自动到期，需人工撤销/轮换。不得把 Owner 的宽权限 GitHub 登录或生产 SSH 转交给 Muse。[Deploy key 官方说明](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)。
Muse 在本地 codex/<task-id> 修改、测试和提交，只交付 patch/bundle。Owner 在独立发布环境审核差异及测试，再以受控凭据更新 GitHub main；Muse 没有任何推送权限。不能把 Contents 写权限解释为只允许写开发分支。

## 尚未验证或尚未授权
- Muse 云电脑及 Linux 环境尚未重建验收；未验证远端只读凭据，因为尚未创建仓库或凭据。
- V1.1-B 没有应用 API Key，未执行真模型质量验收；本次通过不改变其 BLOCKED 状态。
- 不表示生产可直接部署，不包含生产配置/数据恢复验证。
- 只建立 main；cloud-base 等批准后单独创建。不导入旧分支或标签。
- 创建私有远端、添加 origin、首次推送确切 SHA、创建 cloud-base、配置 Muse 只读访问均需下一轮明确授权。没有自动升级套餐或配置付费资源。
