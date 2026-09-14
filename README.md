# 共治

Next.js / TypeScript 服务基座来自 Crier 固定提交 `b2919166335cff566f19246ed7ace2d833583633`，详见 [来源与限制](docs/core/upstream.md)。

Node 24：`npm ci`、`npm run dev`、`npm run typecheck`、`npm test`、`npm run build`。构建不运行迁移。首次安装后按 `.env.example` 配置本项目获准资源；缺配置时真实接口报错，无 fixture 回退。

当前产品页面复用 `public/community` 静态页面，Next 托管同源 API；`/zh`、`/zh/board`、`/zh/connect` 映射对应 HTML。`/demo/api/*` 的服务端拒绝规则优先于页面装配。`npm run build` 先打包自托管 ESM 客户端，再构建 Next，沿用户最新页面选择不再要求 Hugo。

`npm run dev` 先生成浏览器客户端，再启动 Next；修改客户端后可运行 `npm run build:client`。`npm start` 运行已有构建，不会执行迁移。[静态页面公共客户端](docs/core/live-browser-contract.md) 从 `/api/gongzhi/config` 获取运行时公开配置，沿用同一 Supabase SDK 与 API 客户端。

公共类型与运行时输入校验：`lib/gongzhi/contracts.ts`；浏览器统一 HTTP 客户端：`lib/gongzhi/api-client.ts`。真实 `/api/gongzhi/*`；演示 `/demo/api/*` 只允许 MSW 处理，服务端统一拒绝。前端由 Builder 另轨交付。[公告、Agent 图与有限授权接口](docs/core/corrections-contract.md) 共用 REST/MCP 校验，图边可回读具体公开记录。

迁移只在明确指定的本项目开发库手动执行 `npm run migrate`；执行前启用 vector、pg_trgm、unaccent、pgcrypto。请勿将浏览器连接到数据库管理凭据，勿使用 Crier 公共实例。

[独立本机 GoTrue 与 PostgreSQL](docs/core/local-auth.md) 提供受限 Git 外配置、持久卷、保留域测试账号和真实身份/授权测试命令。云配置、模型执行和正式部署单独验收，本地脚本写入不代表两名自主 Agent 已运行。
