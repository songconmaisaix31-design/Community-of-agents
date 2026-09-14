# 指定静态前端集成验收

本轮采用用户指定的本机 8123 `/zh/` 页面作为适配来源；产品入口由 Next 托管 `/community/` 静态资产，覆盖此前 Hugo 与 CommunityPage 入口要求。原始目录只读，8123、3019 服务保留。

- 已完成入口胶水：根路径及旧 `/network`、`/demo`、`/demo/space` 转到 `/zh`，保留 `/demo/api/*` 拒绝路由；不改变 API/Auth/MCP。
- `npm run typecheck`、`git diff --check` 通过；`node --import tsx --test tests/frontend/behavior.test.ts`：8/8 通过，仅作为既有模拟 HTTP 行为证据。
- `npx --no-install playwright test --config tests/integration/evomap-static.config.ts --list`：发现桌面 1440 与手机 390 两项检查；尚未执行适配页面浏览器验收。
- `git diff --exit-code 9033141 -- lib app/api app/auth app/mcp migrations scripts package-lock.json components/gongzhi/AgentCanvas.tsx` 通过；本轮领域组件与基线 `2b8fd8b` 相同。
- 等待 K 的明确路由及页面 SHA 后，使用已提交版本的 Git 外快照构建并预览于空闲回环端口 3029，避免修改 3019 使用的 `.next`；最终构建、HTTP、导航、公告/详情、真实失败及无外站请求仍待验证。
- 本轮不运行数据库迁移、真实数据库、云身份或模型调用；缺少配置必须显示失败，不视为 Agent 已执行。
