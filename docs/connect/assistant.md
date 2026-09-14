# 平台体验助手与验收边界

`POST /api/gongzhi/runs` 接受共享 `StartRunInput`，通过 Core 解析人的凭据及其 `platform_agent` 身份。Core 的持久 run repository 原子处理幂等键、版本、单需求并发、取消和终态；Connect 不写 SQL。请求等待 AI SDK 的 `generateText` 和结果提交结束，不启动后台 Promise。

只有 `readNeed`、`findExperience`、`searchZhihu`、`readZhihuAnswers`、`submitResult` 五个工具。模型不能选择其他需求、冒充作者、创建来源字段或采纳结果。来源仅由本 run 实际知乎工具响应构造；经验引用必须与本次读到的 ID、revision 相符。`submitResult` 在请求内准备一个待提交结果，SDK 正常返回、无工具错误且任务仍有效后，才由 Core 事务提交。模型说“完成”不会改变采纳状态。

每次最多四个模型步骤、两次知乎检索、60 秒；模型自动重试为零，每步输出最多 2,000 tokens。Core 冻结的 `Run.budget.limits` 可以调低步数/输出，执行器要求它与实际模型 ID 一致，再把上限传给 SDK；新运行没有有效快照则不调用模型。搜索与问题回答摘要共享两次预算，相同搜索或同问题同页的重复调用合并为一次；后页计入预算。`usage.zhihu_queries` 是两类检索尝试数，可能含缓存命中，不等于精确上游账单。

`onStepFinish` 保留每步已观测的输入/输出 token；后来失败也不抹去它们。只有所有已开始的模型步骤都已返回完整用量，才向 Core 传 `usage_complete:true`；未知/中断保留完整费用预留。返回用量超出模型上下文或输出上限时立即通过 AbortSignal 停止后续调用，不能只在 SDK 生命周期回调抛错（SDK 可能隔离回调异常）。预算是内部额度控制，不是供应商账单或已发出费用可撤回保证。

读取任务后，`readZhihuAnswers({question_url,offset?})` 以固定官方 GET 路径读取默认五条回答摘要。QuestionUrl 限知乎 HTTPS `/question/数字ID`，不能带用户名密码或指定其他主机/路径；offset 默认字符串 `0`，后页只能使用本 run 同问题实际返回的官方游标。模型不控制请求地址、凭据、请求头或 limit。

分页只看 `Paging.IsEnd`，短页/空页不推断结束。`IsEnd:false` 且缺 NextOffset 时返回 `pagination_incomplete:true`，保留已取得的真实摘要，明确分页不完整并禁止后页；非法、倒退、int64 越界游标为实际失败。数字型 int64 在 Node 24 的 JSON 解析阶段用原 token 无损保留为字符串，不先舍入再转换。

Source 的 ID/URL/摘要来自 `ContentToken/Url/Summary`，取得时间由服务端记录；“问题下的回答摘要”是展示标签，非官方标题，作者字段省略。适配响应保留完整 Summary，Source excerpt 按现有契约最多 1,000 字符；Summary 不是全文或 AI 摘要。只有当前 run 通过工具实际取得的来源才可引用，另一 run 的缓存本身不授予引用权限。调用失败仍 sticky，不允许改换工具掩盖失败。

请求 AbortSignal、截止时间及工具/提交边界均检查取消。`DELETE /runs/:id` 先持久化取消，再中断本进程该 run 的 provider signal。执行期间每秒只检查当前 run，调用 Core `getRun(actor,id,{signal,timeout_ms:1000})`；跨实例取消、终态或读取失败都会 abort provider。停止时中断正在等待的读取并 await 监视任务清理，不轮询新任务、不调用模型检查状态。Core 有界连接/数据库清理和运行截止共同约束取消；不承诺零延迟或撤销已发出的站外请求及费用。

结果提交响应丢失记为 unknown，保留原幂等键，不自动重试模型。若结果与成功终态已经持久化，但 HTTP 请求在最终确认时断连，Connect 抛出 unknown 确认错误并附可查询的 run/result ID，不覆写已记录的成功。`GET /runs/:id` 用于核对持久状态；HTTP `ok` 是接口响应是否可读取，运行是否成功始终以 Run.status 为准。Core 的数据库截止/CAS 是最终权威。

首次同步 POST 尚未返回 run ID 时，调用唯一客户端 `lookupRun({need_id,idempotency_key})`，对应 `GET /api/gongzhi/runs?need_id=...&idempotency_key=...`。查询仍由当前人的 platform identity 限定，仅只读原请求，不检查模型配置或启动模型。前端在本次请求期间有界查询，拿到真实 run ID 后才调用原 `cancelRun(id)`；响应丢失也保留原参数继续显式核对。`data:null` 只表示这次读取尚未看到记录，不证明模型未启动，也不能据此换键再发 POST。

默认关闭，启用需要操作方已授权的本项目配置：

| 服务端变量 | 用途 |
| --- | --- |
| `GONGZHI_ASSISTANT_ENABLED=true` | 显式启用模型和知乎请求 |
| `GONGZHI_MODEL_API_KEY` | 获准 provider 的密钥 |
| `GONGZHI_MODEL_ID` | 获准模型 ID |
| `GONGZHI_MODEL_PRICING_MODEL_ID` | 必须与获准模型 ID 相同 |
| `GONGZHI_MODEL_CONTEXT_TOKENS` | 操作方核实的实际模型上下文上限 |
| `GONGZHI_MODEL_INPUT_USD_PER_MILLION` / `GONGZHI_MODEL_OUTPUT_USD_PER_MILLION` | 该模型 USD token 单价 |
| `GONGZHI_RUN_MAX_COST_USD` / `GONGZHI_RUN_DAILY_MAX_COST_USD` | 单次及全站滚动每日费用上限 |
| `GONGZHI_MODEL_BASE_URL`（可选） | HTTPS OpenAI 兼容端点；不走隐式 Gateway |
| `ZHIHU_ACCESS_SECRET`（知乎能力可选） | 官方搜索与问题回答摘要共用的服务端 Bearer Secret |

任一模型必需配置缺失即 503 unavailable；只有知乎 secret 缺失时可按任务使用站内经验，但一旦尝试任一知乎工具便明确 unavailable，不能伪造检索成功。凭据只在服务端环境使用，不读 CLI 登录文件，不进入浏览器、仓库、响应或日志。配置客户端本身不会发请求；本轮未启用任何真实收费调用。

Core 负责事务中的全局/单用户并发准入和费用预留，默认并发 2/1；完整配置及计价限制见 [run-limits.md](../core/run-limits.md)。预留按所选模型每步整个上下文和输出上限保守计算，不靠字符数假称精确 token 上界。若模型另计推理、缓存或工具费用，运营方必须先确认配置能覆盖；不能把未覆盖费用当零。执行器测试用注入模型与 repository 替身，不代替 Core 真数据库准入验收或付费模型验收。

Next 路由 maxDuration 为 75 秒，为身份和结算留出时间；具体部署必须允许此请求长度。60 秒是运行预算，不是外部平台到账或 HTTP 响应送达保证。暂未部署，也未确认设备休眠无关的在线可用性。

本轨检查为 `node --import tsx --test "tests/connect/*.test.mjs"`、`npm run typecheck`、`npm run build:backend`、`git diff --check`；后端构建不会重新生成 Core 的浏览器资源。测试采用 AI SDK 官方 `ai/test` MockLanguageModelV4 执行 SDK 的工具调用，加上合成的知乎 HTTP 响应和内存 repository 测试替身；这些检查不证明真实模型、知乎权限、Postgres 事务或公网双身份链已经通过。
