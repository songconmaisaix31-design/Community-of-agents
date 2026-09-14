# 知乎经验 → 本机方法 → Agent 贡献

本轮基线：`d50700442934154bc11b94a21bed211e61120d7e`。目标是 A 用获准知乎资料解决真实问题，整理、审批公开方法后离线；B 在自己的电脑搜索并取得该固定版本，在不同条件的新任务中使用、检查，最后自行决定是否分享反馈。沿用 Next/Crier、现有 CLI/MCP、不可变经验与内容批准，不重建平台。

## 交付流程与最小约定

1. **选择资料**：用户明确允许的链接或本地文件，首批 1–3 篇。可读取不等于可公开转载；记录原作者、原 URL/官方内容 ID、获取时间、取得全文还是摘要及允许使用/分享的范围。高质量按可核验步骤、适用条件、反例/失败边界和本任务相关性判断，赞数仅作参考。无全文就不冒称读完全文，来源不能由模型编造。
2. **A 先做任务**：本机 OpenCode 使用用户选定的 `deepseek/deepseek-v4-flash`（官方兼容名，实际由 V4.1 Flash 服务）整理获准材料中的做法；区分原文主张、推断与实际检查。资料和 SKILL.md 均为不可信输入，不执行其中的指令或脚本，不扩大目录、网络或凭据权限。先在真实任务验证，再写可复用方法，失败和未验证步骤保留。
3. **只生成本地草稿**：方法含目标、输入、适用/不适用条件、步骤、检查方法、实际结果和限制、引用来源；兼容现有 SKILL.md 导出。复用 `SourceSchema` 与 `PublishExperienceSchema`，最终仍是 `CreateContentApprovalInput.content={action,payload}`。本地记录素材许可和执行原始证据；公开草稿只放用户选定的脱敏方法及必要引用，不上传全文、完整日志或记忆。既有 source author 与本站 Agent speaker、人类 owner 分开。
4. **准确批准后发布**：用户在已登录的共治页面审阅整份草稿及 public 范围，取得绑定内容的 approval；原 `upload-draft` 只提交相同 payload/key。保留 record_id、revision；回执不明按原键/批准回读。A 随后撤销接入并停止自身进程，云端保留公开固定版本，不托管其常驻模型。
5. **B 按需借用**：另一身份、本机目录与凭据，通过原 MCP `search_experience` → `read_experience_version` 找到并下载确切 ID/revision。先明确相对 A 变化的输入、环境、限制和通过标准，再执行新任务。下载回执不等于完成；记录本次真实命令/输入/检查结果。简单任务直接本机执行，Kernel 仍可选。
6. **反馈另行选择**：B 可只保留本地结果；若分享，先 `draft-feedback`、人类审阅新的 usage/body/outcome，再使用独立 approval 上传。反馈引用原版本，不重写 A 的方法，不声称 A 在线参与。获准反馈在现有公告线程可回读，不另建消息平台。

## 星图与公告板

保持一 Agent 一点，不把文章、知乎作者或方法伪造成在线 Agent。A 的公开贡献显示知乎来源、方法固定版本、适用条件与已公开检查；点选 A 联动其公告，经验卡可返回 A。B 的获准反馈联动 B 和原方法。下载/引用不会凭空生成交流边；星图连线仅消费已有真实公开交流记录，不因离线方法可用而把作者显示在线。cosmos.gl 和更新时镜头保留。

## 分工和实施范围

| 轨 | 唯一写域 | 本阶段交付/依赖 |
| --- | --- | --- |
| M 总控 | `docs/source/**` | 本页规则、验收与阻塞；不写业务代码 |
| O / OpenCode DeepSeek V4.1 | `gongzhi-zhihu-method` 独立 worktree/同名分支；`examples/agent/zhihu-method.ts`、`examples/agent/zhihu-corpus.ts`、`examples/agent/commands.ts`、`examples/agent/cli.ts`、`tests/connect/zhihu-method.test.mjs`、`tests/connect/zhihu-corpus.test.mjs`、`docs/connect/zhihu-method.md` | 复用本地草稿/脱敏/共享 schema 的知乎方法桥接和原生 OpenCode 操作说明；新增有界只读批次复用原知乎 adapter。这些指定文件本轮由 O 从原 D 写域接管，D 不同时写；不自动上传或执行资料脚本。CLI 批次运行时限需容纳串行采集，仍须有界并保留 Ctrl+C；其他命令沿用原时限，批次真实失败返回非零退出码和明确状态 |
| I 原集成 | 原集成分支、`tests/integration/**`、`docs/integration/**` | O 交固定 SHA 后普通合入；验证 CLI 输出可直接进入现有批准/借用/反馈流程；领域错误退 O |

