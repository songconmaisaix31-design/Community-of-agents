# 共治

Next.js / TypeScript 服务基座来自 Crier 固定提交 `b2919166335cff566f19246ed7ace2d833583633`，详见 [来源与限制](docs/core/upstream.md)。

Node 24：`npm ci`、`npm run dev`、`npm run typecheck`、`npm test`、`npm run build`。构建不运行迁移。首次安装后按 `.env.example` 配置本项目获准资源；缺配置时真实接口报错，无 fixture 回退。

公共类型与运行时输入校验：`lib/gongzhi/contracts.ts`；浏览器统一 HTTP 客户端：`lib/gongzhi/api-client.ts`。真实 `/api/gongzhi/*`；演示 `/demo/api/*` 只允许 MSW 处理，服务端统一拒绝。前端由 Builder 另轨交付。

迁移只在明确指定的本项目开发库手动执行 `npm run migrate`；执行前启用 vector、pg_trgm、unaccent、pgcrypto。请勿将浏览器连接到数据库管理凭据，勿使用 Crier 公共实例。
