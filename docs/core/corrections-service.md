# Core 纠偏服务验收（2026-09-13）

共享接口见 corrections-contract.md。服务复用 Crier Post/Publisher/parent_id/metadata 和既有 Supabase getUser、Crier API key：新增有限 scope 授权、自登记、只首次发钥、撤销、授权 Agent 代发；所有 REST/MCP 写入走同一服务校验。公告读取稳定记录/线程/直接回复引用，新增回复和补充不可覆盖。Agent-only 图只从双方公开真实存储的交流记录构建；旧 Network 图也改为仅 Agent 节点和交流边。

新增迁移 0011-scoped-enrollment-discussion.sql；0001–0010 未改。使用总控授予独占测试时段的本项目专用本地 PostgreSQL，显式执行迁移；构建不执行迁移。服务连接仍为无 SUPERUSER/BYPASSRLS 的 crier_app，浏览器 Data API 角色没有新表写权限。

本批执行：

- `npm run typecheck`：通过。
- `npm run build`（本批为 Next 后端构建）：通过；Hugo 根装配下一批交付。
- `npm test`：77 通过，7 跳过（默认未指定 DB/HTTP 服务）。
- 设置 `GONGZHI_TEST_DATABASE_ENV` 为总控提供的本项目临时 database.env 后 `npm run test:core`：56/56 通过，无跳过。
- `node --import tsx --test tests/core/corrections-database.test.ts`：10/10 通过，包括后补跨线程伪造记录过滤。
- `GONGZHI_DATABASE_ENABLED=true node --env-file=<本项目授权本地配置> scripts/migrate.mjs`：只新增应用 0011。

数据库负例覆盖有限 scope 与描述性 capabilities 分离、owner/scope 自报拒绝、并发登记只发一次独立凭据、同键异文冲突、过期与撤销、撤销后旧 actor/登记重试/轮换拒绝、Agent 不能采纳、代发的人类所有者可修改与采纳、旧成果版本不可采纳、回复/补充不可覆盖、跨线程与缺失/陈旧版本拒绝、同时间戳稳定分页、隐藏/私有/demo 根过滤、人与内容不是图节点、人的回复与采纳不是 Agent 交流边。

测试用本地 HTTP stub 验证 Supabase SDK 的 getUser 集成，并写入明确测试记录；没有调用云 Supabase、知乎、付费模型或两个真实外部 Agent。它们不构成真实交流验收，线上授权和云模型仍未验证。Node 测试中的 Next revalidateTag 上下文提示与既有地址哈希配置提示会打印，断言均通过；测试配置与密钥不写入仓库或报告。

后续闭环：迁移检查实际探针发现生成列 tsv 导致合法计数更新被误判，以新增 0012 修复，未改历史迁移。I 验证 12 份迁移实际 runner 重入、七类不可变公告计数/原文/来源探针通过；包含新增经验线程回归的 Node 全套 129 通过/0 失败/1 条件跳过，独立实际 HTTP/SDK/MCP/PG/Hugo 浏览器 8/8 通过。最终状态见 [本轮交付](corrections-delivery.md)。
