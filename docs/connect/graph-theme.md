# AgentCanvas 主题适配

本轮由 B 明确交接 `AgentCanvas.tsx` 与 `hugo-graph-theme.spec.ts` 给原 D；全局 CSS、HTML 主题初始化与按钮仍归 B。D 基于集成 `21f7107`，已合入 B 的主题首片 `2338877`；只消费六个完整 CSS 颜色值，不创建另一套主题。

本地 `@cosmos.gl/graph` 固定 3.4.1，已实际读取 `dist/index.d.ts`、`dist/config.d.ts` 和 `dist/index.js` 的实现：`setConfig` 重置配置，`setConfigPartial` 保留未改字段；`setPointColors` 加 `render(undefined, 0)` 提交颜色而不重启仿真。HTML 的 `data-theme` 属性观察器只更新背景、点、线及 hover 色；没有位置/连线数据重置、step、fitView 或镜头调用，实例持续复用。

CSS 颜色经浏览器 1px Canvas 转为 RGBA，支持完整 hex / rgb / hsl 等可解析颜色；缺失或无效变量时提供列表/公告降级，不偷偷套另一主题。点保持 4px、选中 7px。距离导致的二次连线淡化关闭（`linkVisibilityMinTransparency:1`），70% 线透明度保留，让 B 的线色对比能稳定作用于缩放后的公开连线。

源码首片 `1aca7ca528e90e22f7060ca957aacd659298d497` 已 push。随后合入 B 加强线色及手机导航 `3499e7b54dbaff8da4af2267ba2dc8672482c133`；首片 dark 线在 70% 混合后对比仅 2.12，已由 B 在其 CSS 写域修正，D 没有修改全局样式。

已完成的 D 检查：

- `npm run typecheck`：通过。
- `npm run build`：Hugo + Next 通过；合入仅 CSS/测试变化的 B 第二片后再次 `npm run build:hugo` 通过。
- `node --import tsx --test tests/frontend/behavior.test.ts`：8/8 MSW HTTP 行为测试通过，未连接数据库。
- 实际 Chrome/Playwright 专项 `hugo-graph-theme.spec.ts`：4/4，通过 B 实际 CSS 与 `[data-theme-toggle]` 按钮；初期显式注入 CSS 的独立适配检查也为 4/4，两层证据分开。
- `git diff --check`：通过。

专项直接从实际 canvas 截图识别背景、外部/平台/选中点和线色，包括深浅两种 hover 线色；不是只读配置或 DOM 标签。1440/390 宽度均经缩放、平移后反复切换主题，断言同一 canvas 仍连接、D3 原生 zoom x/y/k 不变、点位不动、点边数量不变；公开记录 HTTP fixture 的点/线可点击，回读双方证据，键盘 Agent 列表仍能联动公告。刷新与新增点边保持镜头，新点预留视区后实际可见；关闭 WebGL 仍通过键盘 Agent/交流依据列表读取同一记录。

对比检查使用点色与实际背景，线色按保留的 70% 透明度混合后至少 3:1；截图另验证实际抗锯齿线像素存在。测试已排除 canvas 边框/圆角像素，避免把父元素的颜色误认为 WebGL 背景。测试数据仅为专用 HTTP fixture，明确标示，不代表真实 Agent 交流或生产记录。

## I 复验命令

专项默认必须使用实际 CSS/按钮；缺少主题变量不回退 fixture。复用已有 B Playwright 配置即可，只选择该 spec；独立端口由执行轨自己的临时配置指定：

```powershell
node node_modules/playwright/cli.js test --config tests/frontend/playwright.config.ts hugo-graph-theme.spec.ts
```

D 实际使用的外部配置为 `C:/Users/DW/AppData/Local/Temp/gongzhi-graph-theme-D.config.ts`：继承原 B 配置，testDir 指向 D，testMatch 只选本 spec，端口改为 3231，outputDir 为 TEMP 的 `gongzhi-graph-theme-D-results`，数据库/Auth/模型开关全部关闭。临时配置及截图没有进入 Git；运行结束由 Playwright 关闭其服务。D 没有占用 B 3219/3221、I 3019 或数据库。

仅隔离适配排查时显式设置 `GONGZHI_GRAPH_THEME_SOURCE=fixture`；该模式在测试名称中标示 injected CSS，不作为最终实际主题验收。图主题不扩展后端、MCP、权限或真实模型调用。本轮最终 worker_done 等总控/I 统一集成确认后发送。
