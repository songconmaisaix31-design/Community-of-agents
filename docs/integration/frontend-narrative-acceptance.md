# 共治原生 Next 前端验收

2026-09-14，`integration/gongzhi-mvp`。最新用户决定“只改前端、抛弃 Hugo”覆盖旧文档中的 Hugo 要求；既有后端保持。基线 `9033141`，I 装配 `99c08a0`，K `942698d/d4b079b` 分别 cherry-pick 为 `33bd5ea/152d384`；最终源码 `152d38418de776198562b3b0b43b5f9c1f68a5fd`。

原生 CommunityPage 承接 `/`、`/network`、`/demo/space`，默认浅色，共治互助叙事；Outfit/Rajdhani 自托管且保留 OFL。dev/build 直接使用 Next，移除 Hugo 调用和页面重写，保留 `/demo/api/*` 拒绝路由及 `build:backend` 兼容命令。历史 Hugo 文件保留，产品入口不请求其资源。

| 实际命令 | 结果 |
| --- | --- |
| `npm run build` | 最终源码直接 `next build`，Next15.5.25 通过；无 Hugo 或隐含迁移 |
| `npm run typecheck` | 最终源码通过 |
| `node --import tsx --test tests/frontend/behavior.test.ts tests/integration/http-mode-isolation.test.ts`，设置 `GONGZHI_TEST_BASE_URL=http://127.0.0.1:3019` | 首片17/17：MSW及实际Next拒绝路由；最后仅文案/主题按钮属性变化，不重复后台检查 |
| `npx --no-install playwright test --config tests/integration/frontend-narrative.config.ts` | 最终10/10：I6+K4，Chrome1440/390；旧Hugo断言未修改 |

实际覆盖自然入口、两入口面板、公告类别/正文搜索/完整线程、浅色默认及偏好保存、同一Canvas的主题/平移/缩放/刷新、公开边证据、明确示例标识、真实503且无卡片/SW/身份草稿传递；无Hugo或外站资源请求，无交易收益/进化/积分叙事或假统计。I及主控均已审阅两尺寸截图与核心操作；K最后接入说明小修已合入。

首轮3项失败为I测试假设：搜索词匹配两条原文，现断言精确a/b记录ID；坐标有约1e-13像素舍入，k严格相等，x/y仅容许1e-8像素。已保留失败证据，并补平移确实发生、刷新HTTP完成及固定页首截图检查，未修改产品行为。

`git diff 9033141 -- lib app/api app/auth app/mcp migrations scripts package-lock.json components/gongzhi/AgentCanvas.tsx` 为空；dependencies/devDependencies逐项与基线一致。最终预览 <http://127.0.0.1:3019/>，示例 <http://127.0.0.1:3019/demo/space>；自有PID `72488` 仅loopback，DB/Auth/助手/遥测关闭，首页200。

Git外证据根目录 `C:/Users/DW/AppData/Local/Temp/`：`gongzhi-narrative-I-build-final.log`、`gongzhi-narrative-I-mode.log`、`gongzhi-narrative-I-release/report.json`；同release目录 `previews/` 中 desktop-entry-light、mobile-entry-light、desktop-demo-light、mobile-demo-dark、mobile-thread 五张PNG供直接审阅，原图在results。初次失败保存在 `gongzhi-narrative-I/`。

限制：仅前端及本地隔离fixture验收；未运行数据库/迁移、云身份、真实模型协作或知乎，示例与HTTP替身不等于真实Agent执行。未部署、增加费用或申请新授权；无需用户额外操作即可体验本地页面。
