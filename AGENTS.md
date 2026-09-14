# 共治开发约定

当前优先方向：经验云端共享、借用者本机按需执行，沿现有 Crier/Next/身份/存储/公告。用户明确允许 Kimi 不可用时使用 Codex；原 K 已停止，F 接管同一 `gongzhi-kimi-adaptation` worktree、分支和前端写域（仍排除 C 的生成客户端），不得重启冲突写轨。C/D/I 继续原长期轨；M 只维护协调与验收。准确内容与公开范围确认后才允许 Agent 上传，接入不等于上传授权；未配置模型保持不可用，旧数据和原前端留档保留。当前一页分工及验证边界以 `docs/source/live-2026-09-14.md` 开头为准，下方旧数据库清理与 Hugo 等记录不代表本轮新的执行授权。

最新增量（优先于历史状态）：用户要求清理目前数据库，并以知乎的问题、经验和讨论作为重要信源，让不同人的 Agent 互助、用于真实任务并沉淀可复用成果。基线 `bc091b9ac7f853232120102b8b8323f64eb92f90`；增量分工见 `docs/source/live-2026-09-14.md` 开头。继续复用 C / D / Kimi K3 / I 原长期轨和互斥写域；当前 gongzhi 业务和 Auth 同库，破坏清理范围待用户明确后由 Core 唯一执行，不自动重建示例数据，其他库和旧预览保留。知乎信源定位不授权改用未提供的平台身份/密钥或新增模型费用；保留当前前后端和接口。

## 当前真实功能轮（2026-09-14，优先于下方历史轮次）

用户已要求按照开发文档、多 Agent 隔离开发，调研开源并接入真实功能；此前“只改前端”的范围仅属于已完成轮次。当前基线为 `cda811d23ed154ddf87c1a200d3cf30ffa5e7340`，一页分工与验收见 `docs/source/live-2026-09-14.md`。保留当前 Next 托管的 `public/community` 前端及 Crier 后端，不恢复 Hugo、不改动 8123 原件或留档。

本轮唯一写域：C 继续拥有 lib（排除 agent/zhihu）、app/api（排除 runs）、app/auth、app/mcp、migrations、scripts、tests/core、docs/core、根配置/依赖/锁文件及新增 `infra/local-auth/**`；C 独占共享浏览器客户端产物 `public/community/assets/gongzhi-client.js`。D 继续拥有 lib/gongzhi/agent、lib/gongzhi/zhihu、app/api/gongzhi/runs、examples/agent、tests/connect、docs/connect。Kimi K3 独占 public/community（排除 C 的 gongzhi-client.js）、tests/frontend/evomap*、docs/frontend/evomap-adaptation.md。I 唯一集成，拥有 tests/integration、docs/integration、app/layout.tsx 与必要入口路由胶水，领域问题退原轨；根配置交 C。M 仅拥有 AGENTS.md、DEVELOPMENT.md、docs/source 下的计划/决定/验收。其他旧前端轨本轮不启动。

各轨复用原长期 Agent、worktree、分支；从明确基线普通 merge 同步，不覆盖未提交内容。最多三条开发轨先并行，I 接收小步 SHA 后集成。仅本项目、本机回环的独立真实数据库和开源 Supabase Auth 可无新增费用验证；不动其他项目容器，不复用其他项目凭据，不以 auth stub 或 fixture 证明真实身份。模型/知乎外部调用需本项目明确配置和预算；当前未提供，不默认发起收费请求或公开部署。真实 Agent 交流需 Agent 实际读取、思考并写入服务，脚本造数不是验收。

业务事实源：2026-09-14 用户最新指定以本机 8123/zh 展示的 EvoMap 前端适配共治，明确放弃 Hugo 和此前的前端页面；保留适用布局、样式、交互与已有有效代码，改写项目叙事。此要求覆盖下文和旧文档中的 Hugo 要求。既有 Crier/Next.js、Supabase Auth/Postgres 和模型服务继续保留；Agent-only、实际交流证据、有限授权与演示/真实隔离仍按 docs/source/corrections-2026-09-13.md 执行。

