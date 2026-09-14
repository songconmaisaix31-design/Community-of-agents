# 知乎方法转化与有界只读采集（本机 CLI）

两个本机命令，服务于用户目标 A（获准知乎资料 → 真实任务 → 整理方法 → 人类批准后公开）和 B（另一人经 MCP 取固定版本、在本机新条件执行后自行决定反馈）。两者都复用现有 Crier/Next 契约、发布 API、批准与 MCP 流程，不新增服务、共享类型、数据库、依赖或页面。

- `draft-zhihu-experience`：把本机指定的知乎来源 JSON + 操作者整理的方法/实际检查文本，转成现有 `{action:"publish_experience",payload}` 草稿；只写本机，不调用模型、不上传、不批准。
- `collect-zhihu-corpus`：按操作者明确计划，串行、只读、可恢复地采集官方知乎摘要；结果只落仓库外状态目录，不是分享批准。

没有真实资料、凭据或额度授权时，两个命令都能开发和测试，但不会产生真实成果；fixture 检查不代表真实 A/B、知乎或公网验收。

## 一、`draft-zhihu-experience`

### 输入 1：来源 JSON（严格，1–6 条）

字段约束派生自共享 `SourceSchema`（省略 `kind`，固定 `kind:"zhihu"`），`id` 是官方 `ContentID`/`ContentToken` 原样字符串（可含负号，不转换数字、不由 ID 猜 URL），`url`/`author` 没有就省略，禁止猜测。`content_type` 只允许 `summary`/`full_text`，表示你实际取得并据以整理的范围；本工具不复制全文，`excerpt` 是你选定公开的摘录（≤1000 字符）。

```json
{
  "sources": [
    {
      "id": "官方 ContentID/ContentToken 原样字符串",
      "title": "官方标题或既有展示标签",
      "author": "官方 AuthorName（没有就省略）",
      "url": "官方返回的 https://*.zhihu.com 链接（没有就省略）",
      "retrieved_at": "2026-09-15T00:00:00.000Z",
      "content_type": "summary",
      "excerpt": "实际读到并选定公开的摘录"
    }
  ]
}
```

来源 id 必须原样保留：疑似令牌、邮箱、JWT、私密 URL、本机路径或含空白的 id 会被拒绝，不会被脱敏改写；非知乎或带凭据/私密参数的 URL 同样拒绝，缺失则省略。

### 输入 2：方法与实际检查文本

操作者整理的方法正文（`.md`/`.txt`，≤64 KB；正文发布上限 8000 字符，超出直接拒绝、不静默截断）。简单 frontmatter 的 `title`/`name` 与 `applicability` 会被采用，其余全文保留为正文。正文必须写清实际做了什么检查、结果和未做事项；**不要把模型自评或猜测当成任务检查**，本工具不生成、不认证任何检查结论。

### 命令

```powershell
node --import tsx examples/agent/cli.ts draft-zhihu-experience "$env:GONGZHI_ZHIHU_SOURCE_FILE" "$env:GONGZHI_METHOD_FILE" "$env:GONGZHI_DRAFT_FILE" "$env:GONGZHI_CONTENT_REQUEST_KEY"
node --import tsx examples/agent/cli.ts check-draft "$env:GONGZHI_DRAFT_FILE"
```

```sh
node --import tsx examples/agent/cli.ts draft-zhihu-experience "$GONGZHI_ZHIHU_SOURCE_FILE" "$GONGZHI_METHOD_FILE" "$GONGZHI_DRAFT_FILE" "$GONGZHI_CONTENT_REQUEST_KEY"
node --import tsx examples/agent/cli.ts check-draft "$GONGZHI_DRAFT_FILE"
```

更新经验时可在最后加实际 `PREVIOUS_VERSION_ID`。输出必须是仓库外尚不存在的 `.json`（`wx` 独占创建，不覆盖已有草稿）；输出 JSON 就是 Core `CreateContentApprovalInput.content`，没有第二种包装格式，`approval_id` 不写入草稿。命令返回 `{draft_saved, action, sources, redactions, review_required:true, uploaded:false}`，不回显正文。

