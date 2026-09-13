# 共治开发状态（唯一看板）

依据：用户提供 v3.0 集成方案与 v2.0 任务表。初始基线 main 5a8c2405f8e5a2b1ccd78aca7406d8fa04f6a866，仅 LICENSE，干净；远端相同。技术栈按 v3.0。总控仅文档与验收。

| 轨 | owner / 分支 | 交付 | 依赖 | 验收 / 状态 |
| --- | --- | --- | --- | --- |
| C | Core / gongzhi-core | Crier 固定 SHA 导入、统一接口、身份/公告/版本/采纳/撤回；唯一根配置与迁移 owner | 初始集成基线 | 004404e 已 push；46 项含真实 PG 测试零跳过、typecheck/build 通过；原 Agent 保留返修 |
| D | Connect / gongzhi-connect | 外部 REST 样例、知乎薄适配、AI SDK 平台助手 | C 契约与服务接口 | 97d9189 已 push；65 项通过、1 项 DB 跳过；原 Agent 保留返修；模拟模型验证，不是 live 调用 |
| B | Frontend / Builder 独立候选 | 三入口、星群、三示例故事、表单/详情、MSW、助手请求/查询/取消 | C HTTP 契约与锁定 UI 依赖 | 3d57b68e61dfc4fadc101bb9551e353f2171b30b 已 push；5 项 HTTP、10 项浏览器旅程、2 项本地虚拟 Auth UI 测试及 typecheck/build 通过；原 Agent 保留返修 |
| I | Integration / integration/gongzhi-mvp | 小步合并、最少装配、核心端到端验收 | 每批已提交 SHA | 实现 19aeb6cab95021d1d5c1a5ca967b097ff32d4398 验收通过；ca531b132a26e507b583369c9191aacfd7bba27f 已 push；后继仅合入本管理记录；沿用原 Agent ctx_e2e547b978a0 |

精确 write_paths 见 AGENTS.md。全局样式 B；共享类型、依赖、锁文件、迁移 C。I 不改领域代码。各轨从统一集成基线开始，后续按 SHA 同步。

交付范围：完整可操作前端已完成。可发布需求和独立经验，修改/撤回需求，接入/撤销示例 Agent，查看产物与精确经验版本并由人采纳；星图与列表同记录，图不可用时仍可完成任务。示例故事必须显式触发预写帮助，新需求不会自动得到模拟回应。平台助手的真实请求/查询/取消 UI 已接统一契约，真实能力缺配置时明确不可用。

本地体验：<http://127.0.0.1:3019/>，选择“探索示例星群”。最终 Next PID 79920 只监听 loopback；数据库、Auth、助手开关默认关闭。真实空间展示不可用原因，不返回示例成功。

统一版本实际检查（细节与复现环境见 [集成验收](docs/integration/acceptance.md)）：

| 检查 | 结果 |
| --- | --- |
| `npm run build`，完成后 `npm run typecheck` | 均退出 0 |
| `npm test`，启用 Core 专用 PG 与本地 HTTP | 101 通过、0 失败、1 个独立套件跳过；下一命令单独覆盖该套件 |
| `node --test tests/integration/live-http.test.mjs`，只启用 I HTTP DB 开关 | 7/7；真实 Next HTTP + PG，双身份/外部 key、越权与撤销、版本、幂等、服务重启持久化 |
| `node node_modules/playwright/cli.js test --config tests/integration/playwright.config.ts` | 桌面/窄屏 8/8；三表单、三故事、草稿、模式隔离、图降级 |
| `node node_modules/playwright/cli.js test --config tests/frontend/playwright.config.ts journeys.spec.ts` | 集成分支复跑 10/10，含实际星点/连线、缩放/平移、响应丢失安全重试 |
| 总控独立体验与审阅 | 前检查点自然入口→发布新需求仍待回应→真实 503 且无 SW 控制通过；最终桌面/窄屏 ready 图审阅通过；最终保留服务首页 200、中文标题及 live 503/unavailable 再次核实 |

六项验收：完整示例、模式隔离、版本与重复已通过；身份/REST/MCP 已有本地测试证据，云 Auth 未验证；真实帮助与公网体验尚未验证。B 另有 2 项虚拟 Auth/拦截 HTTP 的助手 UI 测试，属于分支测试证据，不算集成环境真实模型调用。最终截图及报告保留在 Git 外 `C:\Users\DW\AppData\Local\Temp\gongzhi-browser-I-20260913-final`。

当前限制：已创建本项目专用 localhost PostgreSQL 17，10 个迁移与业务测试真实执行；Supabase 身份校验使用本地 HTTP stub，未验证云登录；模型、知乎和公网部署未执行。此次交付属于任务文档的 A 可操作前端及已验证本地后端模块，不能宣称 B 真实模型协作或 C 公网参赛候选版完成。

待资源与授权具备后：用本项目 Supabase 账号、模型/知乎凭据及明确预算验证一次真实帮助，再验证公网部署与测试账号。未新增付费服务、扩大权限、执行生产迁移或正式赛事提交；无真实用户试用反馈。main 保持原提交，最终交付在已推送的统一集成分支。

资产核验：front-asset 核验提交 36595a1ede56cae84f4cf2c4ccc4abcefa6a9932；owned/hero/README.md 明确银河原图 reference-only，第三方再分发许可未确认。B 已用原创 CSS 夜空与山体剪影，无第三方图片和外网字体。


决策：开工时主仓、远端与同仓会话均无前端或 Builder 已开工代码，按用户授权创建独立 Frontend 候选轨；后续 Builder 既有成果仍需先交接。全程使用本机 Orca CLI、独立 worktree/分支及互斥写域，最多三名运行 Worker；集成检查点后续接同一原 Agent。原工作分支与 Agent 保留，main 未合并或改写。
