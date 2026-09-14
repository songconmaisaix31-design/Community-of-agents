# 2026-09-14 全量本机回归

集成输入 `c1bbb32da585e65508fd9709193131d9ce7e4ec5`，Core 原分支普通
no-ff 合并，原工作区干净。保留当前 Next/Crier/静态前端，不恢复 Hugo。
本轮仅使用新项目 `gongzhi-fulltest-c-20260914`：应用 3079、PostgreSQL
56640、GoTrue 网关 56641，均绑定回环。创建前确认端口、同名容器/卷和
配置目录不存在；旧 3069 对话及其他项目资源不动。

Git 外配置目录为 `%LOCALAPPDATA%/gongzhi/fulltest-c-20260914`，继承当前
用户专用 ACL。配置、口令、token 与 Agent key 不进入本报告或 Git。
官方 GoTrue v2.196.0、pgvector 0.8.6/PostgreSQL17 和既有 nginx 镜像复用；
保留独立持久卷，不删除历史数据。账号均为保留域测试账号，不能证明自然人身份。
模型、知乎和 SMTP 不调用；本机管理员确认测试邮箱不代表公众注册/邮件可用。

## 首片：可重复选择隔离测试目标

历史 live-auth 和 browser-client-live 测试保留旧默认目标；新环境必须同时
设置 `GONGZHI_ISOLATED_TEST=true` 和完整 `GONGZHI_LOCAL_PROJECT`、PG/Auth/App
端口。缺字段、旧/错误端口、远程数据库、错误角色、非专用 Core 库或查询参数
均拒绝。`prepare-test-databases.mjs <private-dir> --isolated` 仅在已声明的新
PG 中创建 `gongzhi_core_test` 与 `gongzhi_migration_check`；原表/迁移不改。

已执行：配置/防误目标定向测试 4/4、typecheck 通过；新 DB/Auth/gateway
健康，主业务库和专用 Core 库分别显式应用 12/12 迁移。应用构建、全量 Node、
真实 Auth/PG、HTTP/MCP、浏览器客户端与迁移重入检查仍待本轮后续记录。
构建只在精确 Git 快照进行，不覆盖旧 `.next`，build/start 不运行迁移。

Integration 的 onboarding-live 固定目标适配交原 I，C 不修改其他轨测试。
K/I 账号与 Core 的三个测试账号分开，避免绑定/未绑定状态与人类采纳测试串扰。
