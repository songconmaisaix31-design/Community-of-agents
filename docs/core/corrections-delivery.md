# Core C 纠偏交付（2026-09-13）

分支 `songconmaisaix31-design/gongzhi-core`。开始时工作树干净，合入统一基线 `2a0b5617b5dc5030894bde6541ddcb6bc469c24a` 与管理提交 `15d92c5d502fefc26e03101d7f6f6e5296d2f6bf`。仅在 C 域实现；B/D 源通过原作者提交合入验证，没有代改前端、连接轨或集成测试。

交付与逐批已 push 的源码提交：

| 提交 | 内容 |
|---|---|
| c5d3e83 | 唯一共享公告、Agent 图、有限授权/登记 DTO 与 HTTP 客户端，先交 B/D 消费 |
| 6a886b7 | 服务端授权、自登记、Agent 代发、公告/讨论、Agent-only 图、REST/MCP 共用校验与 0011 |
| 2a0078f | Hugo 根构建、Next 同源静态托管和 demo 拒绝优先规则 |
| 69e43fc | 保留上游裸 SQL 重入检查，新增实际 runner 账本重入和数据库权限/不可变探针 |
| d7a8a6b | 合入 B e0f7ca0 的 Hugo 源用于完整构建及实际 HTTP 验证 |
| fee586b | 新增 0012 修复生成列误判，扩展七类不可变公告与经验讨论回归 |

核心文件：`lib/gongzhi/contracts.ts`、`api-client.ts`、`identity.ts`、`authorization.ts`、`bulletin.ts`、`service.ts`、`http.ts`、`lib/mcp.ts`；新增迁移 0011/0012；`tests/core/corrections-database.test.ts`；根 package/Next/ignore/README 与 `scripts/hugo.mjs`、迁移检查脚本。根依赖版本与锁文件无变更，0001–0011 已应用历史未改。

公告沿 Crier Post/Publisher/parent_id/metadata，稳定记录、线程与直接回复引用，服务端从 Publisher 绑定推导 speaker/human owner。图仅 external_agent/platform_agent 节点，边来自双方可回读的公开交流；人、内容、共现、标签和采纳不生成交流边，隐藏/私有/demo/跨线程记录被过滤。历史保留，回复/补充/经验/成果原文不可覆盖。

授权人用已有 Supabase getUser 验证身份后授予有限 scope，Agent 用 grant 自登记并首次取得独立 Crier key；同键响应丢失核对不重新发钥，异文冲突，owner/scope 不可自报扩权，撤销后旧 actor 与旧凭据不能写。明确获得 publish_need 的 Agent 可代发，修改/关闭/采纳仍只属于人类所有者，版本和幂等约束保留。

验证：

- `npm run typecheck`：通过。
- `npm run build`：Hugo Extended 0.164.0 + Next 完整构建通过，不执行迁移。
- 合入 B 源后的 `npm test`：89 通过、7 条件跳过；默认未提供 DB/HTTP 配置，未将跳过记为通过。
- C 独占本地 PG 时 `GONGZHI_TEST_DATABASE_ENV=<本项目配置> npm run test:core`：56/56；跨线程图过滤补测 10/10。0012 后 I 在其独占时段完成包含 Core PG 新增经验讨论回归的串行 Node 全套：129 通过、0 失败、1 独立 HTTP 条件跳过；另外实际 HTTP/SDK/MCP/PG/Hugo 浏览器套件 8/8 通过（Orca msg_c64ec6383074，I 集成提交 41393ff）。
- 实际 Next HTTP 验证：`/`、`/demo/space`、`/network` 响应逐字等于生成的 Hugo HTML，同源脚本 200，`/demo` 307 跳转保留；`GONGZHI_TEST_BASE_URL=http://127.0.0.1:3147 node --import tsx --test tests/integration/http-mode-isolation.test.ts` 为 9/9。已停止测试服务器。
- 新公告/图/线程/记录端点缺 DB 时 503 unavailable，未绑定授权 401，无 fixture 回退。
- I 实际迁移回执：新空 scratch 库上原八份 SQL 两遍、实际 runner 12/12、第二次 no-op、scope/RLS/浏览器权限与七类不可变历史探针均通过；app 库显式应用 0012。详见 [迁移检查](migration-check.md)。

限制：本项目专用本地 PostgreSQL 已验证；Supabase 身份测试使用明确的本地 HTTP stub，云 Auth、付费模型、知乎云端、两名真实外部 Agent 交流均未声称通过。图只返回最新 1000 条公开交流边；公告/线程 cursor 是历史倒序翻页，不是增量订阅。原失败 scratch 库及成功 scratch 库保留由集成轨管理，未删原库；未调用其他项目服务、未运行生产迁移、未公开部署。I 回执确认无其他 Core 领域问题，Builder 图布局与 I 最终可视复验仍按其写域继续，不作为 Core 服务已替它们完成的声明。
