# 进化层 + 记忆层搭建：一页执行计划

## 目标与范围

把「经验共享」这一条主线拆成两层推进：**记忆层**（存：独立 `/zh/library/` 经验库）与**进化层**（变：反馈 → 候选改进 → 人类批准 → 新版本 → 显式谱系）。沿用 Next/Crier、Postgres、知乎网页登录、人类 owner、Agent scopes、内容审批与既有经验共享契约；不新增模型自动提炼、向量库、常驻 Agent 群或私有/群组 ACL。

源码基线以 `integration/gongzhi-mvp` 为准，但**契约仍由 C 唯一拥有**。先解决 lineage 契约分叉（见下），形成统一基线 SHA，不临时把 integration 当唯一契约源。各轨保留互斥 write_paths、独立 worktree 与现有看板交接。先保留当前部署与参赛提交基线，再按既有授权流程部署。

## 契约现状与必须回填

- `integration/gongzhi-mvp` 已含 `ExperienceLineage`（root + versions，版本含 `feedback: BulletinRecord[]` 与 `referenced_by`）、`readExperienceLineage`。
- **core 分支（`songconmaisaix31-design/gongzhi-core`）缺失 lineage 提交 `538db16`**，其 `contracts.ts` 无 lineage 类型。C 是 `contracts.ts` 唯一 owner，必须把 lineage 增量与测试回填 core 分支，形成统一基线 SHA；不临时以 integration 为唯一契约源。

## 决策记录（已定，不逐项再确认）

- **D2 记忆层浏览**：`searchExperience` 增轻量 `tag` 过滤 + 游标分页，保留现有 `limit` 与调用兼容；`kind` 仅在已有明确数据语义时支持，不新增分类体系。经验库默认一经验展示一个最新已发布版本，历史版本进详情。浏览增强不阻塞真实闭环。
- **D3 显式关联反馈**：`publishExperience` 增可选多反馈 ID 关联；普通首次发布可为空，从反馈发起的改进必须带真实关联。`previous_version_id` 只表父版本，不推导反馈来源；历史缺失关联不猜测补齐。
- **D4 审批快照**：草稿本地可存；提交审批后形成**服务端固定快照**。复用现有审批存储，不建独立草稿平台；允许必要最小迁移。核查 `createContentApproval` 实际语义，发布只能消费对应已批准快照；重要修改重新送审；重复请求不重复生成版本。
- **D5 路由**：独立 `/zh/library/`，board 保留入口，复用组件与同一数据源。Pages 默认只读或明确演示，写操作跳主站。

## 验收主线（端到端，唯一硬验收）

固定经验版本被**另一个 Agent 实际用于任务** → 使用记录与反馈 → 候选修改及检查依据 → **人类批准** → 新版本及**显式谱系** → 接收方主动采纳 → 新任务使用或回退。

- D 必须交付**一条已有 MCP/CLI 路径的真实加载与运行回传**（借用 → 执行 → 回传反馈），复用现有结果记录，不重建执行器或评测平台。
- 无效果证据就标注「待验证」，不把发布成功宣传成能力提升。

## 轨道与文件责任

| 轨 | 固定工作树 / 分支 | 交付 |
| --- | --- | --- |
| C Core | gongzhi-core / songconmaisaix31-design/gongzhi-core | C1 回填 lineage 契约与测试，统一基线 SHA；C2（D2）`searchExperience` tag 过滤 + 游标分页，保留 limit/兼容；C3（D3）`publishExperience` 增 `based_on_feedback_ids`（多 ID 可空，从反馈发起必带真实关联）+ 迁移/校验/幂等；C4（D4）核查 `createContentApproval` 语义，定「服务端固定快照」方案（复用 digest 或最小迁移），发布只消费已批准快照、重复请求不重复生成版本；C5 谱系纳入「反馈 → 新版本」显式边。 |
| D Connect | gongzhi-connect / songconmaisaix31-design/gongzhi-connect | D1 交付真实 MCP/CLI 路径：`search_experience` → `read_experience_version` → 本机执行 → `post_experience_feedback` 回传，复用 `examples/agent/cli.ts`，不重建执行器；D2 CLI 支持 `based_on_feedback_ids`，同步 `docs/connect/**`、`agent-skill.md`。 |
| F Frontend | gongzhi-kimi-adaptation / songconmaisaix31-design/gongzhi-kimi-adaptation | F1（记忆层）独立 `/zh/library/`（新 `zh/library/index.html` + assets），复用组件与数据源，board 保留入口；搜索/tag/分页/版本切换/来源/适用条件/SKILL.md 下载，默认最新版本、历史进详情。F2（进化层）进化页升级为可操作闭环：版本+反馈列表 → 发起候选改进（本地草稿）→ 人类批准 → 带 `previous_version_id` + `based_on_feedback_ids` 发布 → 谱系回链；「理论设计」保留为说明不混入操作流。F3 打通记忆 ↔ 进化互跳，主站与 Pages 共用资源。F4 Pages 默认只读/明确演示，写操作跳主站。 |
| I Integration | gongzhi-integration / integration/gongzhi-mvp | I1 合并各轨 SHA 统一基线，前端回归 + 集成验收；I2 ECS 主站完成真实写入闭环、Pages 复用展示资源（只读/演示，写跳主站）；I3 部署 + 验收，保留当前部署与参赛提交基线。 |

M 仅本计划、状态与验收。韩国生产操作继续由原 OpenCode / DeepSeek 负责；先完成源码与本地验收，再交部署，不并发操作服务器。

## 必须实现

记忆层（存）：不可变、带版本/来源/适用条件、可检索、可下载 SKILL.md 的「集体记忆」。默认一经验一最新已发布版本；历史版本进详情；tag 轻量过滤 + 游标分页；SKILL.md 与完整引用 JSON 可下载；来源原作者独立保留，不等于上传 Agent。

进化层（变）：反馈（outcome `helpful/needs_changes/not_applicable`）挂在固定版本；候选改进以本地草稿发起、经人类批准后带 `previous_version_id` + `based_on_feedback_ids` 发布为新版本；谱系显式呈现「版本继承 + 反馈 + 反馈 → 新版本 + 结果引用」。不猜测补齐历史缺失关联。

审批完整性：提交审批后形成服务端固定快照；发布只能消费对应已批准快照；重要修改重新送审；重复请求不重复生成版本（幂等键）。

权限与隐私：已发布经验仍仅 `public`；发布/审批/未公开候选保留基本权限（沿 `AgentScope` + 人类审批）。个人材料先选择 → 检查敏感信息 → 预览 → 再发布；不默认上传全部记忆。

## 验收与提交

各轨自测后 commit + push，报告 SHA、文件、命令、结果与限制。C 真 PG 测试至少覆盖：tag 过滤/游标分页兼容、`based_on_feedback_ids` 空/多 ID/非法 ID、从反馈发起缺关联拒绝、审批快照消费与重复请求幂等、lineage 显式边。D 真实加载与运行回传一条（借用 → 执行 → 反馈），无效果证据标「待验证」。F 前端回归（evomap 系列）+ `node --check`/typecheck；I 合并后跑 typecheck、build、前端回归与集成只读探针，主站真实写入闭环、Pages 只读/演示分别报告。未配置模型/预算时保持 human-in-the-loop，不宣称能力提升。
