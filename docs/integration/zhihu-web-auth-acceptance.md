# 知乎网页登录集成验收（2026-09-15）

从 `72dfd46f8c7b99d9a8c659ad95f50e3f206e18ea` 普通合入 Core `93cffba785e9e5afd84733b514bfcfca34dccc22`（含 D `2a615386472b1529448cb8fcdb2846c9064ff9a7`）、F `e4e869a570263c44397c6a79675f5afc1048a4cd`；M `681968e0689ffa9bf987ed7546fe99e2870f0e54` 已在谱系内。首片 `f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4` 已推送。保留 Next/Crier、存储和有限 Agent 授权，邮箱不再作为网页登录后备。

## 已执行

精确 `git archive f9a0b33...` 到 Git 外独立目录，`npm ci --no-audit --no-fund`、`npm run typecheck` 通过；`GONGZHI_COMPOSE_TEST=true npm test` 为 **272 pass / 20 skip / 0 fail**（含 I 新增专库守卫）。`docker build --target runtime` 和 `--target migration` 完整 Linux 构建通过，构建未读配置或迁移。Node 24.16.0；Chrome 使用已安装 `channel: chrome`。

`GONGZHI_WEB_AUTH_TEST=true node --env-file=<本项目 core-test.env> --import tsx --test tests/core/web-auth-live.test.ts` **9/9**：专库 `127.0.0.1:56640/gongzhi_core_test`、crier_app，0015 已存在；真实 PG、明确函数参数上游 HTTP fixture，不是真实知乎授权。独占运行，没有写 3079 主库或旧 3069 记录。

I 新增 `oauth-browser.config.ts` / runner 复用 F 四项流程：实际托管原 HTML/SDK，Core `handleWebAuth` 处理 start/callback/session，浏览器自行接收 HttpOnly cookie；只向 callback 的 `upstreamFetch` 参数注入官方协议 fixture，业务 REST 直接使用原处理器与真实 PG。没有 addCookies、生产身份后门、页面拦截或浏览器安全绕过。自动 trace/screenshot/video 关闭；截图只在令牌收起后生成。

首次启动因 Playwright 默认 cwd 拼错路径失败，I 明确 repo cwd 后修复。随后前三项通过；第四项实际批准、上传、离线固定版本下载和反馈回执成功，但 F 全页 `.ex-feedback` 同时匹配历史公告与当前弹窗，断言失败；已交原 F 窄修，保留历史数据。此前第二项预先等待响应跨越整个登录过程的 15 秒超时也已交 F 处理，最终复验待追加。

按总控明确授权，在 3079 本项目主库显式应用 **仅 0015**，重复执行 all 15/no-op；users/posts/owners/grants 前后均 **8/26/14/18**。只替换 app 为 `gongzhi:oauth-runtime-f9a0b33`，新 CID `fd68bef9c2feb1ff068041780aa2ecd71619f63a781ec564985092632fd12d17` healthy；旧容器 `gongzhi-fulltest-c-20260914-app-pre-oauth-f9a0b33` 保留，DB/Auth/网络/卷/私有配置不变。

日志根：`%TEMP%/gongzhi-oauth-i-f9a0b33/`；首次失败与每次复跑分文件保留。旧邮箱/GoTrue、未显式启用的其他环境检查为跳过/历史证据，不用于证明知乎登录。

## 尚未完成

本页阶段记录：F 测试窄修后四项复验、54 项前端 fixture、实际 Next 未配置四项和 ECS 更新仍在进行。现有 ECS 只读预检四服务 healthy，仍为旧源码43af/镜像361ba99；不声称本轮已上线。用户未提供 OAuth App ID/App Key/已登记回调，既有 Access Secret 不可替代；官方授权须本人确认，真实模型、SMTP和公网回调未验证。正式入口 `https://zhihu.davidwang.space/zh` 的既有 ICP HTTP403/HTTPS 握手失败另列限制，不以本机或 fixture 替代。
