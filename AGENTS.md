# 共治开发约定

业务事实源：最新用户四点纠偏见 docs/source/corrections-2026-09-13.md，优先于 docs/source/integration-v3.md、docs/source/tasks-v2.md 和旧验收。Hugo 为产品前端；既有 Crier/Next.js、Supabase Auth/Postgres 和模型服务保留为后端；继续用 cosmos.gl、现有客户端/MCP 与 MSW，不另造布局、消息或调度平台。

## 唯一文件所有权

- 总控 M：AGENTS.md、DEVELOPMENT.md、docs/source/**；仅计划、状态、决策与验收。
- Core C：lib/**，排除 lib/gongzhi/agent/**、lib/gongzhi/zhihu/**；app/api/**，排除 app/api/gongzhi/runs/**；app/mcp/**、app/auth/**；migrations/**、scripts/**、tests/core/**、docs/core/**；根依赖、锁文件、TS/Next/测试配置、README.md、环境样例、上游许可记录。C 独占共享 contracts.ts 和 api-client.ts。
- Connect D：lib/gongzhi/agent/**、lib/gongzhi/zhihu/**、app/api/gongzhi/runs/**、tests/connect/**、examples/agent/**、docs/connect/**。新增依赖、共享契约、数据库迁移均向 C 交接。
- Frontend B（Builder 候选轨）：app/page.tsx、app/demo/**、app/network/**、components/**、mocks/**、public/**（上游必须的协议静态说明由 C 首次导入除外）、app/globals.css、tests/frontend/**、docs/frontend/**。当前本地/远端与同仓会话均无已开工前端分支或代码；按用户完整前端授权在独立候选 worktree 派发，收到 Builder 既有认领立即交接，不修改外部工作。
- Integration I：统一 integration/gongzhi-mvp 分支的合并与验证、tests/integration/**、docs/integration/**；app/layout.tsx 及必要路由/导入装配。领域问题退原 owner。根配置修改提给 C，全局样式提给 B。
- C 首次导入基座时可创建最小 app/layout.tsx，仅此文件基座提交后转交 I；禁止复制上游站点页面、品牌、线上数据、埋点和定时外发。

纠偏增量写域：B 独占新增 frontend/hugo/**（Hugo 模板、内容、样式、浏览器脚本及 Hugo 配置）；全仓依赖/锁文件、根构建与 Next 配置仍由 C 唯一持有，B 不新增独立依赖栈。C 可扩展既有共享 DTO 与 API，D 扩展既有 examples/agent CLI/客户端。I 仍为唯一集成人，领域问题退原轨。各轨续用原 worktree/branch，从集成基线 2a0b5617b5dc5030894bde6541ddcb6bc469c24a 起步。

## 交付习惯

每轨固定 Orca Agent + worktree + branch；Worker 只改写域，读全仓可。阶段完成即 commit + push，交接 SHA、说明、真实检查、遗留问题。禁止 force push、覆盖他人未提交内容、修改历史迁移掩盖差异。根依赖和锁文件只有 C 可写。

共享接口由 C 首批提交，其他轨等待/交接，不复制类型。前端统一 HTTP：/demo/api/* 仅 MSW，/api/gongzhi/* 真服务；真实失败禁止回退 fixture。演示存储、Service Worker scope 和身份必须与真实隔离。服务端来源标识不可由客户端自报。

沿现有测试工具；C 固定实际 typecheck/test/build 命令后各轨共用。核心权限、REST/MCP 共用校验、旧版本采纳、幂等、撤销、超时与模式隔离必测。无数据库或模型授权时明确未验证，不伪造真实通过。缺凭据不调用其他项目服务，不读取日常 CLI 认证文件，不新增付费账号或公开部署。
