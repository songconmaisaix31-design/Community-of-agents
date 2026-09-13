# 基座检查点验收

更新：2026-09-13。分支：`integration/gongzhi-mvp`。代码验收目标：`61bd1775c5d442ca7f8ced67f13d6ec3c4ebb648`，加本提交的两份 `tests/integration/*.test.ts`。初始基线为 `2e842b2`。

已合入 Core `c49bddb` / `f2f061c`、Connect `911c5a9` / `7d758ef`、总控 `c8a6796` / `5ec03dc`。总控将本次 Dispatch 收口为首批增量集成与基座检查点；Core `8777510` 和 Connect `eeee39e` 留待下一 Dispatch，前端尚未交付。**全量检查仍失败，不代表整体功能完成**。唯一进度看板仍为 `DEVELOPMENT.md`。

## 本机运行条件

| 实际检查 | 结果 |
| --- | --- |
| `node --version` | `v24.16.0` |
| `npm --version` | `11.13.0` |
| `pnpm --version` | `11.2.2`；项目实际沿 Core 的 npm 锁文件 |
| `git --version` | `2.47.0.windows.1` |
| `docker version --format '{{.Server.Version}}'` | 服务端 `29.5.3` 可达；专用测试容器见下文 |
| Chrome / Edge 文件版本 | `152.0.7977.83` / `153.0.4234.32` |
| 已缓存 Chromium headless shell 1234 | 使用独立临时 profile、`--disable-background-networking --dump-dom about:blank` 启动成功，退出码 0，返回空白 HTML |
| `Get-Command psql,pg_isready,supabase,playwright` | 均未在 PATH；不能据此认定机器没有数据库 |

项目本批已锁定 Playwright `1.63.0`，尚未对缺失的前端运行浏览器流程测试。未读取其他项目配置、日常 CLI 认证或密钥；未连接既有业务数据库、真实 Supabase、模型或知乎服务。

## 本批实际验证

| 实际命令 | 结果 |
| --- | --- |
| `npm ci --registry=https://registry.npmjs.org --no-audit --no-fund` | 两批锁定安装均退出 0；首次 SWC 下载 ECONNRESET 后原进程重试成功；未改全局 npm 配置 |
| `npm run typecheck` | 当前目标退出 0；首批 `PublicPublisher` 导入错误已由 Core `f2f061c` 修复 |
| `npm run build` | 当前目标退出 0，Next.js 15.5.25 构建完成；首批曾被上述类型错误阻断；脚本仅 `next build`，没有隐含迁移 |
| `npm test` | **退出 1**：两个上游文件的顶层 await 无法由当前 tsx/CJS 设置编译，Connect bridge 又重复登记 17 项；原报告 45 pass / 2 fail / 4 skip，不能据此声称独立用例全部通过 |
| `node --import tsx --test 'tests/integration/*.test.ts'`，设置 `GONGZHI_TEST_BASE_URL=http://127.0.0.1:3019` | **14/14 通过，0 skip**：5 项客户端隔离检查及实际 Next HTTP 的 demo 五方法拒绝、未知路由和真实 health |
| 直接 HTTP 请求 `/api/gongzhi/network`，服务关闭数据库访问 | 503、`mode=live`、`error.code=unavailable`，没有返回 fixture 成功数据 |
| 设置 `GONGZHI_DATABASE_ENABLED=true`，加载 Git 外测试环境后执行 `node scripts/migrate.mjs` | 退出 0，全部 10 个迁移已记录，本次无待应用迁移；未设置显式开关的首次命令被正确拒绝 |
| `node --check tests/integration/start-postgres.mjs`、`git diff --check` | 退出码 0 |

全量测试失败文件：`tests/core/upstream/db-timeout.test.ts`、`tests/core/upstream/side-writes.test.ts`。已退 Core 修复模块设置、Connect 删除 bridge；总控明确要求留下一 Dispatch 合入，不为此扩大本批构建目标。

## 保留的 localhost 入口

