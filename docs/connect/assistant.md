# 平台体验助手与验收边界

`POST /api/gongzhi/runs` 接受共享 `StartRunInput`，通过 Core 解析人的凭据及其 `platform_agent` 身份。Core 的持久 run repository 原子处理幂等键、版本、单需求并发、取消和终态；Connect 不写 SQL。请求等待 AI SDK 的 `generateText` 和结果提交结束，不启动后台 Promise。

只有 `readNeed`、`findExperience`、`searchZhihu`、`submitResult` 四个工具。模型不能选择其他需求、冒充作者、创建来源字段或采纳结果。来源仅由实际知乎响应构造；经验引用必须与本次读到的 ID、revision 相符。`submitResult` 在请求内准备一个待提交结果，SDK 正常返回、无工具错误且任务仍有效后，才由 Core 事务提交。模型说“完成”不会改变采纳状态。

每次最多四个模型步骤、两条不同的知乎查询、60 秒；模型自动重试为零，每步输出最多 2,000 tokens。相同查询的并行调用合并为一次。`usage.zhihu_queries` 记录不同查询尝试数，可能包含缓存命中，不等同于精确上游计费请求数。tokens 仅记录 SDK 返回的用量，失败前未取得的用量保留 null。

请求 AbortSignal、截止时间及工具/提交边界均检查取消。`DELETE /runs/:id` 先由 Core 授权并持久化取消，再中断本进程内该 run 的 provider signal。跨实例取消在下一次持久状态检查和事务写入检查生效；正在其他实例进行的 provider 请求可能持续到最多 60 秒截止，未声称可立即撤销已发出的外部请求或费用。

结果提交响应丢失记为 unknown，保留原幂等键，不自动重试模型。若结果与成功终态已经持久化，但 HTTP 请求在最终确认时断连，Connect 抛出 unknown 确认错误并附可查询的 run/result ID，不覆写已记录的成功。`GET /runs/:id` 用于核对持久状态；HTTP `ok` 是接口响应是否可读取，运行是否成功始终以 Run.status 为准。Core 的数据库截止/CAS 是最终权威。

默认关闭，启用需要操作方已授权的本项目配置：

| 服务端变量 | 用途 |
| --- | --- |
| `GONGZHI_ASSISTANT_ENABLED=true` | 显式启用模型和知乎请求 |
| `GONGZHI_MODEL_API_KEY` | 获准 provider 的密钥 |
| `GONGZHI_MODEL_ID` | 获准模型 ID |
| `GONGZHI_MODEL_BASE_URL`（可选） | HTTPS OpenAI 兼容端点；不走隐式 Gateway |
| `ZHIHU_ACCESS_SECRET` | 官方公共搜索 Bearer Secret |

任一必需配置缺失即 503 unavailable。凭据只在服务端环境使用，不读 CLI 登录文件，不进入浏览器、仓库、响应或日志。配置客户端本身不会发请求；本轮未启用任何真实收费调用。

Next 路由 maxDuration 为 75 秒，为身份和结算留出时间；具体部署必须允许此请求长度。60 秒是运行预算，不是外部平台到账或 HTTP 响应送达保证。暂未部署，也未确认设备休眠无关的在线可用性。

本地检查应使用 Core 固定的 `npm run typecheck`、`npm test`、`npm run build`。测试采用 AI SDK 官方 `ai/test` MockLanguageModelV4 执行 SDK 的真实工具循环，加上合成的知乎传输和内存 repository 测试替身；这些检查不证明真实模型、知乎权限、Postgres 事务或公网双身份链已经通过。
