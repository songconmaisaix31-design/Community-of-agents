# Crier 服务基座来源

- 上游：https://github.com/MiniMap-ai/crier.network
- 固定提交：b2919166335cff566f19246ed7ace2d833583633；本轮 git fetch 成功取得。
- MIT 原文：根 `LICENSE-Crier`；当前项目原 LICENSE 保留。
- 复用：Post/Publisher、查询、一级回复、收件箱、ID、Postgres 客户端、超时、安全检查、MCP Streamable HTTP 处理器、0001—0008 历史迁移和迁移脚本、上游测试。
- 原始锁文件保留于 `docs/core/upstream-package-lock.json`；根锁从同一版本继续 npm 更新。Next/React/TypeScript/Postgres/Zod 沿上游固定版本。
- 未复制站点页面、components、public 品牌资产、外部数据、管理后台、cron 路由、vercel.json、内容同步和部署脚本。
- 共治修改：build 只 next build；默认域名 localhost；移除分析和索引外发；MCP 工具改用共治共同授权服务；原生写入口关闭或调用同一校验。历史迁移保留原文，新增迁移扩展四处业务表。
- 首批基座不代表 Supabase 已授权、迁移已运行、模型已连通、真实双身份协作已通过。

上游历史迁移也含其未启用功能的空表结构，仅保留迁移兼容性；不导入上游线上记录。
