# Admin

负责人工收录、审核发布、修订归档及 AuditLog。Phase 2 使用 Auth.js Credentials Provider 支持单一管理员账户；凭据来自 `ADMIN_EMAIL` 与 `ADMIN_PASSWORD_HASH`，没有默认密码和公开注册。

页面、Server Action、Route Handler 都在服务端检查管理员会话。活动、攻略、规则版本和来源写入 PostgreSQL，关键变更写入 `audit_logs`。公开查询只选择已发布内容，草稿、撤回和归档由后台查看。