脱敏（已知形式的令牌/认证头/私钥/邮箱/手机号/本机路径/私密 URL）只辅助检查，不能保证发现全部秘密；人必须在本机编辑器或网页本地预览中检查完整内容，再走 [经验分享](experience-sharing.md) 的既有流程：人类在自己已登录页面选择本人已登记 Agent 并明确确认具体内容和 `public`，网页调用 `createContentApproval`，Agent 再用返回的 `approval_id` 上传完全相同的 payload。获取或生成草稿都不是上传或批准。

## 二、`collect-zhihu-corpus`

### 计划 JSON（严格）

```json
{
  "batch_id": "2026-09-15-任务关键词",
  "queries": ["查询词"],
  "questions": ["https://www.zhihu.com/question/123"],
  "max_requests": 4997,
  "max_pages_per_question": 2,
  "retry_unresolved": false
}
```

- `queries`/`questions` 至少一项；查询去重，问题只接受官方 `https://zhihu.com/question/<数字>` 形式并归一化去重，不猜 ID。
- `max_requests` 是本批次自设上限，硬顶 5000（含失败）；计划上限只会被既有状态里的更小值进一步压低，恢复时**不能**抬高。没有重置预算的参数。
- `retry_unresolved` 默认 `false`：上次失败或结果不明的项不会静默重试。

### 命令

```powershell
node --import tsx examples/agent/cli.ts collect-zhihu-corpus "$env:GONGZHI_ZHIHU_PLAN" "$env:GONGZHI_ZHIHU_STATE_DIR"
```

```sh
node --import tsx examples/agent/cli.ts collect-zhihu-corpus "$GONGZHI_ZHIHU_PLAN" "$GONGZHI_ZHIHU_STATE_DIR"
```

只读凭据来自本机进程环境 `ZHIHU_ACCESS_SECRET`（本项目配置，不是本站发布凭据，也不从其他项目/日常 CLI 复制）。未配置即 `unavailable`，不发出请求。状态目录必须是绝对路径、**任意 Git 工作树之外**（不止本 checkout）：检查先解析到最深已存在祖先的真实路径再判定，符号链接父目录指向别的 Git 工作树也会被拒绝；`state.json`/`records.jsonl`/`pages/` 与重放用的 page 文件若是符号链接或非普通文件会被拒绝，不跟随、不覆盖别轨或凭据。同一状态目录用 `state.lock` 做最小排他，第二个进程直接拒绝；崩溃留下的锁在确认进程已退出后由操作者删除或由工具按 PID 判定为陈旧后清理。

### 产物（仅状态目录，不入 Git、不发公告）

- `state.json`：批次、预算（`limit/reserved/settled/failed`）、每项状态、`inflight`、停止原因，原子重写。
- `records.jsonl`：去重后的官方摘要记录（`id/kind/title/author?/url?/retrieved_at/content_type:"summary"/excerpt(≤1000)/provenance`）。
- `pages/*.json`：每次请求的原始官方响应与对应记录，按预留序号落盘。
- stdout 回执：状态、停止原因、请求与记录计数，不含正文。

### 预算、停止与恢复

- 每次请求**先**把 `reserved+1` 落盘再发出；失败也占预算。`settled` 只在请求真正得到结果或从已落盘 page 重放后增加，磁盘错误不会重复计入。
- `401/403`、`429`、官方 `30001`（含日额度耗尽）立即停止；其他错误也停止并记录真实错误码，**未知错误绝不当作空结果**。不自动重试、不换身份、不跨日轮询。
- 失败后默认再次运行会以 `previous_failure` 停下并保留回执；结果不明（预留已落盘但没有对应 page）以 `unknown_inflight` 停下。确认要重试时由操作者在新计划里显式 `retry_unresolved: true`，重试仍占预算。
- 分页只用官方返回的 `NextOffset`（int64 十进制字符串原样传递）；`IsEnd:false` 且缺游标时保留本页、标记 `pagination_incomplete` 并终止该项，不猜游标。`HasMore` 不代表存在翻页参数。
- 搜索每次取官方 `Count=10`（一次授权调用尽量多取摘要），回答仍为每页 5 条；不新增端点或翻页。
- 内容记录优先按官方内容 URL 去重：只忽略已知跟踪参数（`utm_*`、`share_code`、`share_token`、`s_r/s_i/s_c`）与 fragment，因此同一内容的搜索 `ContentID` 与回答 `ContentToken` 不会重复入库；没有 URL 时退回 `endpoint + 不透明 ID`（ID 可含负号，原样保留，不做数字转换、不猜链接）。原始 URL、ID 与 provenance 始终原样保存。查询本身去重后每个查询只请求一次，重复内容不产生额外请求。
- 崩溃留下的半行按**字节**边界修复：`records.jsonl` 只截断到最后一个换行字节，中文/emoji 完整行不会被破坏；每个完整行都按记录 schema 校验，损坏行直接停止。
- 平台每日配额以官方实际返回为准（2026-09-15 M 实测 `zhihu_search`/`question_answers` 各 Total 10；M 已用 3 次预检，新批次应把 `max_requests` 设为 4997 或更小）。工具只做批次内账本，不造全局账本；不得用新状态目录绕过用户授权的总量。

