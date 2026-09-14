# 知乎网页登录契约

本轮只替换网页登录入口，保留 PostgreSQL、现有 Supabase Bearer 校验和有限 Agent 授权。官方协议依据用户给定 CLI 包的 `hackathon-oauth.md`、`oauth.md`、`hackathon-user-profile-api.md`，由 Connect D 维护上游适配器。

前端唯一契约为 `lib/gongzhi/contracts.ts` / `api-client.ts` / `browser-auth.ts`。`PublicAuthConfig` 保留 `available/url/public_key`，新增 `provider: "zhihu"`、`endpoints`；知乎模式下 url/public_key 均为 null，缺项目配置时 available=false，禁止转回邮箱登录。

| 入口 | 客户端方法 | 行为 |
| --- | --- | --- |
| POST `/api/gongzhi/auth/zhihu/start`，JSON `{}` | `startZhihuLogin()` | 返回 `WebLoginStart {authorization_url}`；同源浏览器请求，设置短时 HttpOnly state 绑定 cookie |
| GET `/api/gongzhi/auth/session` | `readAuthSession()` | 返回 `WebSession {user: WebUser|null, expires_at: string|null}`；匿名/失效为 null，不返回凭据 |
| POST `/api/gongzhi/auth/logout`，JSON `{}` | `logout()` | 撤销当前会话，返回 `{signed_out:true}`，同源校验 |
| GET `/auth/zhihu/callback` | 浏览器跳转，不由 JS 交换 code | 校验并消费 state，后端交换与读取用户；303 到 `/zh?auth=success` 或 `auth=cancelled/invalid_request/unauthenticated/unavailable/upstream_failed`，不转发原始 query 或错误 |

`WebUser` 为 `{id,provider:"zhihu",name,avatar_url}`；id 是站内稳定 UUID，不能将 provider uid、昵称或邮箱当 owner ID。登录后沿用 listOwners/bindOwner，owner/speaker 仍由服务端推导。所有响应 no-store，API 客户端沿用 same-origin cookies；不得拿 getAccessToken() 判断是否已登录。

BrowserAuth 保留 available/initialize/signOut/getAccessToken/onChange/dispose，新增 `startSignIn(): Promise<void>`：请求 start 后浏览器前往 authorization_url。initialize/onChange 提供用户状态；知乎模式 getAccessToken() 恒为 undefined，旧 signIn(email,password) 不提供知乎登录。SDK负责退出/回调跨标签同步，不在 localStorage 存储用户或凭据。

服务端变量仅 `ZHIHU_OAUTH_APP_ID`、`ZHIHU_OAUTH_APP_KEY`、`ZHIHU_OAUTH_REDIRECT_URI`；准确 callback URL 须与用户登记地址一致，公开服务必须 HTTPS。缺配置保持 unavailable；实际 OAuth 需用户亲自确认，本轮 fixture/本机 PG 检查不代表知乎授权成功。

`0015-zhihu-web-sessions.sql` 只新增应用用户、永久 provider 标识关联、state 摘要及 session 摘要表，不修改旧 Supabase/owner/history。state 10 分钟且绑定浏览器随机 cookie，session 有效期为交换起点加可信 expires_in 与 8 小时上限的较小者；只登录时 token 在读取 /user 后即丢弃。uid/hash 缺失再补齐沿同 UUID，冲突拒绝，昵称/email 不参与映射。

start/logout 必须同源 POST application/json 空对象，流读取最多 1024 字节；cookie 始终 HttpOnly/Secure/SameSite=Lax/Path=/，不降级公网 HTTP。退出会撤销 session 与在途登录；新 start 取消该浏览器旧流程。state 在上游请求前已消费，未知回调不能复用 code/state，应用户主动重新登录。SDK在焦点、BFCache pageshow、跨标签事件和每分钟回读，失联或过期不保留可写身份；localStorage只含刷新信号，不含用户/凭据。

所有 cookie REST 写入在服务端要求精确配置 Origin，并通过同一 session 行锁串行化写入/退出。runs 仍由 Core identity 守卫核验 Origin/期限/撤销；MCP 保持 header-only，cookie不能代替 MCP Bearer。坏/空显式凭据不会回落到 cookie。

本机验证使用原 Core 专用 `core-test.env`，目标仅 `127.0.0.1:56640/gongzhi_core_test`，先核对 `gongzhi-fulltest-c-20260914-db-1` 与 URL/角色，再显式 `node --env-file=<Core私有路径> scripts/migrate.mjs`。迁移不在 build/start 执行。设置 `GONGZHI_WEB_AUTH_TEST=true` 后 `node --env-file=<Core私有路径> --import tsx --test tests/core/web-auth-live.test.ts`：真实 PG + 明确注入的官方响应 fixture，**不是实际知乎授权**。旧 GoTrue 测试单独运行，不能当作知乎证明。

隔离浏览器集成可直接复用 `handleWebAuth(request, action, upstreamFetch)` 的函数参数测试缝：仅测试 runner 注入 fetch，生产路由不接受测试参数/env/header 开关。先 POST start 获取服务端 cookie，测试浏览器保持同一 cookie 跳转 callback（authorization_code/state），后续 session、业务 REST 全部经真实 PG；同进程 runner 可衔接 handleGongzhiRequest。不要用浏览器 addCookies 伪造已登录身份。F/I负责自己的测试 runner，C不改集成或前端路径。

代码就绪不代表线上授权；用户项目 AppID/AppKey/准确 redirect 尚缺，保持 unavailable。实际公网 HTTPS 和用户亲自确认、真实 /user 返回仍未验证；本轮不迁移 3079 主库或部署云。
