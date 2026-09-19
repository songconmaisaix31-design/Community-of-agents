# 去知乎 + 换域名 Handoff（源码改动交原轨）

本文件是「域名改为 `agents.davidwang.space` + 去掉所有知乎元素」的源码改动交接单。由迁移工作树（`songconmaisaix31-design/gongzhi-korea-migration-deepseek`）整理，按 AGENTS.md 唯一文件所有权拆分到 Core C / Connect D / Frontend B/K3。**本工作树不改源码**；部署/配置/DNS 由我负责（见 `ops/migration/`），但依赖本单完成并重新构建镜像后才能落地。

## 目标

1. 域名 `zhihu.davidwang.space` → `agents.davidwang.space`（**已硬编码进编译镜像**，必须改源码并重建）。
2. 去掉知乎 OAuth 登录入口（改为匿名浏览，无登录）。
3. 去掉知乎内容集成（search / question-answers / corpus / agent 工具）。
4. 去掉知乎品牌 UI（zhihu-theme.css、刘看山 kanshan、页面「知乎」文案）。
5. 数据/schema 去 zhihu kind（Source.kind、gongzhi_web_subjects provider 等）。

## 硬编码域名点（Core C 负责）

这些把 `zhihu.davidwang.space` 编译进了 runtime 镜像，不改会导致 `database-ssl.ts` 抛错、DB 连接失败。全部改为 `agents.davidwang.space`：

| 文件 | 位置 | 改动 |
|---|---|---|
| `infra/production/generate-env.mjs` | `:7` `productionDomain` | `"zhihu.davidwang.space"` → `"agents.davidwang.space"` |
| `infra/production/Caddyfile.https` | `:7` site block | `zhihu.davidwang.space` → `agents.davidwang.space` |
| `lib/database-ssl.ts` | `:6` 部署守卫 | `deployment !== "zhihu.davidwang.space"` → `"agents.davidwang.space"` |
| `scripts/migration-policy.mjs` | `:3` `target` | `"zhihu.davidwang.space"` → `"agents.davidwang.space"` |

同步更新引用该域名的测试：`tests/core/mcp-protocol.test.ts`、`tests/core/production-package.test.ts`、`tests/core/production-policy.test.ts`、`tests/integration/onboarding-target.test.mjs`、`tests/integration/pages-fixture.spec.ts`。

## 去掉登录（Core C + Frontend B/K3）

### Core C（后端）

| 文件 | 改动 |
|---|---|
| `lib/gongzhi/contracts.ts` | 删除 `WEB_AUTH_ENDPOINTS`（含 `/auth/zhihu/...`）、`PublicAuthConfig` 的 `provider:"zhihu"`/`endpoints`、`WebUser`/`WebSession`/`WebLoginStart`；`SourceSchema.kind` 去掉 `"zhihu"`；`RunExecutionLimits` 去掉 `max_zhihu_queries`；`Run.usage` 去掉 `zhihu_queries` |
| `lib/gongzhi/public-config.ts` | `auth` 块去掉 provider=zhihu / available / endpoints，仅保留 `database_configured` |
| `lib/gongzhi/web-auth.ts` | 删除 `handleWebAuth`（start/session/logout/callback）或改为始终匿名 |
| `lib/gongzhi/web-auth-config.ts` | 删除（OAuth 配置读取） |
| `lib/gongzhi/web-session.ts` | 删除或改为恒空会话（`user:null`） |
| `lib/gongzhi/browser-auth.ts` | 删除 |
| `lib/gongzhi/identity.ts` | 移除 zhihu provider 分支 |
| `lib/gongzhi/mcp-oauth.ts` | 移除 zhihu 相关 |
| `app/api/gongzhi/auth/zhihu/start/route.ts` | 删除 |
| `app/api/gongzhi/auth/session/route.ts` | 删除或返回恒空 |
| `app/api/gongzhi/auth/logout/route.ts` | 删除 |
| `app/auth/zhihu/callback/route.ts` | 删除 |
| `app/oauth/consent/page.tsx` | 检查并移除 zhihu 相关（该文件出现在 zhihu grep 中） |
| `app/api/gongzhi/config/route.ts` | 确认 config 白名单不再输出 auth provider |

数据层（新迁移）：新增一个 down/clean 迁移，删除 `gongzhi_web_users` / `gongzhi_web_subjects` / `gongzhi_web_states` / `gongzhi_web_sessions`（来自 `0015-zhihu-web-sessions.sql`），并去掉 `migrations/0009_gongzhi.sql:40` 的 `"zhihu_queries":0` 默认值（或新建迁移重置默认）。当前线上这些表全空，可安全清。

### Frontend B/K3（前端）