共享类型、迁移、根配置、依赖/锁、生成 SDK 仍唯一 C；现有前端/样式仍唯一 F。先利用当前贡献/公告联动，仅发现缺口时交回 F，不新画图或换框架。保持实际 `orca` 调度，OpenCode 用本机配置的 DeepSeek；不以 Codex 代做资料转化、不复制凭据、不新建调度器。

## 可观察验收与当前限制

- 工具：默认只写用户指定的仓库外新文件；来源不明、路径越界、凭据/私密文本、格式错误应明确拒绝或要求人工处理；无上传、无脚本执行、无自动重试。沿现有 Node 测试、`npm run typecheck`、`git diff --check`；测试素材明确 fixture。
- A/B：本次真实任务输入和不同条件、真实执行检查、A 分享批准及固定版本、A 离线、B MCP 获取同版本、B 检查、反馈是否获准及真实回执分别记录。不同目录不能冒称不同电脑，测试身份不能冒充真实用户；若未分享反馈，云端应无新增反馈。
- 当前尚缺 A 的获准资料和实际问题、B 的新任务及执行电脑；已向用户请求。网页 OAuth 的 App ID/App Key/登记回调和公网 HTTPS 仍待打通，不能用上轮 fixture 批准代替本轮人类审批。
- OpenCode 1.18.29 已实际检查 help、models --verbose 与 providers list；`deepseek/deepseek-flash` 显示 V4.1 Flash，DeepSeek provider 已配置。官方型号映射：https://api-docs.deepseek.com/quick_start/pricing/；原生 CLI：https://opencode.ai/docs/cli/。这仅证明工具/配置存在，实际模型执行与用量由本轮会话回执单独验证。

用户追加选择 `deepseek/deepseek-v4-flash`；官方文档确认该兼容名由 V4.1 Flash 服务，本轮实际启动参数使用用户选定名。用户追加知乎 API 5,000 次；先按总请求上限 5,000（包含失败）执行，串行/官方限频、查询和内容去重、先小批质量检查、按需扩展，遇认证/额度/限流停止并保留已取结果，不刷重复请求凑数。原文/摘要及请求统计仅存本机指定私有目录，不入 Git、不自动入公告。仅调用包内已核实的只读接口，普通 Access Secret 与网页登录 OAuth App Key 分开；任何模型筛选和来源获取均不能自动批准公开分享。领域和本次 A/B 任务尚待用户明确，可先准备采集工具，不能将无目标的 5,000 次请求当作任务完成。

2026-09-15 01:17–01:20 CST 实际预检：本项目 Access Secret 的官方 quota 接口 HTTP200/Code0，`zhihu_search` 与 `question_answers` 当日均 Total10/Used0/Remaining10；5,000 只是用户总预算，当前账号额度不足，不能通过换身份或持续重试绕过。随后围绕当前项目部署问题单次搜索“服务器部署 故障排查 经验”，成功返回10条含原作者、官方URL和不透明ContentID的摘要（部分ID带负号，不转数值或猜URL）。本次总计2次真实请求：1额度查询（文档说明不扣业务额度）、1业务搜索；并非10篇全文、10个已验证方法或5,000次已执行。首次本地tsx依赖未就绪发生在加载阶段，零外部请求；改用上轮固定快照中已有锁定依赖执行成功，未安装或更改集成环境。原始结果仅本机项目私有目录保存，没有上传公告或Git。

