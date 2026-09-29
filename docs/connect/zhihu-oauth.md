# 知乎 OAuth 上游适配：Core 接入说明

依据用户提供的官方 `zhihu-cli-skill-0.7.2-beta.20260911131715 (3).zip`，本轮只读其中 `zhihu/references/hackathon-oauth.md`、`oauth.md`、`hackathon-user-profile-api.md`。未执行包内脚本，也未读取日常 CLI 或其他项目凭据。以下是该版本的协议依据和本地实现，尚未完成真实知乎授权。

黑客松补充文档确认 `state` 原样透传，覆盖通用 OAuth 文档中不回传 state 的历史记录。授权回调主参数为 `authorization_code`，后端将其作为 Token 表单的 `code`。文档未定义 PKCE、scope、刷新 Token、撤销 Token 或用户拒绝时的标准错误参数；本适配不编造这些能力。

## 唯一职责与接口

`lib/gongzhi/zhihu/oauth.ts` 只实现固定知乎上游协议，复用 Node 24 的 fetch、流式读取、AbortSignal 和 JSON 原始数字文本能力，不新增依赖。Core 负责配置、短时 state、浏览器绑定、原子消费、站内稳定身份与会话；这里不建另一套身份或 session。

```ts
const oauth = createZhihuOAuth({
  appId,       // Core: ZHIHU_OAUTH_APP_ID
  appKey,      // Core: ZHIHU_OAUTH_APP_KEY；仅服务器
  redirectUri, // Core: ZHIHU_OAUTH_REDIRECT_URI；必须与登记值完全一致
});

oauth.authorizationUrl(state); // string；state 的安全随机生成与校验归 Core
await oauth.exchangeCode(authorizationCode, signal);
// { accessToken: string, expiresIn: number } ——仅留在服务端请求内
await oauth.readUser(accessToken, signal);
// { subject, uid: string|null, hashId: string|null,
//   name: string|null, avatarUrl: string|null }
```

三个配置都必须有效，缺少时抛 `unavailable`，不会借用 Access Secret。配置在工厂创建时固定，授权 URL 和交换表单保留同一原始 redirect URI（含固定 query、尾部斜杠），不能从回调参数或用户资料里换目标。登记回调允许 HTTPS，显式本机测试允许 loopback HTTP；拒绝用户密码、fragment、反斜杠、保留的 `state/code/authorization_code` query。是否已在知乎登记仍须操作者确认。

| 方法 | 唯一目标与协议 |
| --- | --- |
| `authorizationUrl` | `https://openapi.zhihu.com/authorize`；`redirect_uri/app_id/response_type=code/state` |
| `exchangeCode` | `POST https://openapi.zhihu.com/access_token`；form `app_id/app_key/grant_type=authorization_code/redirect_uri/code` |
| `readUser` | `GET https://openapi.zhihu.com/user`；只用用户 OAuth Bearer，无 query/body，无 Access Secret、`X-OAuth-Token` 或时间戳 |

仅获取基础登录标识、昵称和头像，不读创作列表、全文、关注或收藏。返回投影丢弃 email、phone、gender、介绍和扩展字段；不凭昵称、头像、email 建立主体，也不猜测缺失名称。App Key 不在授权 URL；Token 只由服务端方法返回给 Core，禁止把整个交换结果序列化到浏览器、日志或 Git。适配工厂在浏览器上下文拒绝运行。站内浏览器响应只能由 Core 返回自己的安全投影/HttpOnly 会话。

## 无损标识与有效期

`uid` 的官方原始类型是 int64。解析 JSON 时从 Node 24 reviver 的 `context.source` 取得原始整数文本，随后以字符串保存，不先用已舍入 Number 构造标识。例如原始 `969570047710216200` 和 `9007199254740993` 均保持原值。接收的 uid 必须为正十进制 int64（兼容精确十进制字符串），指数、小数、负值和超界均失败；即使同时有有效 hash，也不能悄悄丢弃非法 uid。

有效非空 `hash_id` 优先作为 `hash:<hash_id>`，否则使用 `uid:<uid>`。本地允许的 hash 字符集为 ASCII 字母、数字、下划线和短横线，长度 1–128；这是适配校验规则，不声称官方仅支持某一固定长度。至少存在一个有效标识；缺失字段返回 null，不造值。两个标识都返回给 Core，由其处理持久唯一关联与冲突，不能将同名或同邮箱旧用户自动合并。

Token 必须含非空 Bearer、可信正整数 `expires_in`；缺失、非有限、非整数或超出安全数值范围均拒绝。Core 已确认按**交换开始时间 + expiresIn**与本站 **8 小时**上限取较早会话截止，不能用昵称或成功 HTTP 状态绕过失效检查。这里不保存 Token，也不实现自动刷新。

## 失败与资源边界

每次 HTTP 默认 10 秒，调用者可降低 `timeoutMs`，硬上限 15 秒；Core 可传递自己的更短取消信号。响应按字节流累计最多 64 KiB，并校验 Content-Length、UTF-8 和 JSON。fetch 和读流都响应取消/超时；没有缓存、轮询或重试。重定向设为 `error`，还拒绝重定向响应、意外响应 URL、HTTP 非成功状态和无有效身份的 HTTP 200。

`ZhihuOAuthError` 只有本地枚举 `code`、`retryable:false` 和通用消息，无上游正文、请求 URL、Token、App Key、原始 exception cause 或 provider error。Core 将这些内部错误映射为自己的唯一浏览器契约。

| 内部 code | 含义 |
| --- | --- |
| `unavailable` | 缺配置、非法回调配置/timeout，或浏览器上下文调用 |
| `invalid_request` | 空或非法 state、code、Bearer 输入 |
| `unauthorized` | HTTP 401/403；业务 404（用户不存在）及 401/403 |
| `rate_limited` | HTTP 429；不自动重试，不透传可能不可信的错误内容 |
| `upstream_failed` | 其他 HTTP 失败、重定向、网络异常或未知业务拒绝 |
| `invalid_response` | 非法 JSON/UTF-8/过大响应、空身份、非法 uid、Token/有效期不完整 |
| `cancelled` / `timed_out` | 调用者取消 / 本次请求截止 |

成功可以是官方示例的平面字段，也兼容 `code:20000` 的平面或 `data` 对象；无论是否带业务码，都必须校验所需内容。业务码存在时只接受已确认的 20000，不把任意非零码当错误，也不臆测 0 是此 OAuth 协议的成功码。HTTP 200 `{"code":404,"data":"User don't exist"}` 不能建会话。

## 本轮检查与未验证

- `node --import tsx --test tests/connect/zhihu-oauth.test.mjs`：23/23。
- `node --import tsx --test "tests/connect/*.test.mjs"`：183/183，0 skip。
- `npm run typecheck`：通过；提交前 `git diff --check` 通过。

全部 OAuth 用例是明确注入的 HTTP fixture，包含官方请求字段、20000/404、空身份、无损 int64、错误脱敏、缺配置、限长、挂起传输/读流超时和取消；Connect 中模型及本地 HTTP 模拟也不是真实外部服务。没有执行真实授权、Token 交换或知乎资料请求，没有新增费用，也没有修改体验库。

App ID/App Key 和准确登记回调仍待项目配置。真实授权须用户本人完成，Core 的 state/会话/身份隔离及集成浏览器、实际公网回调仍由各自原轨验证；本片通过不代表网页登录已上线或真实知乎 OAuth 已验。
