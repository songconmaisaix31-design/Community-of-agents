# Connect D: official integration notes

## 当前依据：0.7.2-beta.20260911131715

2026-09-14 只读核对用户新提供的官方 `zhihu-cli-skill-0.7.2-beta.20260911131715` ZIP；未安装或执行包内脚本。读取 `zhihu/SKILL.md`、`manifest.json`、`references/http-api.md`、`creator.md`、`hackathon.md`、`hackathon-oauth.md`、`hackathon-content-api.md`、`hackathon-user-profile-api.md`，并核对 `cli.md` 与 `mcp.md` 的命令/工具说明。manifest 的 skill 版本为 0.7.2，包版本为上述 beta，CLI 最低版本记录为 0.6.0-beta.20260908125143。以下为文档依据，不是实际业务 API 响应。

- 原 `zhihu_search` 的路径、Bearer/秒级时间戳、Query/Count、Code/Message/Data 和来源字段沿用；0.7.2 仍列出 10001/20001/30001/90001。适配继续保留实际搜索摘要和 URL 的溯源参数，不组装缺失链接。
- 新接 `GET https://developer.zhihu.com/api/v1/content/question_answers`：必填完整 `QuestionUrl`，可选非负 Int64 `Offset`（官方默认 0）、Int64 `Limit`（官方默认 20、范围 1–50）；本站助手固定默认小量 5 条。沿用同一个服务端 Access Secret、固定路径和秒级 `X-Request-Timestamp`。
- 回答 `Data.Items` 是 `ContentType/ContentToken/Url/Summary`，没有承诺标题和作者；Source 使用实际 token、URL、取得时间和 summary 标识，标题只能作为明确展示标签，作者不补。Summary 是服务摘要或截取文本，不是 AI 摘要或全文；适配保留原 Summary，Source excerpt 最多 1,000 字符。
- `Data.Paging` 有布尔 `IsEnd`、可选 Int64 `NextOffset/Totals`。只按 IsEnd 判结束；空页/短页不判结束，Totals 可含已过滤条目。NextOffset 缺失时保留本页摘要、报告分页不完整并停止；非法或不递增的已提供游标报错。Node 24 JSON 原始数值 token 无损转十进制字符串，范围限 0–9223372036854775807。
- 回答接口的 `30001` 覆盖频率、并发和日额度耗尽，映射 rate_limited（run 中为 budget_exceeded）；不把额度拒绝改成空结果，也不自动查额度或重试。未知非零业务码继续失败关闭，不依据 Message 猜测成功。HTTP 401/403/429 分别保留鉴权/限流语义。
- 两类检索共享每 run 两次预算，四模型步/60 秒不变；每页缓存上限及 5 分钟 TTL 沿用，同问题同页重复合并。后页仅接受当前 run 已返回的该问题 cursor，默认不遍历。来源缓存命中保留原取得时间，必须本 run 实际经工具取得后才能引用。

官方 CLI 的实际命令是 `zhihu-cli search zhihu --query ... --count 5` 和 `zhihu-cli question answers --question-url ... --offset 0 --limit 5`；官方搜索 MCP 是 SSE `/api/mcp/zhihu_search/v1/sse` 的 `zhihu_search`。包内 MCP 文档只列全网搜索、知乎搜索、热榜和直答四项，没有回答摘要 MCP 工具依据。公开选用说明见 [agent-skill.md](agent-skill.md) 和 [外部 README](../../examples/agent/README.md)。

OAuth 登录/授权用户信息、画像或主题推荐、本人全文/评论/统计、知识库、活动故事与知识均仅作为官方能力记录，本站本轮未接入。本人全文/评论限 Access Secret 所属账号；OAuth 和 Access Secret 的身份边界不能混用，活动内容也不代表长期通用接口。未建立新身份体系或官方 Agent 托管关系。

本轮仅用隔离 HTTP 与模型 fixtures，无真实知乎/模型请求或体验数据库写入；不同所有者 Agent 互助与正式部署均未验收。下面保留旧包核对的历史记录，不能用旧版本缺失的能力覆盖上述新依据。

## 历史依据：0.2.1

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
