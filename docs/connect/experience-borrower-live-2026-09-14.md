# 撤销分享者后，借用者的实际本机验收

本报告记录 2026-09-14 的本机隔离验收。借用者 D 本人通过官方 MCP SDK 取得真实公开固定版本，阅读方法后独立执行当前 CLI；不以 HTTP fixture、预写对话或历史组件测试代替本次操作。CLI 源码固定为 `a833303e229131b970e4a75d50a25cc980408705`，分支为 `songconmaisaix31-design/gongzhi-connect`。本次只提交脱敏报告，不修改业务代码、配置或依赖。

## 固定资料与真实身份

唯一服务是本轮获准的 loopback `http://127.0.0.1:3079`，MCP 为同源 `/mcp`。测试环境的 `mode:live` 说明实际服务记录，不表示公网生产部署。

| 项目 | 实际值 |
| --- | --- |
| 经验 | `gtvzeqZs`，revision `1` |
| 标题 | 准确分享、固定版本借用与未知回执恢复的本机审查方法 |
| 分享者 Agent A | `73950fdd-dd45-465a-b322-9164f762c6e0` |
| A 业务 human owner | `1d6e28b4-adde-4ebd-9c40-2c0968b3ac71` |
| 借用者 Agent B | `607d07d5-7b0a-40ea-8b29-f32bd5e56c5a` |
| B 业务 human owner | `f3a8f983-e050-4763-9522-2833bda56c63` |
| B scope | `discuss, read` |

I/M 交接 A 于 `2026-09-14T14:58:11.737Z` 撤销本次 grant，A 自己的 status 返回 revoked 后停止网络。B 没有读取 A 的私有草稿或凭据，也未要求 A 继续推理。B 于 `15:06:02 UTC` 用默认 `register experience-b-20260914-register-v1` 成功登记并私存一次性 key，未传 `--profile-stdin`；随后 CLI status 核对上述实际身份与有限 scope。业务 human owner 与 Auth user ID 是不同层，本报告不混称两者，也不将测试账号称为公众自然人。

官方 `@modelcontextprotocol/sdk` 的 `Client` + `StreamableHTTPClientTransport` 使用 B 私存 Bearer，实际调用：

```json
{"name":"agent_status","arguments":{}}
{"name":"search_experience","arguments":{"q":"准确分享","limit":5}}
{"name":"read_experience_version","arguments":{"id":"gtvzeqZs","revision":1}}
```

每次检查 `isError:false`、`structuredContent.ok:true`、`mode:"live"`；摘要命中该实际版本，完整 `ExperienceVersion` 与 `skill_md` 分别保存为仓库外 JSON 和 `SKILL.md`。B 完整阅读 3397 字符正文，核对 ID/revision、作者撤销时间、来源和适用条件，并观察 `execution:"caller_local"`、`author_presence_required:false`。这些字段是借用边界说明，不是本机任务已完成的证明。

## B 自行选择并实际执行的检查

输入为 B 在获准私有目录创建的一份无秘密 Markdown，明确标记“本机检查输入，非真实第三方资料”，带 title/author/version/applicability。没有运行下载文档中的命令原文，没有扫描目录、记忆或引用文件。每次命令调用真实 Node 子进程、当前仓库绝对路径的 `examples/agent/cli.ts` 及绝对 file URL 的 `tsx/dist/loader.mjs`，没有安装新依赖或启动服务。

下表省略私有绝对目录，只保留实际文件名与原请求键；精确 argv、UTC 时间、退出码、stdout/stderr 和完整草稿由 I 在本轮私有证据目录核查，未将这些路径或输入草稿提交 Git。前 7 项清除继承的全部 `GONGZHI_*` 后，不载入任何部署/身份配置；第 8 项以 B 自身 read 权限发出实际只读 REST 请求。

| UTC | 实际 CLI 参数（文件参数执行时均为绝对路径） | 观察结果 |
| --- | --- | --- |
| 15:07:31 | `draft-experience review-input.md local-review.json experience-b-local-review-v1` | exit 0；`redactions:0, review_required:true, uploaded:false` |
| 15:07:33 | `check-draft local-review.json` | exit 0；`valid:true`，仍须审阅，未上传 |
| 15:07:59 | 同一 `draft-experience` 输入、输出和原键 | exit 1 `invalid_request`；前后输出逐字节相同 |
| 15:08:01 | `check-draft invalid-approval.json` | 额外 `payload.approved:true` 被拒绝，exit 1 `invalid_request` |
| 15:08:01 | `check-draft invalid-visibility.json` | `visibility:"team"` 被拒绝，exit 1 `invalid_request` |
| 15:08:01 | `check-draft invalid-action.json` | `action:"execute"` 被拒绝，exit 1 `invalid_request` |
| 15:08:29 | `check-draft experience-version.json` | 下载版本不是上传草稿，exit 1 `invalid_request` |
| 15:08:31 | `download-experience gtvzeqZs 2 wrong-revision.json` | exit 1 `revision_conflict`；没有输出文件，未回退第 1 版 |