| 文件 | 改动 |
|---|---|
| `public/community/zh/index.html` | 去「知乎」文案、登录按钮、`zhihu-theme.css`、`kanshan.js`、刘看山 logo（`data-kanshan`/`kanshan-logo`） |
| `public/community/zh/board/index.html` | 同上 |
| `public/community/zh/connect/index.html` | 去「使用知乎账号登录」、知乎检索说明、登录按钮、kanshan |
| `public/community/zh/evolution/index.html` | 去知乎相关 |
| `public/community/zh/library/index.html` | 去知乎相关 |
| `public/community/assets/zhihu-theme.css` | 删除文件 |
| `public/community/assets/kanshan.js` | 删除文件 |
| `public/community/brand/kanshan/*` | 删除刘看山素材（computer/idle/sleepy/wave.gif） |
| `public/community/assets/account.js` | 移除「知乎登录」文案/流程，或整文件随登录入口下架 |
| `public/community/assets/gongzhi-client.js` | 移除 `startZhihuLogin` 等 zhihu 端点 |
| `public/community/assets/atlas-agent-catalog.js` | 所有「知乎 XXX 专家 Agent」名称去「知乎」前缀（约 50 处） |
| `public/community/assets/atlas-fixture.js` | 去「知乎登录」「非知乎原文」文案 |
| `public/community/assets/community.js` / `community.css` / `experience.js` / `evolution.js` / `landing.css` | 检查并去除 zhihu/知乎 残留 |

## 去掉内容集成（Connect D 负责）

| 文件 | 改动 |
|---|---|
| `lib/gongzhi/zhihu/http.ts` | 删除 |
| `lib/gongzhi/zhihu/search.ts` | 删除 |
| `lib/gongzhi/zhihu/question-answers.ts` | 删除 |
| `lib/gongzhi/zhihu/oauth.ts` | 删除 |
| `lib/gongzhi/agent/tools.ts` | 移除 `searchZhihu`/`readZhihuAnswers` 工具、`kind:'zhihu'` source |
| `lib/gongzhi/agent/execute.ts` | 移除 zhihu 检索提示词/`zhihu_queries` 计数/`zhihuAvailable` |
| `lib/gongzhi/agent/config.ts` | 移除 `createZhihuSearch`、`zhihuAvailable` |
| `lib/gongzhi/run-policy.ts` | 移除 `max_zhihu_queries` 与 `usage.zhihu_queries` 校验 |
| `lib/gongzhi/runs.ts` | 移除 `zhihu_queries` 累计 |
| `examples/agent/zhihu-method.ts` | 删除 |
| `examples/agent/zhihu-corpus.ts` | 删除 |
| `examples/agent/cli.ts` / `commands.ts` / `README.md` | 移除 zhihu 子命令/文档 |

测试同步删除/调整：`tests/connect/{zhihu,zhihu-answers,zhihu-corpus,zhihu-method,zhihu-oauth}.test.mjs`、`tests/integration/{zhihu-readonly.spec.ts,zhihu-readonly.config.ts,zhihu-method-cli.test.mjs,fixtures/zhihu-cli-fetch.mjs,oauth-browser*.mjs/spec.ts}`、`tests/core/{web-auth-*,mcp-oauth-live,public-config,browser-client-live,run-budget-live,run-policy}.test.ts` 中 zhihu 相关用例。

## 部署边界（我负责，不在本单源码范围）

- DNS：删除 `zhihu` A 记录、新增 `agents` A → `43.108.17.236`（韩国）。
- 韩国服务器：加载重建镜像、Caddy 域名切 `agents.davidwang.space`、Let's Encrypt 自动签发新证书。
- 验证真实 HTTPS + 匿名浏览。

## 交接前提与风险

- 重建镜像由 Core C（持有根依赖/锁文件/构建）完成，标签沿用 `gongzhi:*` 前缀但指向去知乎后的源码 SHA。
- 域名在 `database-ssl.ts`/`migration-policy.mjs`/`generate-env.mjs` 三处硬编码，必须与 DNS/服务器配置同批切换，避免中间态连接失败。
- 旧域名 `zhihu.davidwang.space` 用户要求「直接弃用」，不再重定向。
- 移除登录后站点为纯匿名公开读：board / agent-graph / 页面 / 公开 API 均无需登录；此前依赖登录的写入（发公告、签发授权、提交成果）会随登录一起不可用，属预期（用户选择「暂时去掉登录入口」）。

## 移交对象

Core C：硬编码域名 + 后端登录/schema + 根构建。Connect D：内容集成 + agent 工具 + 示例。Frontend B/K3：品牌 UI + 页面文案 + 登录按钮。
