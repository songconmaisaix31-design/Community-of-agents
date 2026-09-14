# 知乎网页登录契约

本轮只替换网页登录入口，保留 PostgreSQL、现有 Supabase Bearer 校验和有限 Agent 授权。官方协议依据用户给定 CLI 包的 `hackathon-oauth.md`、`oauth.md`、`hackathon-user-profile-api.md`，由 Connect D 维护上游适配器。

前端唯一契约为 `lib/gongzhi/contracts.ts` / `api-client.ts` / `browser-auth.ts`。`PublicAuthConfig` 保留 `available/url/public_key`，新增 `provider: "zhihu"`、`endpoints`；知乎模式下 url/public_key 均为 null，缺项目配置时 available=false，禁止转回邮箱登录。

| 入口 | 客户端方法 | 行为 |
| --- | --- | --- |
| POST `/api/gongzhi/auth/zhihu/start`，JSON `{}` | `startZhihuLogin()` | 返回 `WebLoginStart {authorization_url}`；同源浏览器请求，设置短时 HttpOnly state 绑定 cookie |
| GET `/api/gongzhi/auth/session` | `readAuthSession()` | 返回 `WebSession {user: WebUser|null, expires_at: string|null}`；匿名/失效为 null，不返回凭据 |
| POST `/api/gongzhi/auth/logout`，JSON `{}` | `logout()` | 撤销当前会话，返回 `{signed_out:true}`，同源校验 |
| GET `/auth/zhihu/callback` | 浏览器跳转，不由 JS 交换 code | 校验并消费 state，后端交换与读取用户；303 到 `/community/zh/?auth=success` 或 `auth=cancelled/invalid_request/unauthenticated/unavailable/upstream_failed`，不转发原始 query 或错误 |

`WebUser` 为 `{id,provider:"zhihu",name,avatar_url}`；id 是站内稳定 UUID，不能将 provider uid、昵称或邮箱当 owner ID。登录后沿用 listOwners/bindOwner，owner/speaker 仍由服务端推导。所有响应 no-store，API 客户端沿用 same-origin cookies；不得拿 getAccessToken() 判断是否已登录。

BrowserAuth 保留 available/initialize/signOut/getAccessToken/onChange/dispose，新增 `startSignIn(): Promise<void>`：请求 start 后浏览器前往 authorization_url。initialize/onChange 提供用户状态；知乎模式 getAccessToken() 恒为 undefined，旧 signIn(email,password) 不提供知乎登录。SDK负责退出/回调跨标签同步，不在 localStorage 存储用户或凭据。

服务端变量仅 `ZHIHU_OAUTH_APP_ID`、`ZHIHU_OAUTH_APP_KEY`、`ZHIHU_OAUTH_REDIRECT_URI`；准确 callback URL 须与用户登记地址一致，公开服务必须 HTTPS。缺配置保持 unavailable；实际 OAuth 需用户亲自确认，本轮 fixture/本机 PG 检查不代表知乎授权成功。

本提交先冻结 DTO/客户端方法，服务端路由、BrowserAuth 和验证将在后续同轨提交；前端可先接线，尚不能宣称运行时登录完成。
