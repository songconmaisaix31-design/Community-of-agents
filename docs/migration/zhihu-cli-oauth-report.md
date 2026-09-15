# 官方 zhihu-cli 与 OAuth 接入报告（2026-09-15）

本报告记录将官方 zhihu-cli 能力与 AI 原生知乎 OAuth 登录配置进韩国共治部署、并核验网页登录入口的过程。承接韩国迁移（`docs/migration/korea-migration-report.md`，分支 `songconmaisaix31-design/gongzhi-korea-migration-deepseek`）。凭据均未输出。

## 事实源

- 官方资料包 `zhihu-cli-skill-0.7.2-beta.20260911131715 (3).zip`（本机 Downloads，SHA256 `7408ea4cb339c27294c3d664ac2f8c14b21b30c24b2bfb82dc0bd86d78443fb2`，65535 bytes）。
- 已部署后端 f9a0b33 已含 OAuth 实现（`lib/gongzhi/zhihu/oauth.ts`、`web-auth.ts`、`web-session.ts`、`web-auth-config.ts`）。
- 2026-09-15 实测公网 `https://zhihu.davidwang.space/api/gongzhi/config` 返回 `auth.available=true`、`provider=zhihu`（配置就绪，非真实授权）。

## 官方技能与 CLI 安装

- `run.ps1 status` 首查：CLI 已安装于 `C:\Users\DW\AppData\Local\ZhihuCLI\current\zhihu-cli.exe`，版本 `0.6.0-beta.20260908125143`，满足 Skill 最低版本（同值），`compatible=true`。
- CLI `auth.status`：`source=keychain`、`configured=true`、脱敏值 `b9a5...f334`、`last_verified_at=2026-09-14T18:25:37Z`（本机已有 Access Secret，另属一套凭据，非 OAuth 前置）。
- 技能目录安装至 `~/.agents/skills/zhihu`（SKILL.md、manifest.json、references/、scripts/ 完整；ZIP SHA256 与官方 manifest 一致）。安装后 `run.ps1 status` 返回 `installed=true`、`next_action=ready`。
- CLI `capabilities`（版本 0.6.0）记录：`search zhihu/global`、`hot`、`answer`（zhida-fast-1p5 / zhida-thinking-1p5 / zhida-agent）、`question recommend/answers`、`me contents/followees/favorites*/content/comments/stats/content-stats`、`knowledge bases/items/search/upload`、`quota`。均为官方 HTTPS 发布源，未提交任何二进制、凭据或个人数据。

## OAuth 配置核对（韩国，不输出密钥）

- `app.env` 含 `ZHIHU_OAUTH_APP_ID`（长度 5）、`ZHIHU_OAUTH_APP_KEY`（长度 34）、`ZHIHU_OAUTH_REDIRECT_URI`，均为非空。
- redirect_uri = `https://zhihu.davidwang.space/auth/zhihu/callback`，与登记回调路径 `/auth/zhihu/callback` 完全一致（回调路由存在：`app/auth/zhihu/callback/route.ts`）。
- CLI Access Secret 与 OAuth App Key 为两套独立凭据，分开存放、分开审计；本报告不把两者混同。

## 网页登录入口核验（韩国回环 127.0.0.1:8080）

- `/api/gongzhi/auth/session` GET：`{ok:true, data:{user:null, expires_at:null}, mode:"live"}`（未登录）。
- `/api/gongzhi/auth/zhihu/start` POST（空 body，同源 Origin）：返回 `authorization_url` = `https://openapi.zhihu.com/authorize?redirect_uri=…&app_id=771&response_type=code&state=<43 位随机>`；解析确认 scheme=https、host=openapi.zhihu.com、path=/authorize、redirect_uri host/path 与登记一致、含 `response_type=code` 与随机 `state`。
- `/auth/zhihu/callback` GET（非法 state + 伪 code）：303 → `/zh?auth=invalid_request`（state 校验拒绝，未交换 token）。
- `/api/gongzhi/auth/logout` POST：`{ok:true, data:{signed_out:true}}`。
- 前端 `gongzhi-client.js` 已接 `startZhihuLogin` / `readAuthSession` / `logout`，并校验授权 URL 的 origin/pathname；`account.js` 提供 `login`/`signOut`。登录入口（`/zh/connect/#account`）在公网 HTTPS 200 可用。
- 站内会话安全：短期随机 `state` + 浏览器绑定（`__Host-gongzhi_oauth`）、`__Host-gongzhi_session` HttpOnly+Secure+SameSite=Lax、state 原子一次性消费（`gongzhi_web_states` 单条 SQL 先消费后交换）、uid 以字符串无损解析（`hash:<hash_id>` 优先 / `uid:<uid>` 回退）。

## 未执行 / 真实阻塞

- **用户必须亲自完成最终授权**：在正常浏览器打开 `https://zhihu.davidwang.space/zh/connect/#account` → 登录 → 知乎授权页确认，完成 `authorization_code` 回调 → 服务端 token 交换 → 官方 `/user` 身份读取 → 建立站内会话。此项无法由 Agent 代做，也不可用终端生成的浏览器 state 冒充完整流程。
- CLI Access Secret 已配置（keychain，脱敏 `b9a5...f334`），但本报告未执行 `auth status --verify` 与 `me contents` 在线验收（会消耗接口额度，且任务核心为 OAuth 登录）；因此**不宣称内容 API 已验收**。如需内容 API 验收，需用户明确授权后再发起最小在线验证。
- 真实授权联调、真实知乎用户身份读取、退出后的会话失效验证，均待用户完成授权后回读确认；当前只证明配置就绪、入口可用、state/回调拒绝路径正确。
- 未读取创作列表/全文/关注/收藏等超出「登录最小身份」范围的数据；未调用模型或知乎内容接口。

## 提交

- 分支：`songconmaisaix31-design/gongzhi-korea-migration-deepseek`
- 迁移阶段提交：`0b774ca`（docs: complete Beijing to Korea migration and cutover），已 push。
- 本报告随下一步 commit 一并 push。
