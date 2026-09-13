# 共治原生 Next 前端验收

2026-09-14，`integration/gongzhi-mvp`，基线 `9033141e5a5fca2f790abd1530577bedd80ff00e`。装配 `99c08a0` 移除 Hugo 入口重写与 dev/build 调用，保留 `/demo/api/*` 拒绝路由和 `build:backend` 兼容命令；默认 HTML 浅色。K 首片 `942698d` 已 cherry-pick 为 `33bd5ea`：原生 CommunityPage、共治互助叙事、蓝白/深色主题与本地字体；历史 Hugo 文件保留，产品入口不请求其资源。

| 实际命令 | 结果 |
| --- | --- |
| `npm run build` | 直接 `next build`，Next15.5.25 通过；无 Hugo、迁移或外部模型步骤 |
| `npm run typecheck` | 通过 |
| `node --import tsx --test tests/frontend/behavior.test.ts tests/integration/http-mode-isolation.test.ts`，`GONGZHI_TEST_BASE_URL=http://127.0.0.1:3019` | 17/17：MSW 与实际 Next 拒绝路由、未知 API、模式隔离 |
| `npx --no-install playwright test --config tests/integration/frontend-narrative.config.ts` | I6 + K4 = 10/10，Chrome1440/390；旧 Hugo 测试未修改 |
| 上述浏览器命令加 `--project desktop --project narrow --grep 'actual theme'` | 加强平移与刷新完成等待后，镜头两尺寸 2/2 |

浏览器实际覆盖入口、两入口面板、公告类别/正文搜索/完整线程、浅色默认与偏好保存、主题切换时同一 Canvas 和镜头、公开边证据、明确示例标识、真实503无卡片/无SW/无身份草稿传递，以及无 Hugo 或外站资源请求。未使用旧页面验收代替本轮；视图与 HTTP fixture 不等于真实 Agent 执行。

首轮3项失败属于 I 测试假设：关键词实际匹配两条原文，现核对精确记录ID；镜头坐标出现约 `1e-13` 像素舍入，k保持严格相等、x/y只容许 `1e-8` 像素。原始失败报告保留，未修改产品行为或降低为像素级镜头容差。

范围核对：`git diff 9033141 -- lib app/api app/auth app/mcp migrations scripts package-lock.json components/gongzhi/AgentCanvas.tsx` 为空；依赖未增删。自托管 Outfit/Rajdhani 保留 OFL，未请求 EvoMap。主控已独立审阅两尺寸入口、锚点、线程、主题和真实失败；其面向用户文案小修待 K 后继提交。

体验：<http://127.0.0.1:3019/>、<http://127.0.0.1:3019/demo/space>；自有 PID `96836` 仅 loopback，DB/Auth/助手/遥测关闭。证据在 `C:/Users/DW/AppData/Local/Temp/`：`gongzhi-narrative-I-build.log`、`gongzhi-narrative-I-mode.log`；`gongzhi-narrative-I-final/report.json` 与 results 中入口/线程/深浅截图，`gongzhi-narrative-I-camera/` 为固定页首的镜头截图；初次失败在 `gongzhi-narrative-I/`。本轮未运行数据库或迁移，未验证云身份、真实模型协作或知乎，未部署、增加费用或申请新授权。
