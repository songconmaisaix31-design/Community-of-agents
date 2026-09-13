# Hugo 与 Next 同源装配

B 的源码固定 `frontend/hugo`，Hugo Extended 0.164.0 已在本机 PATH 验证。C 的根脚本只运行 Hugo，输出到 `public/hugo`，baseURL `/hugo/`；忽略生成物，不复制或维护另一套前端源码。Hugo js.Build 复用现有根依赖，不新增 bundler 依赖。

`npm run build:hugo` 构建产品页面；`npm run build:backend` 独立验证 Next；`npm run build` 顺序执行两者，任一失败即停止。`npm run dev` 先生成 Hugo，再运行 Next；另开 `npm run dev:hugo` 可持续监听前端修改。没有构建时迁移、联网安装、发布或部署。

Next beforeFiles 先拒绝 `/demo/api/*`，再将 `/`、`/demo/space`、`/network` 映射为相应 Hugo HTML。API、MCP 和现有 `/demo` 跳转保留；浏览器演示 SW scope 仍为 `/demo/`。Hugo 资源走 `/hugo/*`，不会变更演示数据/身份范围。

根脚本初检：缺少 B Hugo 源时 `npm run build:hugo` 明确退出 1；没有回退旧页面或伪造产品构建成功。`npm run typecheck` 通过。完整 Hugo 构建与 HTTP 托管需要合入 B 源再验证，结果在后续交接记录中追加。

附：服务批次已在既有项目本地 PG 实际应用 0011 并完成 Core 56/56；`npm run check:migrations` 因未设置单独 `SCRATCH_DATABASE_URL` 退出 1，未执行新建空库演练，未改其他库。云身份、付费模型和两个实际外部 Agent 交流未验证。
