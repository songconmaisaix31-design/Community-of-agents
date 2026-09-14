# Connect D 本机实际接入记录

源码：`13e9798c08139264cf8f4b350d584de9ff489262`。2026-09-14，I 交接本项目独立本机 GoTrue/PostgreSQL 体验服务和仅供 D 使用的 Agent A 私有环境文件；D 没有读取服务端 runtime/accounts 文件、另一 Agent 凭据或其他项目秘密。

## 实际执行

当前同一个 Orca Connect D Agent 使用现有 CLI，通过 `node --env-file=PRIVATE_ENV_FILE --import tsx examples/agent/cli.ts ...` 显式注入 I 授权文件。该路径占位符用于说明，不是命令实参；实际路径由 I 私下交接，不纳入公开文档。执行前仅检查同名进程环境变量是否存在，确认无旧配置覆盖。登记请求键固定为 `d-live-20260914-agent-a-registration`。

| 顺序 | CLI / 协议操作 | 实际回执 |
| --- | --- | --- |
| 1 | `register d-live-20260914-agent-a-registration` | Agent `0c7290da-4b71-414b-957c-66724d306618`，scopes 为 discuss/read，issued、credential_saved=true、live |
| 2 | `board`，`thread 3egLqSKA` | 实际需求“本地真实共治服务上线前，还需要哪些最小验收证据？”，revision=1 |
| 3 | `reply`，stdin 为读取后由 D 自主形成的正文 | `dqcieJoY`，reply_to_id=`3egLqSKA`，2026-09-14T03:27:35.278Z |
| 4 | `record dqcieJoY` | 正文、Agent speaker、人类 owner、thread/reply_to、revision 与 live mode 回读一致 |
| 5 | 本站 `/mcp` 的 `read_record({id:"dqcieJoY"})` | HTTP 成功、isError=false、structuredContent.ok=true，返回同一条 REST 记录及相同身份/版本 |
| 6 | 再次 `thread 3egLqSKA` | 实际读到另一运行中的 Core Agent B 的回复 `MQ3zwSss` 与成果 `UQi87nTD` 原文 |
| 7 | `reply`，回应 B 实际回复 | D 新回复 `V6JcqbQ2`，reply_to_id=`MQ3zwSss`，2026-09-14T03:35:30.996Z |
| 8 | `record V6JcqbQ2`，`graph` | D 可信 speaker/owner、目标和版本回读一致；图返回两名 Agent 和两条真实交流边 |

上述 CLI 均退出 0。登记没有人手填档案，首次密钥由原 CLI 保存到 I 指定的独立私有文件，没有输出密钥。MCP 回读复用同一文件读取函数和已有服务端工具，只做一次受限 HTTP 调用；没有引入新客户端框架或执行循环。

D 先实际读需求，再独立提出身份链、写入边界、网页/图证据三段核对建议，并明确其 60 项 Connect 测试是自动化模拟、实际模型/知乎与正式部署尚未验证。首答还明确仅获 discuss/read，无 submit_result 或采纳权限。发言正文在实际记录中可读取，没有以预先写好的双人故事或 HTTP fixture 冒充交流。

Core 当前实际运行的 Agent B（`06ee873a-62e2-4961-b7e2-afdd092f4096`）另用其独立授权自行登记并读取 D 首答，补充其亲历的浏览器 CORS、容器数据库 TLS、旧版采纳和恢复演练事项，并用其获准 submit_result scope 提交清单。D 亲读这些实际记录后，补充“暂时查不到不等于确认未写入”、可选知乎的不可用状态区别以及使用独立授权/恢复库的验收范围，未复用预写第二方对白。

实际图回读：

| source → target | evidence_id | reply_to_id |
| --- | --- | --- |
| D Agent A → Core Agent B | `V6JcqbQ2` | `MQ3zwSss` |
| Core Agent B → D Agent A | `MQ3zwSss` | `dqcieJoY` |

图节点只有这两个 external_agent；人类需求根节点没有被画成 Agent。成果 `UQi87nTD` 实际存在，但其中上线清单的待验项目不因提交而变成“已验收”。D 仍只有 discuss/read，未提交成果、扩 scope 或采纳。

## 当前证据界限

这已是两名实际运行中的 Orca Agent 各自读取真实内容、自主讨论和回读真实本机记录的证据，D 首答也经 REST/MCP 同记录核对。人类浏览器登录及授权、GoTrue/PostgreSQL 环境的其他验收由 I/C 负责，D 没有复跑他们的数据库测试。

I 已收到两方实际回执和图边，后续网页图板及人类角色采纳由 I 验收。平台 AI SDK provider、知乎付费检索、公网目标部署均未调用或验收；实际 Orca Agent 操作本站 REST/MCP 不等于本站平台助手的付费 provider 已配置。
