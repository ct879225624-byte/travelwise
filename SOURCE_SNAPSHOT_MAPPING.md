# TravelWise 源码来源与干净基线差异
日期：2026-10-26（Asia/Hong_Kong）。

来源固定提交：b227dac2da726f7430368425ca8caa52e5ff4864。使用 git archive 导出文件，没有复制原 .git，没有导入旧 refs、标签、reflog 或 commit 对象。新仓库 main 只有一个无父提交的根提交；来源 SHA 只是溯源文字，不是本仓库祖先。

## 文件数量与业务完整性

- 来源 311 个文件；排除 106，保留 205；新增 6 个必要交接文件，合计 211 个上传文件。
- 保留文件中 185 个与来源逐字节一致；20 个只变更文档或 .gitignore。
- src、tests、scripts、drizzle 全目录，以及 package.json、package-lock.json、Next/TypeScript/Playwright/Vitest 等功能配置均保持来源字节。0000–0008 共 9 份 SQL、完整迁移 journal/snapshot 均保留。
- next-env.d.ts 虽会被构建自动更新，最终提交恢复为来源字节。未合并 security worktree，也未导入原分支。
- 新 Git 身份使用项目通用名称及 example.invalid 合成邮箱，不沿用原提交者身份。

## 保留但脱敏/更新的文件

所有变动均用于路径泛化、删除对本地敏感证据的链接、替换原始运维为非敏感模板、清晰区分来源历史与新基线，或补充安全忽略规则。不更改业务计算和测试。

| 文件 | 处理 |
| --- | --- |
| .gitignore | 补齐敏感文件/证据/截图排除；保留 SQL 迁移及环境模板可跟踪性 |
| PROJECT_STATUS.md | 替换为云端任务状态，旧恢复记录仅本地保全 |
| README.md | 更新入口及交接索引；泛化私人路径/证据引用 |
| docs/architecture.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/content-audit.md | 保留内容治理摘要，原始数据库统计及对账证据留本地 |
| docs/operations/backup-restore.md | 替换为不含生产细节的独立恢复模板 |
| docs/operations/deployment-plan.md | 替换为非敏感 Linux 部署模板，非部署授权 |
| docs/operations/rollback-plan.md | 替换为不含生产细节的回滚模板 |
| docs/phase-1-report.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/phase-2-report.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/phase-3-report.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/phase-4-report.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/phase-5-report.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/phase-6a-release-readiness.md | 保留历史阶段摘要，删除原始运维证据 |
| docs/security-review.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/ui-acceptance.md | 保留验收边界，移除历史图片索引 |
| docs/v1.1-a-gate.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/v1.1-b-gate.md | 泛化证据路径，保留未获得应用 API 授权的 BLOCKED 边界 |
| docs/v1.1-c-architecture.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |
| docs/v1.1-c-gate.md | 泛化私人路径和敏感基础设施标识，移除仅本地证据链接 |

## 新增交接文件

- CLOUD_HANDOFF.md
- PROJECT_STATUS_FOR_REVIEW.md
- docs/screenshots/README.md
- docs/operations/EVIDENCE_POLICY.md
- SOURCE_SNAPSHOT_MAPPING.md
- CLOUD_BASELINE_REVIEW.md

CLOUD_HANDOFF.md 重新编写为新基线交接，PROJECT_STATUS_FOR_REVIEW.md 从本地已生成综述做脱敏副本；保留原综述的来源时间和历史结论，新增显著说明避免把原 Git 状态误当云端状态。另四份为本次上传审核、来源差异及证据/图片策略。

## 明确排除的来源文件

| 类别 | 数量 | 原因 |
| --- | --- |
| docs/screenshots 下所有来源 PNG | 101 | 无法保证原始界面截图没有私人信息，全部保守排除 |
| docs/operations/phase-6b-preflight.md | 1 | 原始生产预检与运维资料 |
| docs/operations 下四份 phase6a 原始 JSON 证据 | 4 | 可能包含本地备份路径、数据库指纹和运维证据 |

四份 JSON 分别为 phase6a-content-repair-evidence.json、phase6a-dependency-audit.json、phase6a-development-preservation.json、phase6a-restore-evidence.json。

## 本地工作资料的去向

原目录和已验证本地备份不变。另四份未跟踪 Phase 6B 原始 md、未提交 V1.1-B 研究脚本/研究正文/原始证据 JSON，以及已被本方案替代的 GITHUB_UPLOAD_READINESS.md 均不导入。此处是排除策略，不是判定研究资料含真实秘密。以后如需共享先单独审核。
原 .env、会话、数据库、备份、构建产物、原始扫描日志和 Git 备份从未进入白名单。现有 .env.example 与 .env.production.example 是无真实凭据的模板。

完整逐文件上传白名单（大小/SHA-256）、106 项来源排除清单、8 项本地资料排除清单及源文件差异 JSON 在 Owner 的独立本地审计目录，不携带私人绝对路径到本仓库。

## 恢复与审查

仅依赖本新仓库的批准根提交即可恢复纳入的源码、迁移、锁文件及必要文档。重新安装依赖，使用空白隔离测试数据库，按 CLOUD_HANDOFF.md 验证；不能以复制旧缓存、旧凭据或数据库代替重建。
新提交 SHA 在配套最终报告或 git rev-parse HEAD 中获取。不要对新根执行来源祖先检查；旧上传准备文档中的历史保留推送示例已不适用。
