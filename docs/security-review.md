# Phase 6A 安全与隐私审查

审查日期：2026-10-20（Asia/Hong_Kong）。基线：`24b7d83`。范围：当前仓库、依赖公告、本地隔离测试；没有访问 VPS、修改其他项目、扫描外部系统或执行生产攻击测试。

本次代码审查及安全定向测试通过，未发现尚未解决的 P0/P1 安全缺陷。`SECURITY_GATE=PASS` 以本文列出的单实例、HTTPS、受控反向代理及密钥初始化前提为边界；生产机器、防火墙、TLS 和生产 Cookie 尚未实测。整体验收结果及 PostgreSQL/浏览器回归见 [Phase 6A 报告](phase-6a-release-readiness.md)。

## 已修复问题

| 编号 | 严重度 | 问题与修复 | 验证 |
| --- | --- | --- | --- |
| SEC-01 | P1 | Credentials 密码验证原先没有失败预算。现每个应用进程最多连续 10 次尝试/15 分钟，在 bcrypt 前同步预占预算，所有邮箱共享预算以避免改邮箱绕过；成功登录清零，冷却结束恢复。 | 实际应用 Credentials callback 定向测试：10 次失败后正确密码也被拒绝，不再进入 bcrypt；推进时钟后正确账户恢复，非配置邮箱/未配置哈希仍失败。 |
| SEC-02 | P2 | 管理员两条 JSON API 原先只比较 Origin 的 Host，且 Fetch Metadata 能短路冲突的 Origin。现与个人 API 使用同一检查，比较协议、主机、端口；存在 Origin 时它优先，只有缺失 Origin 时才接受 `Sec-Fetch-Site: same-origin`。 | 跨协议、端口、主机、`null`、路径和伪造同源 Metadata 均拒绝；合法反代 HTTPS Host 通过；管理员写路由返回 403。 |
| SEC-03 | P2 | JSON 路由原先先完整解析未限大小的请求。现逐块按真实 UTF-8 字节限制 128 KiB，Auth.js POST 限 16 KiB；缺失或伪造较小 Content-Length 均不能绕过。JSON API 拒绝非 JSON Content-Type。 | 真实流读取、多字节超限、虚报长度、Content-Type、Auth POST 前置拒绝测试；正常 Auth.js 表单及 CSRF Cookie 完整保留。 |
| SEC-04 | P1（维护可用性） | 管理员 GET 活动列表原先直接序列化 PostgreSQL bigint，存在奖励金额时可 500。现转成十进制字符串；数据库失败返回不含内部信息的 503。 | 含 `2800n` 的路由回归返回 `"2800"`；未登录 GET/POST 均 401。 |
| SEC-05 | P2 | 管理员 JSON 响应补齐 `private, no-store` 和 `noindex, nofollow`；全站补充 `base-uri 'self'; object-src 'none'; frame-ancestors 'none'` 和 camera/microphone/geolocation 禁用。原 `nosniff`、Referrer Policy、DENY 保留。 | 私有缓存定向断言；响应头的实际浏览器验证纳入全站验收。此 CSP 没有限制 script-src，不能称为完整 XSS CSP。 |
| SEC-06 | P2 | 密码哈希工具原先只接受命令参数，易进入终端历史；bcrypt 超过 72 UTF-8 字节会截断。现支持标准输入、拒绝超过 72 字节，README 使用隐藏输入；旧命令参数仅为兼容保留。 | 独立执行脚本 3 项：stdin 哈希与比较成功、过短拒绝、多字节超限拒绝，验证过程未打印密码/哈希。 |

登录错误向外保持通用失败信息，避免区分邮箱不存在和密码错误。冷却期间 Owner 也可能暂时不能登录，应等待 15 分钟并查看受控代理日志；不要把重启进程当作常规解锁手段。

## 审计矩阵

