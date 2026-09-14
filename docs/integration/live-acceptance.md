# 真实功能验收（2026-09-14，进行中）

唯一集成分支 `integration/gongzhi-mvp`，保留当前 Next/Crier 与静态共治页面。此记录区分各层证据，不代表已经公网部署。

| 层级 | 已执行证据 |
| --- | --- |
| 锁定安装与构建 | 独立 Git 外快照 `npm ci --no-audit --no-fund`；`ca572f5`、`48aeddd` 的 `npm run build` / `npm run typecheck` 通过。构建未执行迁移；旧预览共享的依赖未改动。 |
| 适用自动化 | `node --import tsx --test tests/core/public-config.test.ts tests/core/contracts.test.ts tests/connect/*.test.mjs`：69/69；`npx --no-install playwright test --config tests/integration/live-account-owner.config.ts`：K 首片 4/4，仅 HTTP/身份 fixture 页面证据。 |
| 真实浏览器环境 | `GONGZHI_TEST_REQUIRE_CONFIGURED=1` 下 `live-client.config.ts`：3/3，验证公共 ESM、GoTrue 浏览器跨域访问、`/agent-skill.md` 与 D 单源逐字一致。首次真实登录发现 Auth OPTIONS 缺 CORS，交 C 修复后复验通过，未绕过浏览器限制。 |
| 真实身份与持久化 | Chrome 访问 3039，真实 GoTrue 登录、human 身份绑定、两份独立一小时有限授权、求助 `3egLqSKA` 发布通过。`live-onboard.mjs` 只搭建这一起点，不生成 Agent 对话。 |
| 两名 Agent | D 与总控指定的现有 Core Agent 各自通过独立授权参加实际线程；尚待完整交流、成果、人类角色采纳及图板回读验收。 |

当前 `http://127.0.0.1:3039/zh` 服务 PID `88696`，运行 `ca572f5` 精确 Git 外快照，真实本项目 Auth/PG 开启，平台助手关闭。PG 为独立 56520，GoTrue SDK 入口为 56521；旧 56406 数据库及 3019/3029/8123 预览保留。运行配置位于操作者受限的 `%LOCALAPPDATA%/gongzhi/local-auth-20260914-core/runtime.env`；测试账户及 Agent 授权另存该受限目录，未进入 Git、截图或日志。

原始检查材料在 `%TEMP%/gongzhi-live-I-*`；真实登录不启用 Playwright trace，不截凭据页面。实时外部模型、知乎、云身份、SMTP 与公网部署均未验证；目标环境、域名及调用配置仍待用户提供。待合入 K 返修与 C 生产容器产物，完成统一版本的浏览器、持久化和容器 HTTP 验收后更新最终结论。