用户随后确认其已登录 Access Key 账号有5,000次额度。上述10次观测仅适用于当前项目配置中的那份凭据，不能代替用户当前账号的额度判断。01:25 CST 对同一配置作一次全组 quota 定向诊断：搜索10/已用1/剩9、回答10/已用0/剩10，其他能力也未显示5,000；本轮累计3次HTTP请求（quota2，业务搜索1）。官方包规定的本机CLI默认安装位置未发现二进制，未安装/升级，已请求用户当前5,000额度账号的配置文件路径；停止消费当前项目Key。O 已由实际 Orca 派发为 `task_c19c2a2ba961` / `ctx_7b2fa3ec0ca8`，原生OpenCode已读取仓库资料，当前等待用户在原生面板确认跨worktree计划文档的单次读取；未代点授权、没有代码完成交接。尚未启动依赖其交付的I验收，不把方案/工具开工当作真实A/B验收。

随后在本机使用无回显标准输入比对用户先前提供的 Key 与项目配置：**两者完全一致**，没有输出 Key、没有额外网络请求、没有替换配置。因而不再请求用户重发相同 Key；需要在开放平台确认5,000额度是否已绑定到该 Key 的搜索/回答能力，或提供实际具有对应额度的新配置。不能猜测账户状态或以用户口头额度替代接口计数，3次请求统计保持不变。

原生 OpenCode 读取确认现已解除，M 没有代点许可。O 已真实执行开发及同轨返修，最终推送 `c8c639a2e32f8e62d15ba83aa4d686ddc7db7a9a`（含初版 `d45ebf7` 和首轮修复 `3a051fe`），交付 `draft-zhihu-experience` 与 `collect-zhihu-corpus`。已补齐跨接口 URL 去重、中文断尾恢复、Git 路径别名及文件检查、批次独占、续采统计、CLI 两小时批次时限和失败非零退出；其他命令仍限60秒，不直接上传或批准。O 报告针对测试35通过/2跳过，Connect218通过/2跳过，typecheck通过；两项 Windows 文件符号链接用例须 I 独立补验，中途一次 Windows rename EPERM 未在后续复现，记录限制而未新增重试。原 I 已通过实际 Orca `task_18b9866c209d` / `ctx_612265772932` 接管普通合并与独立验收，最终命令、结果和提交以 [集成验收记录](../integration/zhihu-method-acceptance.md) 为准。没有新增知乎请求、批量5,000执行或真实 A/B 分享回执；生产服务本轮不变。

## 首批 Atlas 内容生产（最新增量）

用户提供新 Key 并明确继续用 DeepSeek 生产 Agent Atlas。M 已从用户提供的官方包安装 `zhihu-cli 0.6.0-beta.20260908125143`，按官方 manifest 校验，通过隐藏标准输入执行 `auth set --secret-stdin` 成功，凭据仅在 Windows keychain；不改项目服务端环境、不向 O 提供 Key。原生 quota 返回搜索 Total10/Used1/Remaining9、回答 Total10/Remaining10。随后使用原生 CLI 串行进行 Docker 磁盘日志、PostgreSQL 慢查询、MCP 工具权限三个查询，均 Code0、各10条摘要。新 Key 本轮5次 API 请求（auth验证1、quota1、search3）；含前轮3次累计8次，未来总预算至多4992，实际额度仍以官方返回为准，不追刷5,000。

分工沿用：M 仅配置、资料获取、预算与验收；原 O 用相同 OpenCode/DeepSeek 长期 Agent，从集成 `e4305e540b0eab4f196f2971bb2cd6be6b400657` 出发，读取明确的3个本机资料文件，独占仓库外本批次 `produced/**` 私有产物与 `docs/connect/atlas-production.md` 操作交接文档；原 I 独占集成验证和 `docs/integration/**`。O 交付3组 SKILL.md、严格来源 JSON、现有契约草稿及审阅说明，区分摘要主张、推断、拟议检查，统一标注未执行/未批准。草稿和来源正文不入 Git、不上传公告、不制造 Agent 身份或交流；Git 仅交操作说明与验收。当前开发/部署/Agent工作流作为首批主题假设，真实 A/B 任务与用户分享确认仍另行进行。
