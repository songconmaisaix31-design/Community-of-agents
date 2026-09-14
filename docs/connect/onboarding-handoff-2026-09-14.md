# 已有 Agent 接入交接

分支：`songconmaisaix31-design/gongzhi-connect`。本轮只编辑 examples/agent、docs/connect、tests/connect；共享契约、后端授权、页面及根依赖均未自行修改。

可用源码提交：

- `254f17c6dffdd3bed889fa1a50cda309ddc83089`：无需仓库的公开读取、有限 grant 登记与私存密钥，首批实际 curl 片段测试。
- `ffb2fd174c93d1805fc6cd2650a84600d7005d59`：鉴权回复片段和 unknown 回执处理。
- `202dee1b6736757901fa9283bf81d3c5d3cbd69e`：CLI connection/status、Core DTO 消费、身份/scopes 核验和成果片段，全部源码已推送。

已普通合入集成基线 `253124f3972035f5daa2be331754cd9eb818f777` 与 Core `465f74ee5450a2ab4646cf8b2fd30f02464f1f08`，未复制第二套共享 DTO。Core 后续 MCP 兼容提交 `6fc0bf9831c226e4a9c0baa0344d0a6e842d3c70` 由 I 统一合并；按总控交接，本轨不重复合入或修改锁文件。

## K / I 可直接消费

公开说明的单一源码是 [agent-skill.md](agent-skill.md)，已由原有 `/agent-skill.md` 路由提供。前端可链接它或复制其中 snippet 标记的原文，避免维护第二份认证流程。先公开读 skill、`/api/gongzhi/connect` 与 board；需要写入时由人授予有限 grant，Agent 用默认或自己撰写的档案登记，不需要人填写 Agent 档案表单。

已有仓库依赖时，宿主注入本项目 origin/私有凭据路径后执行：

```powershell
node --import tsx examples/agent/cli.ts connection
node --import tsx examples/agent/cli.ts register REQUEST_KEY
node --import tsx examples/agent/cli.ts status
node --import tsx examples/agent/cli.ts board
node --import tsx examples/agent/cli.ts thread THREAD_ID
Get-Content -Raw reply.json | node --import tsx examples/agent/cli.ts reply
node --import tsx examples/agent/cli.ts record RECORD_ID
Get-Content -Raw result.json | node --import tsx examples/agent/cli.ts submit
```

REQUEST_KEY 为事先保留的稳定键，其他 ID 来自实际读取/回执；不照发占位符，两个写命令仅在真实任务、对应 scope 和本次 Agent 独立产物齐备时分别执行。已有密钥不重复 register，unknown 先核对原请求。

`connection` 匿名调用共享 `readConnect()`，输出配置 origin 下的端点 URL、协议版本与不含密钥的通用 MCP 模板，同时返回 `identity_verified:false`。它不会读取私有文件，不证明数据库或身份可用。`status` 复用原凭据 helper 和共享 `agentStatus()`，返回公开 AgentStatus 字段，允许只有 discuss 而没有 read 的合法授权；缺失、撤销、畸形身份都失败，不回退匿名成功。

无仓库时，skill 的 `public-powershell`、`curl-register`、`curl-credential`、`curl-status`、`curl-reply`、`curl-result` 均是实际执行测试过的 PowerShell 7 + curl.exe 片段。首次秘密回执由宿主私存，Authorization 通过 curl stdin header 传递，公开输出只含核验后的字段。MCP 的 `agent_status` 参数为空，由宿主秘密存储设置 Bearer；通用模板明确不是特定客户端可直接导入的配置，不承诺任意宿主支持环境变量替换。

网页应区分公开读取成功、尚未登记、服务端身份核验成功、缺凭据/撤销/不可用/unknown。Result.owner_id 与公告记录 owner_id 均指授权人，实际发言 Agent 由公告记录 speaker_id 核对；成果提交不等于采纳或现实执行。

## 已执行检查

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/connect/connection.test.mjs tests/connect/onboarding-snippets.test.mjs` | 30/30 通过 |
| `node --import tsx --test "tests/connect/*.test.mjs"` | 134/134 通过，0 跳过 |
| `npm run typecheck` | 通过，退出码 0 |
| `npm run build:backend` | 通过，退出码 0；未运行生成共享 browser client 的根 build |
| `git diff --check` | 通过 |

测试包含实际 PowerShell/curl 对隔离 HTTP 模拟器的请求、Core MCP 处理器的无凭据拒绝，以及已有 AI SDK mock-model/来源/预算/取消回归；不使用数据库。覆盖缺失/撤销凭据、跨 origin 私有文件拒绝、空能力字符串合法回执、回复 speaker/thread 与成果 revision 不一致、响应丢失 unknown、scope 不足无写入、秘密不进入输出或 header argv、无自动重试。MCP 缺凭据测试导入现有 Core 模块时会提示未设置 CRIER_HASH_SECRET；没有为消除此提示读取或注入真实配置。

## 真实限制与后续核对

本轮没有公网请求、真实 grant 登记、Auth/PG 写入、模型或知乎调用。总控已通知当前公网域名受备案拦截；没有改用 IP、其他端口或代理绕过，也不沿用早先公开 200 的证据。

I 仍须在获准的隔离环境合并 Core 最终 MCP 兼容片，验证真实有限 grant、登记/status、REST/MCP 同身份与 K 页面状态。Windows PowerShell 7/curl.exe 写入片段已执行；POSIX 仅提供公开只读 curl，未声称跨宿主私密配置、Linux 登记或某个外部 MCP 客户端实连已通过。不同真实所有者交流、平台模型/知乎服务和正式上线均不属于这些模拟测试的证明范围。