[http://127.0.0.1:3019/api/gongzhi/health](http://127.0.0.1:3019/api/gongzhi/health) 是 API 检查入口，根页面与 `/demo`、`/network` 尚无产品前端。实际启动命令：`node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3019`；进程 PID `59884`，系统监听检查确认仅 `127.0.0.1:3019`。启动设置 `NEXT_TELEMETRY_DISABLED=1`、`GONGZHI_DATABASE_ENABLED=false`、`GONGZHI_ASSISTANT_ENABLED=false`，用于验证未配置服务的准确错误，不代表真实读写或模型运行。进程保留供本地检查，未公开部署。

## 专用 PostgreSQL

总控追加授权后，`node tests/integration/start-postgres.mjs` 实跑退出 0。首次下载包装器空 stdout 处理失败发生在创建容器之前，修正后重跑成功。

数据库镜像为官方支持的 `pgvector/pgvector:0.8.6-pg17-bookworm`，镜像 digest `sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f`；实际 PostgreSQL `17.11`、vector `0.8.6`、pg_trgm `1.6`、unaccent `1.1`、pgcrypto `1.3`。来源：[pgvector 官方 Docker 说明](https://github.com/pgvector/pgvector#docker)。

专用容器 `gongzhi-integration-73b8bb40-8d6`，仅绑定 `127.0.0.1:56406`，使用同名前缀的独立数据卷。实测 `anon`、`authenticated` 为 NOLOGIN，`crier_app` 无 superuser / BYPASSRLS。Core 应用迁移后，本轨直接查到 10 条迁移记录，含 `0009_gongzhi.sql` / `0010_gongzhi_server_role.sql`，并复跑迁移确认无待应用项。随机凭据只在 Git 外临时配置，路径已交总控。

重建另一套隔离测试环境需先显式 `docker pull pgvector/pgvector:0.8.6-pg17-bookworm`，再执行上述脚本；每次生成新容器、新数据卷和随机测试凭据，不覆盖既有实例。脚本打印配置文件路径，不打印秘密；`MIGRATION_DATABASE_URL` 与 `DATABASE_URL` 分离。容器与数据卷按总控要求保留，未清理。

## 最少验收切片

| 切片 | 接收代码后执行的行为检查 | 当前状态 / 依赖 |
| --- | --- | --- |
| 可构建基座 | 排除 build 隐含迁移；锁定安装、typecheck/test/build | 安装、类型与构建通过；全量 test 有上述失败 |
| 完整示例与模式隔离 | 三入口、三故事、刷新与重置；只请求 `/demo/api/*`，未知示例 API 失败；整页切到真实空间后不受 demo SW 控制、不带身份与草稿；真实失败不回退 fixture | 未执行；等待 Builder SHA 与正式契约 |
| REST/MCP 与授权 | 两身份发布、读取、回复、采纳；伪造 owner、越权、撤销及未绑定原生写入均拒绝 | 本轨未执行持久业务链；后续 Core 数据库测试另验，Supabase 替身不能算真实登录 |
| 版本与重复 | 修改需求后旧结果不能被当前版本采纳；重复提交不产生重复有效结果；Agent 无采纳权 | 本轨未执行业务验收 |
| 受限助手与来源 | 去重、预算、超时/取消；当次新结果与来源可追溯 | 13 项知乎模拟传输及 4 项预算检查通过；SDK 提交留下一轮，真实模型 / 知乎未提供 |

复用 Core 确认的现有测试工具，只在 `tests/integration/**` 增补跨模块断言，不预写未发布的 URL 细节或对象字段。每次业务增量合并后重新执行锁定安装、typecheck/test/build 及该增量适用的最小用户流程；失败交回原 owner。

## 当前限制

- 当前只证明基座构建、客户端与实际 HTTP 模式边界；全量测试仍失败，不能宣布总体完成。
- PostgreSQL 扩展、角色和迁移已核对；本轨未验收双身份持久化、旧版本采纳、撤销、REST/MCP 越权和 run 事务。
- 缺少前端三故事、Service Worker 页面作用域/存储隔离、桌面/窄屏体验及真实用户反馈。真实 Supabase、模型、知乎和外部 Agent 全链未验证。
- 下一 Dispatch 复用原 Integration terminal，合入已交接修复及后续前端/连接增量再验收；没有公开部署、正式赛事提交或生产迁移。