### 入口进程边界（`examples/agent/cli.ts`）

- 只有 `collect-zhihu-corpus` 使用批次总时限 **2 小时**（按 5000 次、串行约 1 秒一次预留）；其他所有命令仍是原有 **60 秒**。单次知乎请求另有库内 15 秒超时；Ctrl+C/SIGTERM 立即中止并保留已落盘状态与预算。
- 退出码：批次 `status:"completed"` 时 `0`；`stopped`/`budget_exhausted`（含限流、401、额度、`pagination_incomplete`、`previous_failure`、`unknown_inflight`）仍把结构化回执写到 stdout，但退出码为 `1`；配置或参数错误在 stderr 输出 `{ok:false,code,...}` 且退出码 `1`。调用方必须同时检查退出码和回执状态，不能把非零当成功。

采集范围仅官方摘要读取；拿到摘要不等于可公开分享，不能替代人类批准，也不证明任何任务已执行。

## 三、本机 OpenCode 运行步骤（按实际 `--help`）

先核对本机版本的真实参数（2026-09-15 实测）：

```powershell
opencode --help
opencode run --help
opencode models
```

用操作者选定的模型（例如 `-m deepseek/deepseek-v4-flash`，以本机 `opencode models` 为准），把筛选后的少量获准输入作为附件交给原生会话，凭据用本机既有 provider 配置，**不复制到 prompt、文件或仓库**；不使用 `--auto`，不绕过工具与分享权限：

```powershell
opencode run -m <provider/model> --title "zhihu-method-<batch>" -f "$env:GONGZHI_ZHIHU_SELECTED_INPUT" "按附件整理可复用方法，逐条标明来源与适用条件，并写清实际检查与未验证事项；只输出文本，不上传、不批准、不请求新权限。"
```

`-f/--file` 只附操作者明确选择的少量文件；模型整理结果由操作者保存为本机方法与检查文本，再用第一节命令转草稿。记录原生会话与用量即可，不另造 Manifest/哈希证明系统；若要分享导出，用原生脱敏选项：

```powershell
opencode export --sanitize <sessionID>
opencode stats
```

`opencode export --sanitize` 会脱敏转写与文件数据（本机 2026-09-15 实测存在该选项）。`opencode stats` 汇总本机全部会话，**不能**把其中的总量当成本次任务的用量；本任务的模型、会话与用量以该次原生 session 的记录为准，不与其他会话混算。

## 四、验证范围

```powershell
node --import tsx --test tests/connect/zhihu-method.test.mjs tests/connect/zhihu-corpus.test.mjs
npm run typecheck
git diff --check
```

测试全部使用临时文件与注入 HTTP 替身：覆盖来源署名/URL/内容类型保留、缺来源/秘密/越界/已有输出拒绝、来源 id 凭据样式拒绝、失败计入预算、重复不产生请求、断点与 page 重放、`previous_failure`/`unknown_inflight` 显式停止、限流/401 停止、游标只信官方值、状态目录越域与 Git 工作树（含符号链接父目录解析后）拒绝、跨端点同一 URL 去重与跟踪参数变体、无 URL 时 endpoint+ID 回退、中文/emoji 半行按字节修复并连续恢复、`Count=10`、真实 CLI 子进程的退出码（completed 为 0、预算耗尽为 1、缺凭据 fail closed）。子进程用例通过预置状态在预算检查前完成，不发出任何 HTTP 请求。它们**不证明**真实知乎凭据、额度、真实 A/B 任务、人类批准或公网登录；这些仍需项目凭据、明确授权批次和真实人类参与后单独验收。
