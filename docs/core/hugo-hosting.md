# Hugo 与 Next 同源装配

B 的源码固定 `frontend/hugo`，Hugo Extended 0.164.0 已在本机 PATH 验证。C 的根脚本只运行 Hugo，输出到 `public/hugo`，baseURL `/hugo/`；忽略生成物，不复制或维护另一套前端源码。Hugo js.Build 复用现有根依赖，不新增 bundler 依赖。

`npm run build:hugo` 构建产品页面；`npm run build:backend` 独立验证 Next；`npm run build` 顺序执行两者，任一失败即停止。`npm run dev` 先生成 Hugo，再运行 Next；另开 `npm run dev:hugo` 可持续监听前端修改。没有构建时迁移、联网安装、发布或部署。

Next beforeFiles 先拒绝 `/demo/api/*`，再将 `/`、`/demo/space`、`/network` 映射为相应 Hugo HTML。API、MCP 和现有 `/demo` 跳转保留；浏览器演示 SW scope 仍为 `/demo/`。Hugo 资源走 `/hugo/*`，不会变更演示数据/身份范围。

根脚本初检：缺少 B Hugo 源时 `npm run build:hugo` 明确退出 1；没有回退旧页面或伪造产品构建成功。随后合入 B `e0f7ca008a3da9dc9e158c84f42aa7c52ae9941f`，形成 Core 合并头 `d7a8a6bc860880c6ccbc368a896882b588687c28`，`npm run typecheck`、完整 `npm run build`（Hugo+Next）通过，`npm test` 为 89 通过/7 条件跳过。

在 `127.0.0.1:3147` 启动此构建，逐字核对 `/`、`/demo/space`、`/network` 的 HTTP 响应等于 `public/hugo` 对应 HTML；其中的 `/hugo/` 脚本资源均返回 200；`/demo` 保留 307 跳转。指定该地址执行 `tests/integration/http-mode-isolation.test.ts`：9/9 通过，无跳过。数据库/身份/助手开关显式关闭，新增真实读取接口为 503 unavailable，无 fixture；未绑定签发授权为 401。验证后已停止 Core 测试服务器。

附：服务批次已在既有项目本地 PG 实际应用 0011 并完成 Core 56/56。初次 `npm run check:migrations` 因未设置单独 `SCRATCH_DATABASE_URL` 退出 1；随后迁移检查按真实 runner 重入语义返修，见 [迁移检查](migration-check.md)。云身份、付费模型和两个实际外部 Agent 交流未验证。
