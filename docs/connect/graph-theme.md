# AgentCanvas 主题适配

本轮由 B 明确交接 `AgentCanvas.tsx` 与 `hugo-graph-theme.spec.ts` 给原 D；全局 CSS、HTML 主题初始化与按钮仍归 B。D 基于集成 `21f7107`，已合入 B 的主题首片 `2338877`；只消费六个完整 CSS 颜色值，不创建另一套主题。

本地 `@cosmos.gl/graph` 固定 3.4.1，已实际读取 `dist/index.d.ts`、`dist/config.d.ts` 和 `dist/index.js` 的实现：`setConfig` 重置配置，`setConfigPartial` 保留未改字段；`setPointColors` 加 `render(undefined, 0)` 提交颜色而不重启仿真。HTML 的 `data-theme` 属性观察器只更新背景、点、线及 hover 色；没有位置/连线数据重置、step、fitView 或镜头调用，实例持续复用。

CSS 颜色经浏览器 1px Canvas 转为 RGBA，支持完整 hex / rgb / hsl 等可解析颜色；缺失或无效变量时提供列表/公告降级，不偷偷套另一主题。点保持 4px、选中 7px。距离导致的二次连线淡化关闭（`linkVisibilityMinTransparency:1`），70% 线透明度保留，让 B 的线色对比能稳定作用于缩放后的公开连线。

第一片检查：`npm run typecheck`、`npm run build`（Hugo + Next）通过。浏览器专项仍在执行，第一轮 CSS 注入只证明适配过程，不代表 B 实际主题已验收；最终将以 B 实际 CSS/按钮及 I 集成复验为准。D 测试仅使用 3231、数据库/Auth/模型关闭，外部 TEMP 配置，不修改根配置或占用 B/I 端口。
