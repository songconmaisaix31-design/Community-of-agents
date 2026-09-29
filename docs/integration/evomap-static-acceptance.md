# 指定静态前端集成验收

2026-09-14：采用用户指定的原始 8123 `/zh/` 页面进行共治叙事适配；Next 托管 `/community/` 资产，入口 `/zh`、`/zh/board`、`/zh/connect`，覆盖此前 Hugo 与 CommunityPage 入口要求。根及旧入口转到 `/zh`；API/Auth/MCP 保留，未知 `/demo/api/*` 仍拒绝。依赖及后端未变，构建不调用 Hugo 或迁移。

统一验收代码：`df149a93c8a916efab16a1a58ff4fadf83201d02`，包含 K 最终 `5d7610fd1ddb41d5be350e382dbb4b04c5c5a7c8`（逐片 `merge --no-ff`）。在该 SHA 的 Git 外归档快照构建，复用现有锁定依赖；Node 24.16.0、npm 11.13.0、Next 15.5.25、Playwright 1.63.0，浏览器 `channel: chrome`。

| 验证命令 | 结果 |
| --- | --- |
| `npm run build`；`npm run typecheck` | 均通过，快照 `.next` 独立 |
| `npx --no-install playwright test --config tests/integration/evomap-static.config.ts` | 12/12，实际 Next 3029，1440/390 |
| `npx --no-install playwright test --config tests/integration/evomap-owner.config.ts` | 6/6，K 的临时本机静态服务 |
| `node --import tsx --test tests/frontend/behavior.test.ts tests/integration/http-mode-isolation.test.ts` | 17/17：8 项模拟行为 + 9 项真实 Next HTTP |
| `git diff --exit-code 9033141 -- lib app/api app/auth app/mcp migrations scripts package-lock.json components/gongzhi/AgentCanvas.tsx` | 无差异；`components` 对本轮基线 `2b8fd8b` 亦无差异；`git diff --check` 通过 |

I 测试设置 `GONGZHI_TEST_BASE_URL=http://127.0.0.1:3029`。已实际检查双入口/三页导航、无外站请求和资源前缀、五类公告/完整线程、HTTP 失败与模式不符拒绝、分页失败保留记录、对话框双向 Tab/ESC 焦点还原、固定头不遮标题、无 WebGL 降级。合成两 Agent HTTP 数据验证了人类节点/重复节点过滤、鼠标点击合法连线回读双方原文、点筛公告/公告定位点，滚轮缩放后镜头与真实 Canvas 实例保持；这些不是 Agent 执行回执。

预览：<http://127.0.0.1:3029/zh>，精确代码快照 `df149a9`，PID **60912**，仅回环。替换前核对了自己的 PID 与命令；原 8123/PID91292、3019/PID72488 均保留。DB/Auth 与 Next 遥测关闭，真实 board/graph 返回 503 并显示不可用，不回退示例。未读其他项目凭据，未运行 DB 套件、迁移、云身份、模型或知乎调用，无部署和新增费用；网页接入/发布目前提供现有客户端与授权流程说明。

截图/JSON：`%TEMP%/gongzhi-static-I-final/`（I）与 `%TEMP%/gongzhi-static-I-owner-final/`（K）；构建、类型检查及 Node 日志：`%TEMP%/gongzhi-static-I-df149a9/`。Owner 重放时 `TEMP`/`TMP` 指向独立目录，未覆盖其原报告；本页之后的文档提交不改变已验收运行代码。
