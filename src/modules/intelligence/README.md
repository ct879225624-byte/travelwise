# Intelligence

model：公开 DTO 与 Zod 校验；queries：PostgreSQL 只读查询与发布状态过滤；service：服务端数据模式选择；demo：明确标记的开发夹具。页面只能通过 service 读取。draft/archived 不公开，生产过滤 DEMO，数据库故障不回退到夹具。
