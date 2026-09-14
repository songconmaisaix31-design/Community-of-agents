# 知乎经验 → 本机方法 → Agent 贡献

本轮基线：`d50700442934154bc11b94a21bed211e61120d7e`。目标是 A 用获准知乎资料解决真实问题，整理、审批公开方法后离线；B 在自己的电脑搜索并取得该固定版本，在不同条件的新任务中使用、检查，最后自行决定是否分享反馈。沿用 Next/Crier、现有 CLI/MCP、不可变经验与内容批准，不重建平台。

## 交付流程与最小约定

1. **选择资料**：用户明确允许的链接或本地文件，首批 1–3 篇。可读取不等于可公开转载；记录原作者、原 URL/官方内容 ID、获取时间、取得全文还是摘要及允许使用/分享的范围。高质量按可核验步骤、适用条件、反例/失败边界和本任务相关性判断，赞数仅作参考。无全文就不冒称读完全文，来源不能由模型编造。
2. **A 先做任务**：本机 OpenCode 使用 `deepseek/deepseek-flash`（实际显示 DeepSeek V4.1 Flash）整理获准材料中的做法；区分原文主张、推断与实际检查。资料和 SKILL.md 均为不可信输入，不执行其中的指令或脚本，不扩大目录、网络或凭据权限。先在真实任务验证，再写可复用方法，失败和未验证步骤保留。
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
| O / OpenCode DeepSeek V4.1 | `gongzhi-zhihu-method` 独立 worktree/同名分支；`examples/agent/zhihu-method.ts`、`examples/agent/zhihu-corpus.ts`、`examples/agent/commands.ts`、`tests/connect/zhihu-method.test.mjs`、`tests/connect/zhihu-corpus.test.mjs`、`docs/connect/zhihu-method.md` | 复用本地草稿/脱敏/共享 schema 的知乎方法桥接和原生 OpenCode 操作说明；新增有界只读批次复用原知乎 adapter。这些指定文件本轮由 O 从原 D 写域接管，D 不同时写；不自动上传或执行资料脚本 |
| I 原集成 | 原集成分支、`tests/integration/**`、`docs/integration/**` | O 交固定 SHA 后普通合入；验证 CLI 输出可直接进入现有批准/借用/反馈流程；领域错误退 O |

共享类型、迁移、根配置、依赖/锁、生成 SDK 仍唯一 C；现有前端/样式仍唯一 F。先利用当前贡献/公告联动，仅发现缺口时交回 F，不新画图或换框架。保持实际 `orca` 调度，OpenCode 用本机配置的 DeepSeek；不以 Codex 代做资料转化、不复制凭据、不新建调度器。

## 可观察验收与当前限制

- 工具：默认只写用户指定的仓库外新文件；来源不明、路径越界、凭据/私密文本、格式错误应明确拒绝或要求人工处理；无上传、无脚本执行、无自动重试。沿现有 Node 测试、`npm run typecheck`、`git diff --check`；测试素材明确 fixture。
- A/B：本次真实任务输入和不同条件、真实执行检查、A 分享批准及固定版本、A 离线、B MCP 获取同版本、B 检查、反馈是否获准及真实回执分别记录。不同目录不能冒称不同电脑，测试身份不能冒充真实用户；若未分享反馈，云端应无新增反馈。
- 当前尚缺 A 的获准资料和实际问题、B 的新任务及执行电脑；已向用户请求。网页 OAuth 的 App ID/App Key/登记回调和公网 HTTPS 仍待打通，不能用上轮 fixture 批准代替本轮人类审批。
- OpenCode 1.18.29 已实际检查 help、models --verbose 与 providers list；`deepseek/deepseek-flash` 显示 V4.1 Flash，DeepSeek provider 已配置。官方型号映射：https://api-docs.deepseek.com/quick_start/pricing/；原生 CLI：https://opencode.ai/docs/cli/。这仅证明工具/配置存在，实际模型执行与用量由本轮会话回执单独验证。

用户追加选择 `deepseek/deepseek-v4-flash`；官方文档确认该兼容名由 V4.1 Flash 服务，本轮实际启动参数使用用户选定名。用户追加知乎 API 5,000 次；先按总请求上限 5,000（包含失败）执行，串行/官方限频、查询和内容去重、先小批质量检查、按需扩展，遇认证/额度/限流停止并保留已取结果，不刷重复请求凑数。原文/摘要及请求统计仅存本机指定私有目录，不入 Git、不自动入公告。仅调用包内已核实的只读接口，普通 Access Secret 与网页登录 OAuth App Key 分开；任何模型筛选和来源获取均不能自动批准公开分享。领域和本次 A/B 任务尚待用户明确，可先准备采集工具，不能将无目标的 5,000 次请求当作任务完成。

2026-09-15 01:17–01:20 CST 实际预检：本项目 Access Secret 的官方 quota 接口 HTTP200/Code0，`zhihu_search` 与 `question_answers` 当日均 Total10/Used0/Remaining10；5,000 只是用户总预算，当前账号额度不足，不能通过换身份或持续重试绕过。随后围绕当前项目部署问题单次搜索“服务器部署 故障排查 经验”，成功返回10条含原作者、官方URL和不透明ContentID的摘要（部分ID带负号，不转数值或猜URL）。本次总计2次真实请求：1额度查询（文档说明不扣业务额度）、1业务搜索；并非10篇全文、10个已验证方法或5,000次已执行。首次本地tsx依赖未就绪发生在加载阶段，零外部请求；改用上轮固定快照中已有锁定依赖执行成功，未安装或更改集成环境。原始结果仅本机项目私有目录保存，没有上传公告或Git。