| 边界 | 当前实现与证据 | 结论/限制 |
| --- | --- | --- |
| 管理员认证 | 只有 Credentials Provider，没有公开注册、默认生产密码或测试登录分支；环境邮箱白名单、bcrypt 比较；生成工具 12 rounds。 | 通过代码和定向 callback 测试；生产凭据由 Owner 单独生成。 |
| Session | Auth.js JWT 策略，maxAge 为 8 小时；使用框架加密 token、签名校验与到期校验。实际 `@auth/core/jwt` encode/decode 测试验证有效/过期 token。 | 通过；测试过期 token 属于库与本地测试，不等同生产 Cookie 验证。 |
| Cookie 与退出 | 所安装 Auth.js 默认会话 Cookie 为 HttpOnly、SameSite=Lax，HTTPS 时 Secure；退出通过框架 Server Action 清 Cookie。 | 必须配置真实 HTTPS `AUTH_URL` 并覆盖代理协议头；生产 Secure 属性待上线前实测。 |
| 管理员授权 | 管理页 `requireAdmin`，所有管理 Server Action 重新取得 actor，JSON API `requireAdminApi`。 | 不依赖导航或客户端按钮隐藏。 |
| 私人授权/IDOR | 每个个人 service 入口重新 `requireOwner`；Owner 来自认证邮箱；按 ownerId 过滤，ID 操作验证归属，复合外键保护跨 Owner 关联。 | 既有 PostgreSQL `PERSONAL-14` 覆盖读取、活动、到账、任务、过期、历史和兑现跨 Owner 拒绝；最终实跑结果见总报告。 |
| 草稿/撤回隔离 | 公开活动查询强制 published；规则及关联攻略也过滤 published；公开 DTO 排除私人快照、审计 actor/理由，公开版本仅号码和时间。 | 草稿/撤回边界由真实数据库 E2E 验证，不能仅以页面存在认定。 |
| CSRF | Auth.js HTTP 登录保留框架 token 验证；Server Actions 使用 Next.js Origin/Host 检查；管理和个人 JSON 写入使用统一同源校验。 | 代理必须覆盖 Host、X-Forwarded-Host、X-Forwarded-Proto，应用端口不得直接对公网开放；不配置通配 allowedOrigins。 |
| XSS/来源链接 | 攻略、备注、证据及历史均经 React 文本插值；源码未使用 dangerouslySetInnerHTML、eval 或动态脚本；来源 URL 仅 HTTP(S)，数据库亦有约束，外链 noreferrer。 | 既有浏览器测试将脚本样式文本保存后检查不执行；当前没有富文本 HTML 执行入口。 |
| SQL 注入 | Drizzle 查询/参数插值，源码没有 `sql.raw`、postgres `.unsafe` 或用户拼接 SQL；动态排序/字段为固定代码。 | 测试目录中有明确标记的隔离数据库故障注入，不属于生产路径。 |
| URL/输入 | 发现页搜索/筛选及分页使用有长度与枚举边界的 schema；私人 UUID、金额/积分字符串及日期使用 Zod；服务及数据库再校验。 | 个人积分为 bigint，金额为整数最小单位；计算快照有总请求大小边界。 |
| 敏感错误/日志 | 私人 API 将数据库异常替换为通用错误；管理员 API 也不返回 SQL/连接详情。数据库 URL 验证不输出原值；未开启 Auth.js debug。 | 应用进程日志仍可能含错误栈/数据库查询上下文，应按私人数据保护、限制读取和保留期；禁止代理记录请求正文、Authorization 或 Cookie。 |
| 配置/仓库 | `.env`、`.env.*` 被忽略，仅跟踪空密钥模板；检查所有 Git 历史的 `.env`/私钥文件路径未发现记录。测试密码/哈希只用于明确的测试配置，不被生产代码读取。 | 非专业密钥扫描工具的全历史保证；Owner 应从安全渠道保存 Secret，不复制测试配置。 |
| Seed | 脚本拒绝 production、远程主机和专用 `_test`，使用事务；DEMO insert 不覆盖私人数据；生产禁止 DEMO 数据源。 | 开发 seed 本身不等于正式内容初始化。最终幂等及历史保持由 PostgreSQL 回归确认。 |
| 服务降级 | 私人接口数据库错误不会泄漏内部字段；页面使用统一错误状态可重试；管理列表失败返回 503。 | 并非全站高可用系统；备份/恢复及故障恢复见运维演练。 |

