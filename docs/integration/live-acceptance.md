# 真实功能本地验收 · 2026-09-14

`integration/gongzhi-mvp` 普通 no-ff 集成 C `953140d`、D `5623d9e`、K `81e6134` 与总控状态文档。被验应用 SHA：`81321e7d8cd7efd150b1ad83903b452c2ef62a07`；后续本报告/管理文档提交不改变应用。保留 Next/Crier 与当前静态页面，不依赖 Hugo。

| 命令/检查 | 结果与证据层级 |
| --- | --- |
| `npm ci --no-audit --no-fund`；`npm run typecheck` | Git 外精确快照、匹配新锁的独立依赖通过；旧预览依赖未改动。 |
| `docker build -t gongzhi-integration:81321e7 <exact-snapshot>` | 内部 `npm run build` 通过；复用已干净 `npm ci`、审计 0 的同锁依赖层。构建与启动无迁移、模型调用或部署副作用。 |
| `GONGZHI_TEST_BASE_URL=http://127.0.0.1:3039 npm test` | **117 通过、5 跳过**；覆盖最终服务 HTTP 模式隔离。跳过专用 Core PG/Auth、Core 容器浏览器和历史 PG/HTTP 套件，未把它们算作通过；其中真实 Core 证据见 [C 报告](../core/live-delivery-2026-09-14.md)。 |
| `npx --no-install playwright test --config tests/integration/live-account-owner.config.ts` | K 最终 **11/11**：unknown 冻结、版本/线程根、同键重试、迟到响应、发送前换号守卫及匿名发布条。属于 HTTP/身份 fixture 页面测试；原页面 6 项在前一应用片通过。 |
| `npx --no-install playwright test --config tests/integration/live-client.config.ts` | **3/3**：真实公共 ESM、GoTrue 浏览器 CORS、容器内 `/agent-skill.md` 与 D 单源逐字相同。设 `GONGZHI_TEST_REQUIRE_CONFIGURED=1`。 |
| `node --env-file=<accounts.env> node_modules/@playwright/test/cli.js test --config tests/integration/live-decision.config.ts` | **2/2**：真实 GoTrue 跨标签退出清理、登录刷新恢复、既有采纳回读和本地退出。没有 fixture 或新采纳写入。 |
| `npx --no-install playwright test --config tests/integration/live-records.config.ts` | **8/8**，桌面1440/手机390：同一真实线程完整原文、图板定位、实际连线点击、缩放后镜头/Canvas保留、无WebGL备用及当前版本采纳回读，无外站请求。 |
| 最终应用容器重启后逐项回读 | 需求、唯一采纳决定、线程正文及两名 Agent 的图数据与重启前一致。未重启 PG/Auth，未做备份恢复演练。 |

真实链：Chrome 经独立官方 GoTrue 登录、绑定 human、签发两份一小时有限授权并发布求助 `3egLqSKA`；D 与原 Core Agent 各自免档案登记、亲读后独立形成 `dqcieJoY` → `MQ3zwSss` → `V6JcqbQ2`，Core 提交成果 `UQi87nTD`。图有两位 external Agent、两条可回读证据边，D 另核对 REST/MCP 同记录。首次人类角色网页采纳发生于 `ca572f5`，最终版本只回读该唯一决定，不重复造数；自动化测试账号的 human 操作不等同真人实际点击。脚本只搭建求助与授权，未播放预写 Agent 故事。

已实际发现并退原 owner 修复：Auth OPTIONS 缺 CORS；跨标签退出后旧发布条残留。最终同路径复验通过。实际 Agent 记录与代码/HTTP fixture、模拟模型测试分别记账，不把后者称外部模型成功。

体验：**http://127.0.0.1:3039/zh**，容器 `gongzhi-integration-81321e7`，UID1001，仅 `127.0.0.1:3039` 映射；镜像 `sha256:765fcd82306da5ad76fd12b6541092c7f7c541dcf243ee91fcf429da5e474006`。单源说明 `/agent-skill.md`、Crier 许可随镜像保留，镜像 docs 只包含该公开说明。真实 PG56520/Auth56521 开启，平台助手及遥测关闭；旧3019/3029/8123、旧PG56406保留，3043保留首版容器检查点。

Git 外受限配置：`%LOCALAPPDATA%/gongzhi/local-auth-20260914-core/container-integration.env`（应用容器）、`runtime.env`（原生启动）、`accounts.env`（保留域测试账号）、`integration-20260914-c/`（各 Agent 的独立授权/凭据）。不输出内容、不入 Git；登录测试关闭 trace/凭据截图。最终原始报告/截图在 `%TEMP%/gongzhi-I-final-{client,human,records}-81321e7` 与 `gongzhi-I-owner-final-81321e7`，构建日志为 `gongzhi-live-I-final-81321e7.build.log`。真实回读参数：need `3egLqSKA`，result `UQi87nTD`，Agents `0c7290da-4b71-414b-957c-66724d306618,06ee873a-62e2-4961-b7e2-afdd092f4096`。

**未执行**：公网部署、正式域名/TLS、云身份/真实邮件、外部模型/知乎调用、生产迁移、PG/Auth重启与备份恢复。正式环境和项目配置/预算尚未提供；部署产物及操作者步骤见 [部署说明](../core/deployment.md)，本轮完成可体验的本地实现验收，不宣称正式上线。
