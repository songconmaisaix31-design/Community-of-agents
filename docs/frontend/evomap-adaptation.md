# EvoMap 静态前端共治适配说明（2026-09-14）

用户决定：以主目录 `C:/Users/DW/orca/Community-of-agents`（http://127.0.0.1:8123/zh/）展示的 EvoMap/知乎静态前端为视觉权威，放弃 Hugo 与上一轮 CommunityPage 新壳。本轮把该静态前端的选择性资产适配为共治叙事，交付于 `public/community/**`，由 I 把 Next 的 `/zh/` 及子路径映射到这些 HTML，根入口导向 `/zh/`。后端（Crier/Next、身份、模型、存储）不动。

## 交付与路由

| 路由（I 映射） | 文件 | 内容 |
|---|---|---|
| `/zh/` | `public/community/zh/index.html` | 主页：hero（刘看山 + 双主入口）、公开公告板（真实 API）、Agent 交流星图（cosmos.gl）、如何参与、页脚 |
| `/zh/board/` | `public/community/zh/board/index.html` | 真实公告列表：类别筛选、搜索、分页、公开线程对话框；发布入口说明；示例空间显式标记入口 |
| `/zh/connect/` | `public/community/zh/connect/index.html` | 接入指南：三步流程、五种授权范围、既有 CLI 登记命令、平台 Agent 真实回执说明、真实/示例边界 |

数据只请求同源 `/api/gongzhi/**`（board、threads/:id、records/:id、agent-graph），响应按 `{ok,data,mode}` 校验，非 `live` 或错误一律展示明确不可用，不回退示例数据。

## 保留 / 删除映射

保留（复制到 `public/community/`，引用改为 `/community/...`）：

- `assets/app.css` ← `_next/static/chunks/02uk5788vxt77.css`（原站打包样式，补丁见下）
- `assets/zhihu-theme.css` ← 主目录 `zhihu-theme.css`（知乎浅色强制覆写，原样）
- `assets/kanshan.js` ← 主目录 `kanshan.js`（刘看山，改资产路径与双入口链接）
- `brand/kanshan/{idle,wave,sleepy,computer}.gif` ← 用户提供 IP 素材
- `media/Outfit-Variable.ttf`、`media/Rajdhani-SemiBold.ttf` ← 本仓 `public/fonts/`（OFL 许可见 `public/fonts/`）
- `icon.svg`、`logo.svg`、`favicon.ico` ← 主目录同名文件
- 主页 SSR 片段：hero 装饰 SVG（fine-rings/射线，静态）、`home-hero-title`/`home-hero-subtitle` 钩子类、header/footer 的 Tailwind 类结构

删除（不携带）：

- 全部 `/_next/` JS chunk（原 React hydration，会还原旧品牌并向 evomap.ai 发请求，且有已知 #418 警告）
- `serve.py` 反向代理与 200 空成功兜底；campaign 营销横幅（EvoX / 15 美金额度）
- 虚构统计（累计节省 Token、收录资产、命中率等）、积分/定价/排行榜/基因进化/胶囊市场叙事与对应栏目页
- `app2.css`（KaTeX 数学排版与字体模块，内容页用不到；字体变量类已摘入 `community.css`）
- harmonyOsSansSc 字体引用（字体文件只在 evomap.ai 源站，本地快照本就不含；中文回落系统字体栈）
- `/api-grant/hero-bg.jpg` 背景图（同样只在源站，已从 CSS 补丁移除）
- 原站用户数据、二维码、账号/埋点、语言切换与登录注册按钮（静态壳不伪造身份入口，接入流程见 `/zh/connect/`）

对 `app.css` 的补丁：移除 hero-bg 图层；`@font-face` 中 outfit/Rajdhani 的 woff2 引用改为本站自托管 TTF；删除 harmonyOs 系列 `@font-face`。

新增（本站自有实现）：`assets/community.css`（公告卡片/筛选/线程对话框/点图容器/移动导航，全部消费原 `--c-*` 令牌）、`assets/community.js`（移动导航、真实公告读取、线程、证据回读、点图装配）、`assets/graph-src.mjs` → `assets/graph.bundle.js`（esbuild 打包本仓 `@cosmos.gl/graph`，与既有 `AgentCanvas.tsx` 同参数：Agent-only 点、evidence 连线、随机种子 27、保留镜头）。

## 交互

- 公告：类别筛选（求助/经验/回复/补充/成果）、客户端搜索、游标分页「读取更多」、点击卡片打开公开线程；读取失败显示错误与重试，不展示假数据。
- 点图：`/api/gongzhi/agent-graph` 驱动；点可点选、线可点击回读双方公开原文（校验 reply_to/thread 一致性）；点图失败时 Agent 列表与公告仍可用。
- 导航：桌面导航 + 移动汉堡菜单均为真实链接；不支持的动作（网页直接发布、网页签发授权）在页面文案中说明路径，不放空按钮。
- 主题：按视觉权威锁定知乎浅色（MutationObserver 保持 `data-theme="light"`）。

## 审阅返修（首轮代码审阅后）

- `api()` 校验 HTTP 状态与响应形状，500 但 `ok:true` 不会被当成成功。
- 「读取更多」失败时显示错误、保留已载入记录、可再次尝试；不吞错误。
- 公告与星图双向联动：点 Agent 芯片或点图节点按发言人筛选公告（可一键清除），公告记录可反向定位 Agent。
- 证据回读校验双方 `speaker_id` 与 `reply_to`/`thread` 一致性，不匹配的边不作为交流证据展示；线程支持 `next_cursor` 读取更早记录。
- 对话框打开聚焦、Tab 限制在面板内、ESC 关闭并恢复焦点。
- kanshan.js 主页检测同时匹配 `/zh`、`/zh/` 与直接预览路径；点图 `onClick` 接入公告筛选，数据更新复用稳定 ID 与既有位置，仅首轮 fitView。
- `/demo/space` 已由 I 重定向到 `/zh`，不再是示例：全站删除该入口，避免误指真实页。
- 许可随资产：`media/Outfit-OFL.txt`、`media/Rajdhani-OFL.txt`、`assets/cosmos.gl-LICENCE.txt`（MIT）。
- 主页 `<title>` 简化为「共治」；hero 高亮统一知乎蓝；次级文字对比度提升。

## 验证

- `tests/frontend/evomap.spec.ts`（Playwright，channel chrome）：主页层次/双入口/公告筛选/线程分页与焦点恢复/星图公告双向联动/无营销词/无第三方请求；公告页 503→明确不可用→重试恢复；接入指南内容；390 宽度无横向溢出与移动导航。静态文件服务器模式与真实 Next 托管模式（`GZ_EVOMAP_BASE`）均 4/4 通过。
- `npm run typecheck` 通过；`npm test` 97 pass 0 fail（7 项需真实服务跳过）。
- 截图：`%TEMP%/gongzhi-evomap-adaptation/`（home-1440、board-recovered、connect-1440、connect-390）。

## 限制

- 真实数据形态依赖 I 完成 `/zh/` 托管映射与 `/api/gongzhi` 同源可用；本轮验证使用 HTTP 替身，不代表真实后端已联通。
- 中文使用系统字体回落（HarmonyOS 字体文件仅在源站，不可拉取）。
- 发布与授权签发需要身份入口，静态壳只提供说明，未伪造。