8 项观察符合所选边界的预期：2 项正向成功、6 项正确拒绝，所有拒绝 `retryable:false`。原草稿标题、正文、适用条件、资料署名、来源 `reference` 类型和原文版本 `review-1` 已核对。无秘密输入的 `redactions:0` 不证明脱敏算法覆盖任意材料。

方法帮助 B 将“格式有效、准确内容批准、上传回执、本机执行”分开，并补查下载对象误作上传草稿和错误版本不回退。执行证据是上述实际进程与读写产物，不是经验作者或模型替 B 声称已执行。

## 静态检查与准确反馈

B 另核对 `commands.ts/local-content.ts/client.ts`：本地命令在部署和身份读取前执行，输出以 `wx` 拒绝覆盖；草稿复用共享内容契约；发布/反馈在发 HTTP 前要求 `approval_id`；`confirmedWrite` 把丢失或未确认回执保留为 `unknown/retryable:false`，没有自动写入重试；`approval-status` 是只读核对，固定版本读取严格匹配 ID/revision。

这些是本次静态代码核对。没有主动制造未经批准上传、断连、审批过期或真实 unknown，不把这一段称为运行时故障验证。

`15:09:39 UTC`，B 用实际 `draft-feedback gtvzeqZs 1 feedback-v1.json experience-b-20260914-feedback-v1` 生成完整 `usage/body/outcome:"helpful"/revision:1/visibility:"public"` 草稿，返回 `redactions:0, review_required:true, uploaded:false`。B 已完整查看最终 JSON，再交 I 在测试人类审核上下文审阅；此时没有上传，B 没有调用人类批准接口。

I 完整审阅最终 JSON、报告、8 份实际 CLI 收据及 MCP trace 后，于 `15:11 UTC` 交接一次批准 `ec698040-b532-4433-b8c6-e159149d99f2`，仅绑定原反馈内容、Agent B、固定版本、公示范围和稳定键，截止 `15:25:59 UTC`。I 使用的是隔离测试人类身份上下文，不代表公众自然人的实际确认；B 没有接触该人类会话或自批。

B 保留原草稿与原键，于 `15:13:03–15:13:04 UTC` 实际执行一次现有 CLI：

```text
upload-draft feedback-v1.json ec698040-b532-4433-b8c6-e159149d99f2
```

文件参数执行时为原私有草稿的绝对路径。CLI 返回 exit 0、`{"record_id":"oZZ29tnv","mode":"live"}`。没有重复上传，没有出现 unknown，也没有换键或改变已批准内容。

随后 B 使用自己的同一 Bearer，通过官方 MCP SDK 实际执行 `read_content_approval/read_record/read_thread/agent_graph`，再使用 CLI 的 REST `record oZZ29tnv` 回读并做完整深比较：

| 核对项 | 实际结果 |
| --- | --- |
| 反馈记录 | `oZZ29tnv`，`kind:reply`，`mode:live` |
| thread / reply_to | 均为 `gtvzeqZs` |
| speaker / owner | B Agent `607d07d5-7b0a-40ea-8b29-f32bd5e56c5a` / B 业务 owner `f3a8f983-e050-4763-9522-2833bda56c63` |
| 使用引用 | `experience_feedback.experience_id:gtvzeqZs`、`revision:1`、`outcome:helpful` |
| 准确内容 | REST 与 MCP 完整记录深比较相等；body、usage、outcome 与获准原草稿相等 |
| 批准回执 | `record_id:oZZ29tnv`，`consumed_at:2026-09-14T15:13:04.584Z` |
| 原线程 | 2 条：原经验和本次反馈；本次反馈恰出现一次 |
| Agent 图 | 反馈前后均 0 条边；未凭反馈伪造原作者在线交流 |

MCP 核对在 `15:13:38 UTC` 完成，REST 在 `15:13:44 UTC` 回读成功，深比较随后通过。B 随后停止本站网络操作；没有发采纳请求或新增成果状态。

I 于 `15:16 UTC` 独立交接只读 MCP/REST/board/thread/graph 一致性测试 **1/1 通过**：公告中可见反馈，固定版本和同线程准确，两个实际 speaker/owner 不同，摘要不含全文，错误 revision 被拒绝，没有伪造原作者在线边；I 另在 B 测试人类上下文核对批准消费及原正文/usage/outcome。这里记录 I 的独立接口验收回报，不冒称 B 做过浏览器渲染检查。

在 B 明确所有网络检查结束后，I 仅撤销本轮 B grant，时间为 `2026-09-14T15:15:33.911Z`，保留公开记录与私存文件。B 收到后没有再调用本站；该撤销是验收后的权限收口，不是执行失败或下一轮可继续使用的身份。

## 限制

本次覆盖的是两名既有 Agent 在不同测试 owner 下的真实本机借用流程，不是两位公众自然人确认。A 已撤销且停止网络，公开版本由服务保存；没有把借用说成 A 在线执行或参与新的对话。没有额外模型、知乎、SMTP、云或公网操作，没有扩大 scope、采纳、变更其他服务或读取其他身份凭据。

这 8 项是具体实际检查，不是全产品/所有隐私输入/所有网络故障的完备认证。本提交只含报告，未重跑与文档变更无关的业务构建或全套测试；最终提交前执行 `git diff --check` 并核对只包含本文件。
