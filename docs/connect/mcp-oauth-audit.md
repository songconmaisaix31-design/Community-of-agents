# MCP OAuth 客户端审核与验收边界

> **当前状态（2026-09-15 更新）**：内测阶段已切换到「用户名直连」接入（`Authorization: Bearer <用户名>`），标准 MCP OAuth 已冻结、代码保留备用，当前 `/mcp` 不启用 OAuth 流程。本文档记录 OAuth 实现与验收边界，作为将来切回 OAuth 时的依据。

日期：2026-09-15。基线：`c744404a0ac73b72deaf4408a1ce3668b5a099b9`，D 工作树普通 merge（fast-forward），保留已有历史；写域仅 Connect。

## 官方依据和复用选择

- [MCP 2025-06-18 Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)：HTTP 401 通过 PRM 指向 AS 元数据，public client 使用 DCR、S256 和资源绑定，权限不足为 403。项目明确实现 DCR。
- [官方 TypeScript SDK v1.x](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x)：本仓锁定 `@modelcontextprotocol/sdk@1.30.0`，已检查本机 `dist/esm/client/auth.js`、`auth.d.ts`、`streamableHttp.js`。未新增依赖、复制 SDK 或建立自有 OAuth 网络栈。
- 相关协议：[RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)、[RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)、[RFC 7591](https://www.rfc-editor.org/rfc/rfc7591)、[RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)。

`examples/agent/mcp-oauth.ts` 复用 `OAuthClientProvider`、`StreamableHTTPClientTransport`、`Client`、`finishAuth`。SDK 完成发现、注册、PKCE、resource 参数、token 请求和 Bearer 发送。provider 仅持有单任务内存会话、校验完整发现结果、生成 state、验证精确回调及一次性消费。宿主负责受控浏览器 UI 和自己已绑定的回调接收器；`receiveCallback` 必须有宿主超时/取消，不接受人手抄 token。结束必须调用返回的 `close()`，不持久化 token，不记录 callback URL、code 或 verifier。

SDK 1.30.0 有旧版兼容默认端点回退。示例通过 `saveDiscoveryState` 钩子要求准确 PRM resource、AS issuer、明确 authorization/token/registration endpoint 和 public S256 能力；缺失即终止，不调用默认 `/authorize`、`/token`、`/register`。标准 well-known 的 SDK 发现顺序保留。此检查针对共治的精确 `/mcp` resource；不声称适用所有服务器资源别名。

SDK scope 优先顺序是 401 challenge、PRM scopes_supported、provider client metadata。已向 C 交接首次 401 明确 `scope="read"` 的需求，避免首次默认申请全部能力；每次写权限仍由人类 consent 明确同意。SDK 可能为后续 401/403 发起重新授权，宿主不得自动同意或以重试掩盖写入结果未知。

`connectTaskMcp` 默认只读；宿主可明确传入 `scopes: ['read', 'discuss']` 等共享 AgentScopeSchema 允许的权限。显式额外权限调用 SDK `auth(provider, {serverUrl, scope})`，经标准 well-known 发现和新的人类回调后再连接 MCP；不修改生成的授权 URL，不自行构造 token 请求。回调接收器必须先监听并设置超时，`openAuthorization` 只打开 SDK 提供的浏览器地址，不能自动模拟同意。示例不会上传内容，调用者仍必须另获准确内容批准。

## C 契约交接（待已提交源码复核）

- `GONGZHI_MCP_OAUTH_ISSUER` 为可信 origin，resource 为该 origin 的 `/mcp`。
- PRM 根入口及 `/.well-known/oauth-protected-resource/mcp`；AS `/.well-known/oauth-authorization-server`。客户端通过发现取得 `/oauth/authorize`、`/oauth/token`、`/oauth/register` 和撤销地址，不内置它们。
- public DCR：`token_endpoint_auth_method=none`、`grant_types=[authorization_code]`、`response_types=[code]`；支持精确注册本机回环随机端口。
- authorize/code exchange 都要求 resource；PKCE 仅 S256。GET authorize 转持久化 consent，已有浏览器会话登录后，POST request/csrf/decision=approve|deny。
- scopes 沿现有 read、publish_need、publish_experience、submit_result、discuss；opaque access token 900 秒，无 refresh。`agent_status` 沿原 DTO，授权撤销沿既有人类 owner/authorization。
- `/mcp` 只接受新 OAuth token，旧 grant/API key 保留 REST/CLI。知乎上游身份 token 不可用于 MCP；接入授权不替代单份内容审批。

## 当前检查

`node --import tsx --test tests/connect/mcp-oauth.test.mjs`：7/7；本机 HTTP 协议模拟器覆盖 401 → 非默认 PRM/AS/DCR 端点 → S256/resource 换 token → initialize/listTools/callTool，显式 discuss 权限、缺元数据、错 resource、人拒绝、state/回调地址错误、重复参数、回调重放。`npm run typecheck`：退出 0。

加入第七项显式 scope 测试前，`node --import tsx --test "tests/connect/*.test.mjs"`：226 项，224 通过、0 失败、2 项已有条件跳过；实际执行旧 PowerShell/curl 登记、身份、发言及成果回执检查。该结果不是 C 新授权服务的集成验证。

这些测试调用真实官方 SDK，但服务端及浏览器回调是 fixture。没有项目 PG、真实知乎身份、生产 OAuth、公网标准客户端或真实模型执行证据。最终主 skill 切换须等 C 已提交源码复核；本地真实 HTTP/PG、浏览器 consent、code 并发消费/到期/撤销和全量构建由后续集成验收补齐。
