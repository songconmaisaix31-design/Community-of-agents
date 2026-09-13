# EvoMap 风格增量验收

2026-09-14，分支 `integration/gongzhi-mvp`，基线 `21f710703f131d96f36b601f7b11dcd962e03581`。首批统一源码 `8125c3e8342ba1deb211cc35b2bbd233bd4218e4`：管理 `e82738b`、B `2338877` + `3499e7b`、D `1aca7ca`。保留 Hugo 产品和 Crier/Next 后端；本轮仅视觉、主题与浏览器回归，不运行数据库套件。

| 统一分支执行命令 | 首批结果 |
| --- | --- |
| `npm run build` | Hugo 0.164.0 extended + Next 15.5.25 通过，无隐含迁移 |
| `npm run typecheck` | 构建后独立执行通过 |
| `npm test`，仅设置 `GONGZHI_TEST_BASE_URL=http://127.0.0.1:3019` | 106 pass / 0 fail / 3 skip；两个 PG 环境开关均移除 |
| `npx --no-install playwright test --config tests/integration/playwright.config.ts` | 原 I 8/8 通过，1440×960 / 390×844 |

I 浏览器实际覆盖自然入口、双入口登记、Agent 唯一点、镜头保留、公开交流证据与公告双向定位、三故事、草稿刷新、示例重置、WebGL 降级，以及 MSW `/demo/` scope、未知示例 API 拒绝、真实页面无 SW 控制且失败不回退 fixture。示例内容和模拟执行回执只证明交互，不是模型协作。

初步体验：<http://127.0.0.1:3019/>，进入示例为 `/demo/space`，真实 `/network` 明确显示服务不可用。自有 Next PID `62276` 只监听 127.0.0.1；DB/Auth/助手与遥测关闭。重启前核对原进程与监听归属，未碰 B/D 端口、原 PG 容器或数据库。

依据用户本地 `docs/source/evomap-style-2026-09-14.md` 与 `evomap-frontend.md` 复核：黑白灰层级、冷青主色、细边界和紧凑导航；不把研究包暖色排版当产品风格。Outfit / Rajdhani 自托管来源固定为 google/fonts `809e4d8b8d7e9364a914909bb777679606c178b8`，保留 OFL 1.1；HarmonyOS 未提供，中文使用系统回退。旧 my_blog / WeRemember 来源与 MIT 许可保留，旧暖色样式不再装载。

Git 外证据：`C:/Users/DW/AppData/Local/Temp/gongzhi-evomap-I-node.log`；`gongzhi-evomap-I-first/` 保存 I 浏览器 JSON、桌面/窄屏截图。B 原 15 + 新主题导航 5 与 D 专项在 I3019 的统一复验、深浅色截图审阅仍在进行，不能以首批通过替代最终验收。

沿用 Node24.16.0/npm11.13.0、Playwright1.63.0/Chrome152.0.7977.83，根依赖与锁文件未变化，复用此前锁定安装。本轮未运行 PG、迁移、云 Auth、模型或知乎；上一轮基线的本地 PG 通过记录仅为历史证据。真实云身份、真实模型 Agent 协作仍未验证，未新增费用、公开部署或赛事提交。
