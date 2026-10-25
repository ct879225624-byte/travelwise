# Linux 自托管部署模板（非执行授权）
目标系统和实际配置均由 Owner 在独立变更中确认。本文件不含真实主机、账号、域名、端口分配或生产凭据。
使用 Node 24、PostgreSQL 17、独立低权限运行用户、loopback 应用/数据库端口及可信 HTTPS 代理。
在 Linux 独立执行 npm ci/build；standalone 应使用 server.js，并按已安装 Next 文档复制 .next/static，存在 public 时复制 public。
不复制 Windows node_modules/.next，不向运行包放 .env、数据库或运维原件。
新库需要经批准迁移及 db:init 参考字典，生产禁止 db:seed；正式内容由管理员审核维护。
应用环境从受保护的运行时配置注入。不得复用测试身份或导入开发/私人数据；先验收备份恢复、代理头、Secure Cookie、权限和回滚。
本次没有部署或改动原生产配置。实际目标、资源与发布窗口必须另行批准。
