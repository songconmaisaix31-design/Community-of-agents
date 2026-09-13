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
