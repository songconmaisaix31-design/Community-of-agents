# 共治四点纠偏增量验收

2026-09-13，`integration/gongzhi-mvp`。本轮实现与测试检查点 `90b5402d06da7b55ee727a11d8d8bf8db7d223bf`，基于旧版 `2a0b561`，统一 C `10bc149`（源码 `fee586b`，含 0012 修复）、D `0cd2255`、B `c546dc2` + 最后 CSS `7062baf`、管理 `9971a7b`。旧星图验收不能替代本轮 Agent-only 星图与公告板验收。

| 实际命令 / 层次 | 当前结果 |
| --- | --- |
| `npm run build` | Hugo 0.164.0 extended + Next 15.5.25 统一构建通过；不运行迁移 |
| `npm run typecheck` | 通过；在 build 后独立执行 |
| `node --import tsx --test --test-concurrency=1 'tests/**/*.test.ts' 'tests/**/*.test.mjs'` | 已启用 Core 专用 PG 和 localhost HTTP：132 pass / 0 fail / 1 skip；I HTTP PG 项另起进程 |
| `node --import tsx --test tests/integration/live-http.test.mjs` | 8/8 通过；实际 Next + PG + D 客户端 + MCP，并用 Chrome 桌面/窄屏读取同批持久记录，90 Agent / 59 交流边实际图可见 |
| `node --env-file=<Git外scratch-correction-v2.env> scripts/check-migrations.mjs` | 新空库上游八份 SQL 两遍、实际 runner 12/12 首次应用、重入 no-op、账本时间不变、scope/RLS/七类不可变公告正文与 metadata/计数更新均通过 |
| `node --env-file=<已授权database.env> scripts/migrate.mjs`，显式启用 DB | 原 app 库只应用新 0012 成功；未重建原库 |
| `npx --no-install playwright test --config tests/integration/playwright.config.ts hugo-acceptance.spec.ts` | 统一分支桌面/窄屏 8/8 通过；测试选择器问题已修复 |

I 另在统一分支执行 `npx --no-install playwright test --config tests/frontend/playwright.config.ts`，B 当前 Hugo 15/15 通过，包括原生点/线点击、68节点两尺寸分布、平移缩放后刷新/增量保持镜头、运行中 WebGL 丢失、三故事/五类公告、响应丢失后的防重。拦截 HTTP 的浏览器用例只证明本地界面行为，不计作真实服务执行。

HTTP/PG 实际覆盖有限授权、无档案默认登记、一次凭据及幂等回执、自报 owner/scopes 拒绝、capabilities 不扩权、服务端 owner/speaker、Agent 代发、求助/经验/回复/补充/成果同一公告集合、Agent-only 唯一节点与原始交流证据、REST/MCP 一致拒绝、撤销、旧版采纳拒绝、重启持久化。Chrome 真实空间直接读取上述程序化产生的 PG 记录，未用 MSW 或 fixture。

数据库测试必须串行：先设置 `GONGZHI_TEST_DATABASE_ENV` 与 `GONGZHI_TEST_BASE_URL=http://127.0.0.1:3019` 跑全套；随后移除 `GONGZHI_TEST_DATABASE_ENV`，设置 `GONGZHI_TEST_HTTP_DATABASE_ENV` 跑 I HTTP 套件。两个开关不可同时设置；`--test-concurrency=1` 必须位于文件模式前。根依赖和锁未变化，复用此前 `npm ci` 安装，无重复安装。

本轮迁移检查实际发现生成列 tsv 导致 BEFORE UPDATE 误判的问题，退 C 后由新增 0012 修复，未改历史迁移。失败 scratch 库保留；第二个唯一空库 `gongzhi_migration_1789313063691_44bfc8a7` 完成重入检查，原库及记录保留。

本地体验：<http://127.0.0.1:3019/> 为 Hugo 入口，页面进入 `/demo/space`；真实 `/network` 默认关闭服务并明确报错。最终自有 Next PID `64720` 仅监听 127.0.0.1，数据库/Auth/助手/遥测均关闭。专用 PG 容器 `gongzhi-integration-73b8bb40-8d6` 保留在 127.0.0.1:56406，PG17.11/vector0.8.6，原库已应用12迁移。凭据只使用获授权 Git 外配置，不在报告中包含连接值。

来源复用见 `docs/frontend/HUGO-SOURCES.md`：my_blog `7d1f825a72bd106ff73525e7232dcb292b91b51c` 自有 partial/样式及 We Remember `678ea3fee7479d48df0e54349615184ad760fdae` 页面结构/样式，随站点保留两份 MIT 许可；没有复制 GPL Stack 主题。I 逐字核对两份 LICENSE、原始 :root 样式块及 favicon partial（只替换本项目图标路径），并逐字比对三个产品 URL 与本地 Hugo 生成 HTML 一致。

Git 外证据：`C:/Users/DW/AppData/Local/Temp/gongzhi-hugo-I-final`（8/8 浏览器报告/截图），`C:/Users/DW/AppData/Local/Temp/gongzhi-hugo-I-real-pg/` 下 `actual-agent-graph.png`、`actual-agent-graph-narrow.png`、`actual-public-records.png`、`actual-public-records-narrow.png`（真实 PG 图及同批公告）。工具沿用 Node24.16.0/npm11.13.0、Playwright1.63.0/Chrome152.0.7977.83。

限制：Supabase 为本地 HTTP stub，真实云 Auth、收费模型、知乎均未验证；示例预写内容不代表 Agent 执行。此轮是已实现接口与本地程序化联通验收，免手填档案的真实用户接入和两名真实模型 Agent 交流属于下一轮。未公开部署、未执行生产迁移、未赛事提交。实际 PG 多 Agent 点过密问题已退 B，由 c546dc2 修正原生 Cosmos 坐标/参数后闭环；I 已审阅实际 PG 90 Agent / 59 边桌面及全新390窄屏图。总控已通过多节点布局审阅；本轮实现验收通过，最终管理收口见 DEVELOPMENT.md。

完整 Node 测试输出保存在 Git 外 `C:/Users/DW/AppData/Local/Temp/gongzhi-hugo-I-node-final.log`。所有生产构建均关闭 DB/Auth/助手与遥测；迁移另在明确授权的专用数据库中显式执行。

总控最后要求的列表 CSS 已合入 `c6814aa`：`npm run build:hugo` 通过，并安全重启本项目预览。I 另起临时 loopback 服务，只读实际 PG 91 Agent，在390宽验证列表 clientHeight150 / scrollHeight1241、连续 Tab 到末项后 Enter 定位、滚动到底、公告标题及线程可达、无横向溢出、无 SW 控制，全部通过；临时服务已停止。截图为上述真实 PG 目录的 `bounded-agent-list-narrow.png` 和 `bounded-board-narrow.png`。按总控要求，此 CSS 后继未重复不变的后台/迁移全套。
