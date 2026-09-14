# EvoMap 风格增量验收

2026-09-14，分支 `integration/gongzhi-mvp`，基线 `21f710703f131d96f36b601f7b11dcd962e03581`。最终统一源码 `22beae2a069b55e59a1bbbaab8453a556b684d57`：管理 `e82738b`、B `37a383f`（含 `2338877/3499e7b`）、D `35fe237`（图实现 `1aca7ca`）。首批已在 `6ca154d` push；保留 Hugo 产品和 Crier/Next 后端，本轮不运行数据库套件。

| 统一分支执行命令 | 结果 |
| --- | --- |
| `npm run build` | Hugo 0.164.0 extended + Next 15.5.25 通过，无隐含迁移 |
| `npm run typecheck` | 构建后独立执行通过 |
| `npm test`，仅设置 `GONGZHI_TEST_BASE_URL=http://127.0.0.1:3019` | 106 pass / 0 fail / 3 skip；两个 PG 环境开关均移除 |
| `npx --no-install playwright test --config tests/integration/playwright.config.ts` | 原 I 8/8 通过，1440×960 / 390×844 |
| `npx --no-install playwright test --config C:/Users/DW/AppData/Local/Temp/gongzhi-evomap-I-frontend/playwright.config.mjs` | B 原 15 + 主题导航 5，共 20/20；读取 I 的 tests/frontend，指向 I3019，无 webServer |
| `npx --no-install playwright test --config C:/Users/DW/AppData/Local/Temp/gongzhi-evomap-I-final/playwright.config.mjs hugo-theme.spec.ts hugo-graph-theme.spec.ts` | 最终源码 9/9：B 主题 5 + D 实际 CSS/按钮专项 4；未设置 fixture 模式 |

首批 `8125c3e` 完成 Node/HTTP、I8、B20。随后 B/D 末片仅增加专项、截图回页首、报告与空白清理，生产行为不变；最终 `22beae2` 再完成完整 build、typecheck、上述9项与首页 HTTP 200，未重复不变的后台套件。两份 TEMP 配置仅替换 baseURL、testDir、报告路径，并将 TMP/TEMP 指向独立 I 证据目录，未占用 B3219/3221 或 D3231。

I 浏览器实际覆盖自然入口、双入口登记、Agent 唯一点、镜头保留、公开交流证据与公告双向定位、三故事、草稿刷新、示例重置、WebGL 降级，以及 MSW `/demo/` scope、未知示例 API 拒绝、真实页面无 SW 控制且失败不回退 fixture。示例内容和模拟执行回执只证明交互，不是模型协作。

最终体验：<http://127.0.0.1:3019/>，进入示例为 `/demo/space`，真实 `/network` 明确显示服务不可用。自有 Next PID `83284` 只监听 127.0.0.1；DB/Auth/助手与遥测关闭。重启前核对原进程与监听归属，未碰 B/D 端口、原 PG 容器或数据库。

依据用户本地 `docs/source/evomap-style-2026-09-14.md` 与 `evomap-frontend.md` 复核：黑白灰层级、冷青主色、细边界和紧凑导航；不把研究包暖色排版当产品风格。Outfit / Rajdhani 自托管来源固定为 google/fonts `809e4d8b8d7e9364a914909bb777679606c178b8`，保留 OFL 1.1；HarmonyOS 未提供，中文使用系统回退。旧 my_blog / WeRemember 来源与 MIT 许可保留，旧暖色样式不再装载。

I 已审阅1440/390深浅四图、接入弹窗、窄屏表单和真实失败界面：导航与双入口可读、无横溢、移动锚点露出于吸顶头下方。默认 dark，偏好跨刷新/空间/重置保留；存储拒绝仍可切换；键盘 focus 与减弱动效通过。D 专项以真实 Canvas 像素验证点/线/hover 可见，主题反复切换、刷新与新增点边保留同一 Canvas、原生 x/y/k 和点位；B 原测试保留68点至少88%独立可见阈值。公开记录数据为明确标记的 HTTP fixture，不能计作真实 Agent 执行。

Git 外证据根目录 `C:/Users/DW/AppData/Local/Temp/`：`gongzhi-evomap-I-node.log`、`gongzhi-evomap-I-build-final.log`；`gongzhi-evomap-I-first/report.json`（I8）、`gongzhi-evomap-I-frontend/report.json`（B20）、`gongzhi-evomap-I-final/report.json`（最终9）。最终截图在 `gongzhi-evomap-I-final/gongzhi-evomap-evidence/`：`page-{1440|390}-{dark|light}.png`、`connect-*`、`form-*`、`live-error-light.png`、`live-disabled-dark.png`；D Canvas 截图在同级 results 附件。未发现待返修领域问题；总控独立预览已通过，最终管理验收 `bc2caf9` 已普通合入，见 `docs/source/evomap-style-2026-09-14.md`，仅文档收尾不重复构建。

沿用 Node24.16.0/npm11.13.0、Playwright1.63.0/Chrome152.0.7977.83，根依赖与锁文件未变化，复用此前锁定安装。本轮未运行 PG、迁移、云 Auth、模型或知乎；上一轮基线的本地 PG 通过记录仅为历史证据。真实云身份、真实模型 Agent 协作仍未验证，未新增费用、公开部署或赛事提交。