## 依赖安全：实时结果

2026-10-20 实际执行 `npm audit --json`：9 项，high 5、moderate 4、critical 0；命令退出 1，不能报告为“全依赖无漏洞”。`npm audit --omit=dev --json`：0 项，退出 0。

| 公告/依赖链 | 影响判断 | 处置 |
| --- | --- | --- |
| `braces@3.0.3` → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next，共 5 个 high 节点 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 描述深层嵌套 brace pattern 可耗尽调用栈；npm 节点数不代表 5 个独立漏洞。当前只在 lint 开发链，应用 HTTP 输入未进入该链，检查时 standalone 不含这些包。 | P2 工具链风险；不处理不可信仓库/构建模式，不将开发服务暴露公网，跟踪上游补丁；当前公告无修复版。 |
| `esbuild@0.18.20` → @esbuild-kit/core-utils → @esbuild-kit/esm-loader → drizzle-kit，共 4 个 moderate 节点 | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) 针对 esbuild serve 的跨域读取；当前项目使用迁移 CLI，不启动该 serve。另有 tsx/vite 使用已修复版本的 esbuild。 | P2 开发工具风险；不对外运行受影响 serve/studio。禁止 audit fix --force 给出的 drizzle-kit / eslint-config-next 跨代降级。 |

以上可利用性结论来自依赖树与调用路径审查，是风险判断，不是对所有上游攻击面的证明。公告以当前联网核验为准，发布前应重跑审查。

## 已执行验证与边界

- `tests/unit/security.test.ts`：7/7，含实际 JWT 到期、多场景同源、请求流大小、限流。
- `tests/unit/security-routes.test.ts`：5/5，验证真实 route 导出；认证/数据库用 mock 隔离，不称为 PostgreSQL 测试。
- `tests/unit/security-auth.test.ts`：1/1，调用实际应用 Credentials callback，Auth.js transport 和 bcrypt 成本使用明确 mock；真实 bcrypt 另由密码工具 3 项执行验证。
- 安全定向合计 13/13，FAIL 0、SKIP 0；`npm run lint`、`npm run typecheck` 已通过。全量 check/build、真实 PostgreSQL 和浏览器由总报告统一记录，本文不重复声称未执行的生产测试。

## 部署前必要条件和后续改进

1. 生产单应用进程运行；内存限流在进程重启后清零，不能作为多副本共享防护。反向代理对登录页所有 POST（含 Server Action）和 `/api/auth/*` 加请求频率、正文大小和连接超时限制。多实例时先增加共享限流，再扩副本。
2. Owner 生成高熵 `AUTH_SECRET`（至少 32 随机字节）和独有密码；禁止复用仓库测试秘密。配置 HTTPS 的 `AUTH_URL`，用代理覆盖转发头，仅受信入口能访问应用；PostgreSQL 不公开。
3. 当前 JWT 没有服务端会话撤销列表；退出只清浏览器 Cookie，已经被盗取的 token 可在自身到期前继续使用。改密码也不会自动撤销旧 JWT；紧急时轮换 `AUTH_SECRET` 并重启应用使旧会话失效。单人自用可接受，多用户/高风险场景再评估会话表及 MFA。
4. 更严格的 nonce CSP、持续依赖扫描、共享限流和集中安全告警列入 V1.1。当前配置及测试不替代生产渗透测试或基础设施审计。

本阶段未执行生产部署，`PRODUCTION_DEPLOYMENT=NOT_AUTHORIZED`。
