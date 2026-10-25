# TravelWise 干净云端基线交接
日期：2026-10-26（Asia/Hong_Kong）。

## 基线与责任
本仓库是从来源提交 b227dac2da726f7430368425ca8caa52e5ff4864 经文件级审查后导出的新仓库。只有新的本地 main 根提交；旧历史留在 Owner 本机，没有旧父提交、分支或标签。最终 SHA 由本次审核报告给出；cloud-base 仅在批准后创建。

原 ChatGPT 规划聊天负责范围、验收、审核及下一轮指令；Muse 一次只传递一份批准任务，Codex 实现和验证后即停止。不得从历史报告的旧停止点推断新授权。

## 运行环境与凭据
Node 24.x，使用 package-lock.json 和 npm ci。Next 16.4.3、React 19.3.0、PostgreSQL 17、Drizzle，具体精确依赖以 package/lock 为准。
Windows 依赖、浏览器和 .next 不可直接搬到 Linux；云端独立安装。

没有 .env、生产数据或真实密钥。环境模板仅供 Owner 安全配置；开发可显式选择 DEMO，生产拒绝 DEMO。
管理员与应用 AI 凭据均不得从本地复制。CLI 的开发登录不等于应用 API Key。默认不运行真实模型请求或抓取。

## 无数据库重建验证
先确认独立 checkout 和批准 SHA，再依次执行，避免共享 .next 的并行竞争：
~~~bash
npm ci
npm run check
npm run build
npm run test:install
npm run test:e2e
~~~
check 包含 lint、typecheck、unit、迁移历史结构检查。DEMO E2E 中数据库专属用例会跳过，必须回传跳过数。
截图会重新生成到已忽略目录，不进入源码基线。

## 隔离数据库验证
仅可使用专用临时 PostgreSQL，loopback、临时凭据、_test 库名，并与应用库名不同。
现有 requireTestDatabaseUrl 不强制 loopback；必须用网络及凭据隔离补足。集成测试会清理测试数据，不能指向原开发或生产实例。
integration 与 DB E2E 串行或使用不同隔离库。测试夹具不是真实优惠/资产。不得用 db:seed 向正式环境填数据。
数据库测试、迁移、Seed、修复与恢复只能针对该轮明确批准的隔离环境。生产操作独立授权。

## GitHub 与 Muse
Owner 已确认个人账号使用 GitHub Free；只读 API 能确认账号，未返回套餐字段，套餐依据是 Owner 的确认。
按当前 GitHub 文档，Free 私有仓库不支持所需主分支保护和 branch/tag Rulesets，不据此自动升级或付费。
首次 Muse 使用单仓库只读 deploy key 或单仓库 Contents:Read-only 的有期限细粒度 PAT；不得复制 Owner 的宽权限登录或生产 SSH。
Muse 可本地修改、测试、提交并交付 patch/bundle，但只读凭据不能推送；由 Owner 独立受控发布步骤审核并更新 GitHub。客户端提示词不能替代凭据权限。
不得给 Muse 可推 main 的凭据，不配置自动 push、合并或部署；只有经审核的单轮任务可执行。

## 发布和回传
本次没有 remote，没有创建远程仓库或推送。真正推送前批准新根提交 SHA、GitHub owner/repo、私有可见性及首次明确引用。
首次仅推新 main；不导入旧 refs，不推 --all/--mirror/--tags，不创建 cloud-base 直到批准。
回传任务 ID、批准/结果 SHA、文件差异、检查退出码、PASS/FAIL/SKIP/BLOCKED、日志位置及未完成项。原始本地备份和敏感证据不得上传。

历史阶段报告是来源软件的验收记录；本次重新执行项目检查的结果另见 CLOUD_BASELINE_REVIEW.md。
