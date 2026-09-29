# Connect D：经验分享与按次执行交接

2026-09-14；分支 `songconmaisaix31-design/gongzhi-connect`。仅修改本轨 examples/agent、lib/gongzhi/agent、runs 路由、tests/connect、docs/connect；共享接口、数据库、依赖、页面由原 owner 提供。

## 已推送片段及集成来源

- `955ebb67151d6d2c576fb1d61e6a3bc849062eb0`：指定单份资料生成本地脱敏草稿、准确批准后上传、摘要搜索、固定版本下载和反馈草稿。
- `e857fec9ecd803dad37b09aa82054430922c5de2`：批准回执回读，SDK 仅发送宿主固定批准内容，method_refs 限本会话已读取版本。
- `b3086bc7c475e660099c11b9c04dec4a823987b6`：中断后保留已观测模型用量。
- 普通合入集成 `3ae9a260792173cb9ec64a0686b849c2f8028f71`、契约 `f78cdf0a1f62c09ef32bbbcafda3e85f390b25a6`、经验服务 `502d46621db03befb01cf94f22c98fc0fb99d595`、策略 `14222e1278cc2e1a21b25beca34abe1be643a284`、限额/查询服务 `6bf6e3028d6e3ac3fd047a5b3c7f209c811fdd2b`；没有 reset、rebase 或 force push。

最后执行器片消费 Core 的 `Run.budget` 和 `getRunPolicy`，新运行必须匹配实际模型及上限；缺模型/价格/额度继续 unavailable。使用一次被等待的 generateText、显式零重试、最多四步/2000 输出/两次知乎检索/60 秒，可按冻结配置调低步数/输出。onStepFinish 只记录观测用量；全部调用且逐步/汇总用量完整一致才允许结算，否则保留费用预留。用量超界通过实际 AbortSignal 中止，不能仅依靠 SDK 回调抛错。

执行期间只监视当前 run，每秒使用 Core `getRun(actor,id,{signal,timeout_ms:1000})`，取消、终态或读取失败中止 provider；退出时 abort 并 await 状态读取清理。没有后台模型任务或调度器。数据库并发/费用原子准入和迁移 0014 由 Core/I 负责，D 未执行数据库迁移。

## 前端与既有 Agent 接法

- 本地 JSON 直接是 `CreateContentApprovalInput.content={action,payload}`。完整可复制命令见 [experience-sharing.md](experience-sharing.md)。脱敏仅辅助，必须人类检查完整内容；接入、预览、批准和上传分开。
- `upload-draft FILE APPROVAL_ID` 使用 Agent 自己凭据和原 payload/key；unknown 用 `approval-status APPROVAL_ID` 查实际 record_id，再回读记录。批准过期/撤销后可查已消费回执，不意味着允许重传。
- `search-experience` / MCP `search_experience` 先读摘要；`download-experience ID REVISION FILE` / MCP `read_experience_version` 固定版本供调用者本机使用。来源署名、原发布 speaker、人类 owner 分开；下载不执行脚本、不假扮原作者。
- 本机真实结果写入 `draft-feedback`，人另行批准准确反馈后，通过既有线程回传；不自动采纳。
- 同步 POST 首次未拿到 run ID 时，使用唯一 `apiClient.lookupRun({need_id,idempotency_key})`；D 的 `GET /api/gongzhi/runs` 解析 Core RunLookupSchema，按当前人的身份调用查询服务。前端只在本次请求期间有界查询，取得真实 ID 后使用原 cancelRun；unknown 继续按原参数核对，null 不证明未执行，不能换键重启模型。

## 实际检查

- 首片 CLI/客户端/分享 fixture：31/31；第二片分享/SDK fixture：17/17。
- `node --import tsx --test tests/connect/*.test.mjs`：完整 156/156 通过；该次包含费用/取消行为，运行查询路由的新增文件在后续专项中验证。
- 合入 Core 最终服务后，`node --import tsx --test tests/connect/run-lookup.test.mjs tests/connect/assistant.test.mjs`：44/44；包括匿名查询拒绝、原键/null/ID 语义、缺预算/模型不符、降低上限、部分/缺失/不一致费用、超界立即中止、跨进程取消和 pending 读取清理。
- 最终 `npm run typecheck`、`npm run build:backend`、`git diff --check` 通过。曾因本 worktree 缺锁内 MCP SDK 依赖导致 typecheck 失败，随后仅运行 `npm ci --ignore-scripts --no-audit --no-fund` 恢复锁定 node_modules，未改根声明或锁文件；上列为修复后检查。
- Core 确认 3079 更新至经验服务 502d466 后，D 匿名实际执行 connection：gongzhi.v1、同源端点、identity_verified:false；实际 GET `/api/gongzhi/experiences/search?limit=2` 为 200/live、items=[]。只读接口可用，不代表身份或分享已验收。

## 仍未执行

所有模型/HTTP 测试均明确使用 fixtures 或本机模拟服务；D 没有调用收费模型/知乎/SMTP，没有读取旧 Agent 或人类 token，没有向体验数据库新增记录。Core 自报的官方 Auth/PG 检查属于 Core 证据，不能冒充 D 独立执行。

本次尚未取得 D 独有的新有限 grant。A 精确批准分享后离线、B 经真实 MCP 固定版本完成本机可重现任务、反馈再获准确批准的整链，仍需 Root/I 安排独立身份和批准，不能用上述 fixtures 或历史交流记录替代。3079 仍运行经验服务 502d466/迁移0013；本片限额/查询/前端需 I 合并并显式装配0014后复验。无生产部署、云端配置或费用授权变更。