本轮从集成基线 2b8fd8b06e12cc43e7bf045e13b75307f79a10d8 续接。Kimi K3 在 gongzhi-kimi-adaptation 独占 public/community/**、tests/frontend/evomap*.ts 与 evomap*.mjs、docs/frontend/evomap-adaptation.md；主目录未提交的原始页面仅作读取来源，不覆盖。Integration I 在 gongzhi-integration 独占本轮入口页面、app/layout.tsx、必要的 next.config.ts 静态路由、package.json 前端命令、tests/integration/** 与 docs/integration/**；不改后端、锁文件或领域组件。资源统一 /community/ 前缀，用户入口 /zh/，仍用现有 /api/gongzhi/** 契约，禁止原站代理和失败返回模拟成功。总控只协调、验收；跨域修改交接，I 唯一集成。

## 唯一文件所有权

- 总控 M：AGENTS.md、DEVELOPMENT.md、docs/source/**；仅计划、状态、决策与验收。
- Core C：lib/**，排除 lib/gongzhi/agent/**、lib/gongzhi/zhihu/**；app/api/**，排除 app/api/gongzhi/runs/**；app/mcp/**、app/auth/**；migrations/**、scripts/**、tests/core/**、docs/core/**；根依赖、锁文件、TS/Next/测试配置、README.md、环境样例、上游许可记录。C 独占共享 contracts.ts 和 api-client.ts。
- Connect D：lib/gongzhi/agent/**、lib/gongzhi/zhihu/**、app/api/gongzhi/runs/**、tests/connect/**、examples/agent/**、docs/connect/**。新增依赖、共享契约、数据库迁移均向 C 交接。
- Frontend B（Builder 候选轨）：app/page.tsx、app/demo/**、app/network/**、components/**、mocks/**、public/**（上游必须的协议静态说明由 C 首次导入除外）、app/globals.css、tests/frontend/**、docs/frontend/**。当前本地/远端与同仓会话均无已开工前端分支或代码；按用户完整前端授权在独立候选 worktree 派发，收到 Builder 既有认领立即交接，不修改外部工作。
- Integration I：统一 integration/gongzhi-mvp 分支的合并与验证、tests/integration/**、docs/integration/**；app/layout.tsx 及必要路由/导入装配。领域问题退原 owner。根配置修改提给 C，全局样式提给 B。
- C 首次导入基座时可创建最小 app/layout.tsx，仅此文件基座提交后转交 I；禁止复制上游站点页面、品牌、线上数据、埋点和定时外发。

纠偏增量写域：B 独占新增 frontend/hugo/**（Hugo 模板、内容、样式、浏览器脚本及 Hugo 配置）；全仓依赖/锁文件、根构建与 Next 配置仍由 C 唯一持有，B 不新增独立依赖栈。C 可扩展既有共享 DTO 与 API，D 扩展既有 examples/agent CLI/客户端。I 仍为唯一集成人，领域问题退原轨。各轨续用原 worktree/branch，从集成基线 2a0b5617b5dc5030894bde6541ddcb6bc469c24a 起步。

## 交付习惯

2026-09-14 EvoMap 风格增量：详见 docs/source/evomap-style-2026-09-14.md。基线更新为 21f710703f131d96f36b601f7b11dcd962e03581。B 已在 msg_7469b7b1a755 明确交接，本轮 D 独占 components/gongzhi/AgentCanvas.tsx、tests/frontend/hugo-graph-theme.spec.ts、docs/connect/graph-theme.md；B 从本轮写域排除这两代码文件，其他前端所有权不变。B 仍独占主题和全局样式；D 仅消费 HTML data-theme 与六个 --graph-* CSS 颜色变量。C 根配置与共享契约所有权不变，I 唯一集成人。

每轨固定 Orca Agent + worktree + branch；Worker 只改写域，读全仓可。阶段完成即 commit + push，交接 SHA、说明、真实检查、遗留问题。禁止 force push、覆盖他人未提交内容、修改历史迁移掩盖差异。根依赖和锁文件只有 C 可写。

共享接口由 C 首批提交，其他轨等待/交接，不复制类型。前端统一 HTTP：/demo/api/* 仅 MSW，/api/gongzhi/* 真服务；真实失败禁止回退 fixture。演示存储、Service Worker scope 和身份必须与真实隔离。服务端来源标识不可由客户端自报。

沿现有测试工具；C 固定实际 typecheck/test/build 命令后各轨共用。核心权限、REST/MCP 共用校验、旧版本采纳、幂等、撤销、超时与模式隔离必测。无数据库或模型授权时明确未验证，不伪造真实通过。缺凭据不调用其他项目服务，不读取日常 CLI 认证文件，不新增付费账号或公开部署。
