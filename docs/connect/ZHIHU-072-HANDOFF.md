# 知乎 0.7.2 回答摘要交接

实现提交：`5a2fd0e48eeb90343695c906e592ff482bfa4c30`，分支 `songconmaisaix31-design/gongzhi-connect`，已 push，`git ls-remote` 已核对同 SHA。基线为 `8c456c951e00cf56eb683a5791ff120313359100`；没有修改共享契约、根依赖/锁文件、授权/数据库、页面或其他 API。

依据用户提供的官方 `zhihu-cli-skill` 0.7.2-beta.20260911131715 ZIP，只读 SKILL、manifest、HTTP、creator、hackathon 系列及 CLI/MCP 文档，不安装或执行包内脚本。详细字段与未接能力见 [官方依据](official-sources.md)。

## 可消费的代码与文档

- 原 `createZhihuSearch(options).search(query, signal, count?)` 保留；同一实例新增 `questionAnswers(questionUrl, signal, offset?, limit?)`。两种方法复用固定官方主机的 GET 传输、既有 Access Secret 和秒级时间戳、15 秒单请求超时（不超过 run 截止）、AbortSignal、无重试及各端点的凭据范围缓存。实例构建不联网。
- 既有 `executeAssistant` 接入 `readZhihuAnswers({question_url,offset?})`，必须先读当前任务；固定默认一页五条，模型不能指定请求地址、凭据、header 或 limit。后页只接受本 run 同一问题实际返回的 NextOffset，不能从另一问题或缓存中猜游标。
- 工具返回 `{sources,paging,pagination_incomplete}`。`IsEnd:false` 的空页仍可使用官方 NextOffset；缺 NextOffset 则保留本页实际摘要、明确分页不完整并停止。非法、倒退或越界游标失败关闭；int64 从 JSON 原始数值 token 无损转十进制字符串，未经过 Number 舍入后再转换。
- 搜索与回答摘要共用 `usage.zhihu_queries` 上限 2，原 4 模型步、60 秒、单任务并发、幂等、取消与 unknown 结算不变。同搜索或同问题同页合并计一次，缓存命中仍算本 run 的一次检索尝试；不是精确计费统计。真实工具失败保持 sticky，后续不能换渠道或提交掩盖失败。
- Source 沿现有契约映射 `ContentToken/Url/Summary` 与取得时间。标题“问题下的回答摘要”为展示标签，无作者则省略；不拼 URL、不补作者或全文。适配保留原始 Summary，Source excerpt 最多 1,000 字符。来源必须经本 run 的工具实际取得，只有别的 run 的缓存内容不能直接引用。
- [公开 Agent 指引](agent-skill.md)、[外部 README](../../examples/agent/README.md) 已按包内实际命令补官方 CLI/MCP 选用。官方 CLI 可读问题回答摘要；官方 MCP 文档仅列四项服务，没有回答摘要 MCP 的依据。本站讨论与成果仍用既有有限 grant、CLI/REST/MCP，不混用知乎与本站身份。

无需 Core 新增依赖、DTO 或迁移；Integration 可直接合入。公开 `/agent-skill.md` 沿用现有读文件路由。平台助手仍由既有 runs 发起/查询/取消，未增加启动参数或新任务入口。

## 2026-09-14 实际检查

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test "tests/connect/*.test.mjs"` | 102/102 通过，0 失败/跳过 |
| `npm run typecheck` | 通过 |
| `npm run build:backend` | Next 15.5.25 生产构建通过，含 runs 与公开 skill 路由 |
| `git diff --check` / `git diff --cached --check` | 通过 |
| `git ls-remote origin refs/heads/songconmaisaix31-design/gongzhi-connect` | 实现提交推送后核对为上述完整 SHA |

新增验证包括：官方字段/固定请求、空页未结束、缺 cursor 保留摘要并禁后页、错误/越界/倒退游标、超过安全整数的原始 JSON 数值、HTTP/业务/日额度失败、请求取消/超时、重复页合并、两种工具双向共享预算、未读任务/未取来源拒绝、无假作者/全文、失败后直接调用另一工具仍被阻止。原有幂等、unknown 和外部 CLI/REST/MCP 模拟测试继续通过。

所有测试均为隔离 HTTP/model fixtures 与 repository 替身；一个既有外部测试使用隔离 localhost HTTP 模拟器，未连接体验服务。没有向 3039、3043 或任何体验数据库写入；没有读取旧 Agent grant、其他项目环境或日常 CLI 登录文件。未发真实知乎或模型请求，未新增费用。

## 真实剩余限制

真实知乎 Access Secret/API 授权和额度、实际模型配置与运行许可仍需操作者明确提供并另行联调。以上测试不证明真实知乎/模型、不同所有者 Agent 互助、Postgres 事务或正式上线已通过。未安装官方 CLI，也未登录或配置官方 MCP。

OAuth 登录、本人全文/评论、画像/主题推荐、活动知识/故事等仅作为官方资料已说明的能力记录，本轮未接入；不宣称知乎官方 Agent 身份/托管可用。生产运行依赖现有 Node 24+，部署平台仍需满足原 runs 请求时限。数据清理范围未由本轨变更，不用合成内容填充空体验库。
