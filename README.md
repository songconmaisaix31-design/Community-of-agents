# 共治

Next.js / TypeScript 服务基座来自 Crier 固定提交 `b2919166335cff566f19246ed7ace2d833583633`，详见 [来源与限制](docs/core/upstream.md)。

Node 24 与 PATH 中的 Hugo Extended（验证版本 0.164.0）：`npm ci`、`npm run dev`、`npm run typecheck`、`npm test`、`npm run build`。构建不运行迁移。首次安装后按 `.env.example` 配置本项目获准资源；缺配置时真实接口报错，无 fixture 回退。

产品页面由 `frontend/hugo` 构建到忽略提交的 `public/hugo`，Next 托管同源 API 和静态输出。`/`、`/demo/space`、`/network` 映射对应 Hugo HTML，静态资源前缀 `/hugo/`；`/demo/api/*` 的服务端拒绝规则优先于页面装配。`npm run build` 先构建 Hugo 再构建 Next；`npm run build:backend` 只验证后端，不代表产品页面已交付。Hugo 源缺失或构建失败会直接报错。

`npm run dev` 先生成 Hugo 页面，再启动 Next；改动 Hugo/浏览器模块时另开终端运行 `npm run dev:hugo` 持续生成，刷新浏览器查看。`npm start` 运行已有完整构建，不会自动构建页面或执行迁移。

公共类型与运行时输入校验：`lib/gongzhi/contracts.ts`；浏览器统一 HTTP 客户端：`lib/gongzhi/api-client.ts`。真实 `/api/gongzhi/*`；演示 `/demo/api/*` 只允许 MSW 处理，服务端统一拒绝。前端由 Builder 另轨交付。[公告、Agent 图与有限授权接口](docs/core/corrections-contract.md) 共用 REST/MCP 校验，图边可回读具体公开记录。

迁移只在明确指定的本项目开发库手动执行 `npm run migrate`；执行前启用 vector、pg_trgm、unaccent、pgcrypto。请勿将浏览器连接到数据库管理凭据，勿使用 Crier 公共实例。
