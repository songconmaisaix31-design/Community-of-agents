# Connect D: official integration notes

Read on 2026-09-13 from the user-provided [official archive](https://zhstatic.zhihu.com/skill/zhihu-hackathon-skill_s2_v260815.zip). The archive embeds `zhihu-cli-skill.zip`; its `zhihu/SKILL.md` identifies version 0.2.1. `references/http-api.md` records its own verification date as 2026-07-16. This is documentation evidence, not a live API response.

- Search: GET `https://developer.zhihu.com/api/v1/content/zhihu_search`; query keys `Query`, `Count` (1–10).
- Headers: Bearer Access Secret, `X-Request-Timestamp` in Unix seconds, JSON content type. No OAuth flow is needed for public search.
- Envelope: `Code`, `Message`, `Data`; success requires numeric Code 0. Data contains `Items`, `SearchHashId`, `HasMore`, optional `EmptyReason`.
- Source fields: `Title`, `AuthorName`, `ContentID`, `ContentType`, `ContentText`, `Url`. Text is a search summary, not full content. Returned URL attribution parameters are preserved. Missing URLs are not reconstructed.
- Documented errors: 10001 invalid parameters, 20001 authentication, 30001 rate limit, 90001 internal error. HTTP 401/403 and 429 are separately mapped. Errors are not cached or relabeled empty results.

The adapter keeps a bounded, five-minute server-side cache per configured instance and deduplicates simultaneous identical requests sharing a run AbortSignal. It retains the original retrieval timestamp on cache hits. Raw upstream error text and credentials are never returned.

AI SDK references actually read: [tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling.md), [generateText](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text.md). The installed version and types will decide the exact stop-condition API. Use its own tool loop, maxRetries 0, a four-step ceiling and a propagated abort signal; no generic runner or gateway.

Only environment variable presence was checked. No model or Zhihu request, CLI credential read, account creation, public deployment, or OAuth setup has been performed. Missing configuration must return unavailable. Synthetic unit responses are explicitly test data.

## 2026-09-14 取材范围复核

本轮重新只读取得同一官方 ZIP，在内存中读取嵌套 `zhihu-cli-skill.zip` 的 `zhihu/SKILL.md`（0.2.1）与 `zhihu/references/http-api.md`。未执行其中的安装、状态检查、登录、OAuth 或业务请求脚本。

- HTTP 文档的“知乎搜索 API”明确覆盖相关问题、回答和文章；`ContentText` 是摘要，`ContentType` 是服务端返回的内容类型字符串。当前适配无需另建问题接口即可保留返回类型和搜索摘要，但文档不等于已取得实际搜索结果。
- 同节列出可选 `CommentInfoList`，其条目只有 `Content` 字段定义，没有独立评论 ID、作者或 URL 保证。当前薄适配未把这些精选评论送入共享 Source，不承诺完整评论线程，也不借来源文章的作者冒充评论作者。讨论取材限于实际取得的可归属摘要及明确获准的其他资料。
- 现有 Source 的 `content_type:'summary'` 表示取得的文本形态；不将问题、回答、文章等上游内容类别冒作“已读全文”。标题、作者、ID、URL 只用响应实际值，取得时间由适配器在响应读取后记录；缺 URL 时不从 ID 拼接。文档未限定完整 ContentType 枚举，适配器保持原字符串。
- 官方 skill 另列用户数据与 OAuth 文档，不构成本项目已经接通官方 Agent 托管、作者身份映射或代表用户发帖的证据。本轮保留本站既有有限授权身份，不接入新的账号体系。

产品以知乎为重要信源，实际检索仍需要本项目 Access Secret、额度与授权；未配置不能请求，查询无结果不能变出来源，鉴权/限流/失败不能被改成空结果成功。真实外部查询及不同所有者 Agent 互助在本轮均未验收。
