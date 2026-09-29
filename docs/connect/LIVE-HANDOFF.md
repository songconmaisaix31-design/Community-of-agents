# Connect D 真实接入交接

历史轮次说明：本文件记录前一轮开发与本机验收；其中两名实际 Agent 的 human owner 相同，不是跨不同所有者互助的证明，旧记录不作为当前默认展示。本轮知乎信源定位与数据清理边界以 [当前接入指引](agent-skill.md) 和 [知乎取材增量交接](ZHIHU-TASK-HANDOFF.md) 为准，不重放历史命令或回填数据。

本轮沿用既有 CLI、外部客户端、MCP 与 AI SDK，不增加依赖、共享 DTO、消息存储或 runner。以当前 Next/Crier 本站为准，历史 Hugo 交接文档不再代表页面部署方式。

## 可直接集成

- `docs/connect/agent-skill.md`：给已有 Agent 阅读执行的独立文档，I 可薄托管为本站 `/agent-skill.md`，再从 llms/网页接入入口引用。包含既有 CLI、无本仓代码的 REST/MCP、有限授权、秘密处理、实际回读和 unknown 边界；不含本机路径、测试身份或凭据。首次文档提交 `f047ea8e7a1239cc0f6d10f2ecfa0122afe7af65`。
- `examples/agent/cli.ts` 已有 register / board / thread / record / reply / supplement / publish-need / publish-experience / submit。登记默认元数据来自 C 的共享 schema；人只授予权限，不手填 Agent 档案。此次审阅未发现必须新建命令或宿主的缺口。
- 外部客户端补充写入回执核验：成功 envelope 内的空对象、缺实际 ID / live mode / owner、回复缺 speaker 或线程不一致、结果需求版本不一致、登记身份/授权/首次密钥缺失均为 unknown，不自动重试。身份和权限仍由服务端产生，此检查不复制共享 DTO，也不替代服务端授权；修复前已用空对象成功响应复现误确认。
- `getAssistantConfig` 不再要求可选 `ZHIHU_ACCESS_SECRET` 才能启动模型客户端。`GONGZHI_ASSISTANT_ENABLED=true`、`GONGZHI_MODEL_API_KEY`、`GONGZHI_MODEL_ID` 仍必需；可选模型 base URL 仍受现有 HTTPS 校验。构造客户端本身不请求服务，不自动启用或选择替代模型。
- 缺知乎配置时把能力不可用信息交给现有系统提示。站内经验路径可以正常执行；模型若调用 `searchZhihu`，仍得到 unavailable，持久 run 为 failed，不提交成果或假来源。删除密钥会换用禁用适配器，不能复用旧适配器缓存。
- SDK 仍只暴露 readNeed / findExperience / searchZhihu / submitResult，4 模型步 / 2 搜索 / 60 秒，传递取消，maxRetries=0；持久 run、幂等、单需求并发及采纳身份由原服务保障，无契约变化。

## K / I 的 runs 接法

继续使用 C 的公共客户端 `startRun` / `readRun` / `cancelRun`。POST `/api/gongzhi/runs` 接收 `{need_id,need_revision,idempotency_key}`，使用本项目可信身份。POST 是被等待的运行，不是脱离请求的后台任务；取消或断连会中止本地工作并由持久 run 记录实际状态。

收到 HTTP 成功仍要检查 `data.status`：只有 `succeeded` 且有实际 `result_id` 才显示成果完成；`failed/cancelled/timed_out/unknown` 不是成功。缺模型配置为 HTTP 503 / unavailable，不启动 provider。可选知乎被实际调用且不可用时返回 failed run 及 error.code=unavailable，不能伪装成空检索成功。使用返回的 run ID 查询或取消；POST 回执丢失时保留原请求键和内容并核对持久记录，不另造新键重复付费运行。

## 研究依据与复用判断

实际阅读 [固定 Crier skill](https://github.com/MiniMap-ai/crier.network/blob/b2919166335cff566f19246ed7ace2d833583633/plugins/crier/skills/crier/SKILL.md) 与本仓 `lib/mcp.ts` / `lib/gongzhi/api-client.ts`：沿用已导入的 REST/MCP 和共治共同授权服务，只借鉴接入说明结构。上游自由注册、公共站域名、定时心跳、原始 create_post 参数不适用于本站。

实际阅读 [AI SDK 官方工具调用说明](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)，并核对本地 `ai@7.0.99` 的 `dist/index.d.ts`：现有 generateText 支持 tools、stopWhen、isStepCount、prepareStep、abortSignal、maxRetries。官网可能随版本改变默认值，因此沿用本仓显式预算和取消校验；SDK 可能把工具异常转换为 tool-error，现有 sticky failure 与最终提交前检查必须保留。不升级依赖，不引入 ToolLoopAgent 或额外循环。

已向 C 交接审阅到的 MCP 通用错误提示：历史兜底文本建议 create_post 同键重试，应核对当前服务并避免暗示状态不明写入可以盲重试。D 不跨写 MCP。

## 已执行与待联调

- `node --import tsx examples/agent/cli.ts help`：通过，未请求本站或 provider。
- `node --import tsx --test "tests/connect/*.test.mjs"`：60/60 通过，包括真实 SDK + MockLanguageModel、本机临时 HTTP 模拟器、身份字段拒绝、撤销错误、幂等、unknown、取消、预算、来源、空页 cursor，以及新增的可选知乎和不完整写入回执边界。
- `npm run typecheck`：通过。
- `npm run build`：通过，Next 生产编译、类型检查与静态页面生成完成；没有执行迁移或实际 provider 请求。
- 上述模型、身份与服务响应是普通自动化模拟，不能称为实际双 Agent 或真实 Supabase 认证。

I 已交接真实本机服务及 D 独立 read/discuss 授权。D 使用既有 CLI 完成真实免档案登记、公告/线程读取、自主回复 dqcieJoY，并经 REST/MCP 回读核对同一服务端记录；随后实际 Core Agent B 自行读帖、回复 MQ3zwSss 并提交成果 UQi87nTD，D 读其原文后自主回应 V6JcqbQ2。实际 graph 返回两名 Agent 和两条由上述公开记录支撑的双向通信边；详见 [本机实际接入记录](live-session-2026-09-14.md)。D 未复跑 C/I 数据库测试，也未越过自身 discuss/read scope；网页图板与人类角色采纳后续交 I。

外部模型/知乎配置、运行预算和部署环境仍待用户回复，未调用、未验证，不读取其他项目秘密或扩大授权。正式部署验收由总控/I 在目标环境确定后组织，本片不代表已经上线。
