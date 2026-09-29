# 知乎网页登录集成验收（2026-09-15）

分支 `integration/gongzhi-mvp`。从 `72dfd46f8c7b99d9a8c659ad95f50e3f206e18ea` 普通合入 Core `93cffba785e9e5afd84733b514bfcfca34dccc22`（含 D `2a615386472b1529448cb8fcdb2846c9064ff9a7`）、F `e4e869a570263c44397c6a79675f5afc1048a4cd`；M `681968e0689ffa9bf987ed7546fe99e2870f0e54` 已在谱系内。首片/产品构建源码为 **`f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4`**；再普通合入 F 纯测试后继 `b62791e52c353abe8c6884fd94defaab5ce0086b`、`ec482f2cdf275eb31e8c44d76459e120a1d796cb`，最终代码/测试验收快照 **`c1694bfe3d0833900ee820095cdeb7f7a9fad955`** 已推送，本报告为后续文档提交。后继只改 tests/docs，保留 Next/Crier、存储和有限 Agent 授权，邮箱不再作为网页登录后备。

## 已执行

精确 `git archive f9a0b33...` 到 Git 外独立目录，`npm ci --no-audit --no-fund`、`npm run typecheck` 通过；`GONGZHI_COMPOSE_TEST=true npm test` 为 **272 pass / 20 skip / 0 fail**（含 I 新增专库守卫）。`docker build --target runtime` 和 `--target migration` 完整 Linux 构建通过，构建未读配置或迁移。Node 24.16.0；Chrome 使用已安装 `channel: chrome`。

`GONGZHI_WEB_AUTH_TEST=true node --env-file=<本项目 core-test.env> --import tsx --test tests/core/web-auth-live.test.ts` **9/9**：专库 `127.0.0.1:56640/gongzhi_core_test`、crier_app，0015 已存在；真实 PG、明确函数参数上游 HTTP fixture，不是真实知乎授权。独占运行，没有写 3079 主库或旧 3069 记录。

I 新增 `oauth-browser.config.ts` / runner 复用 F 四项流程：实际托管原 HTML/SDK，Core `handleWebAuth` 处理 start/callback/session，浏览器自行接收 HttpOnly cookie；只向 callback 的 `upstreamFetch` 参数注入官方协议 fixture，业务 REST 直接使用原处理器与真实 PG。没有 addCookies、生产身份后门、页面拦截或浏览器安全绕过。自动 trace/screenshot/video 关闭；截图只在令牌收起后生成。

最终 c1694bf 独立快照 `npm run typecheck` 及 `node node_modules/playwright/cli.js test --config tests/integration/oauth-browser.config.ts` **4/4**：start Cookie → callback303 → 最终 `/zh`200 → session → 真实业务 REST/PG，双身份、精确 grant 撤销、准确 public 内容批准、作者撤销后固定版本下载、独立反馈与跨标签退出。数据明确为程序化协议测试，不是真实知乎身份或自主 Agent 工作。

保留中间失败：I 首次 cwd 拼错已修复；原 F 修正登录前过早等待、全页反馈选择器与 Playwright 独立请求接口不发送127回环 Secure Cookie。最终用页面内同源 fetch、原15秒动作超时和原全部身份/正文断言，不复制 Cookie、不清历史数据、不修改产品掩盖失败。I 已查看最终390px反馈线程截图。

按总控明确授权，在 3079 本项目主库显式应用 **仅 0015**，重复执行 all 15/no-op；users/posts/owners/grants 前后均 **8/26/14/18**。只替换 app 为 `gongzhi:oauth-runtime-f9a0b33`，新 CID `fd68bef9c2feb1ff068041780aa2ecd71619f63a781ec564985092632fd12d17` healthy；旧容器 `gongzhi-fulltest-c-20260914-app-pre-oauth-f9a0b33` 保留，DB/Auth/网络/卷/私有配置不变。

五文件 `node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts evomap-account.spec.ts evomap-experience.spec.ts evomap-connect.spec.ts evomap.spec.ts evomap-oauth.spec.ts` **54/54**：明确 HTTP fixture。同配置 `GONGZHI_BROWSER_LIVE=true ... evomap-live.spec.ts` 对真实 Next 3079 **4/4**，无拦截、无凭据、无写入：未配置/无邮箱入口、匿名 session/401/start503、无效回调与假 success 标记、本地草稿零上传。I 已查看1440/390截图，文字可读且无横溢出；`%TEMP%/gongzhi-oauth-unconfigured-F-1789403391052/`。

原 A/B 经验链仅只读复验：`GONGZHI_EXPERIENCE_READBACK_URL=http://127.0.0.1:3079 GONGZHI_EXPERIENCE_READBACK_ID=gtvzeqZs GONGZHI_EXPERIENCE_READBACK_FEEDBACK=oZZ29tnv node --import tsx --test tests/integration/experience-offline-readback.test.mjs` **1/1**，REST/MCP/board/thread保持一致；没有重发、改写或当作本轮新 Agent 执行。

日志根：`%TEMP%/gongzhi-oauth-i-f9a0b33/`（构建/Node/PG/54fixture/3079及云部署检查）；`%TEMP%/gongzhi-oauth-i-c1694bf/`（最终类型/4条浏览器），安全截图 `gongzhi-oauth-pg-screenshots-1789404510691/` 同在 TEMP。首次失败与每次复跑分文件保留。旧邮箱/GoTrue、未显式启用的其他环境检查为跳过/历史证据，不用于证明知乎登录。

## ECS 实际更新

既有 `cn-beijing / i-2ze2nztd89vevmw21wif`，原 `ssh -o BatchMode=yes -o PasswordAuthentication=no gongzhi-ecs` / `scp` 严格主机密钥，无新权限、秘密或付费资源。`docker image save` 两镜像归档 **459040256 bytes**，SHA256 **`150a4794ffbb1b99e52fdcc44e4ca9dfc08b68a36d8cd5495581539cf496830e`**，单次上传 `/opt/gongzhi/transfer/oauth-f9a0b33/oauth-images.tar`、远端校验后 `docker load -i`。加载后的首次检查误用 OCI config digest 而退出1；未重复load，改核对实际 Docker ID 与本机一致后继续。

- runtime `gongzhi:oauth-runtime-f9a0b33`：**`sha256:39cf58697e9e19aab179fdcb6b986c2a6ef9ced428c1948ca667430aeef96ed5`**、用户 gongzhi；migration `gongzhi:oauth-migration-f9a0b33`：**`sha256:fbbd5cbc0bc7cd530c1c58e15d976e615f5b735628556eb135745ca40b1113be`**、用户 node。均为原 Dockerfile 完整目标构建，源码标签为完整 f9a0b33；不是旧 ee269 构建。旧43af/361ba99回滚镜像保留。
- `base=/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production`；运维使用 `docker compose --env-file /etc/gongzhi/production/compose.env --env-file /opt/gongzhi/transfer/oauth-f9a0b33/release-images.env -f "$base/compose.yaml" -f "$base/compose.https.yaml"`。新 release-images.env 仅含上述两个非秘密 tag，原配置不变；不得用仅 base 的 `/opt/gongzhi/dc up`。
- 上述命令 `--profile maintenance config --quiet` 后，显式 `--profile maintenance run -T --rm --no-deps -e GONGZHI_PRODUCTION_MIGRATION=zhihu.davidwang.space migrate node scripts/migrate.mjs --production-target=zhihu.davidwang.space` 仅应用0015，第二次 all15/no-op；随后仅 `up -d --no-deps --wait --wait-timeout 120 app`。没有 Auth 迁移或种子账号。
- 新 app CID **`95e684940cb0ec7e657fcf0483745ad1e09029bb8e241d7190cb7d8fb85c87c8`**，**四服务 healthy**。DB/Auth/proxy CID、原配置哈希、挂载、端口均不变；users/posts/owners/grants 前后 **0/0/0/0**，新 web users/sessions 均0，没有复制测试记录。磁盘剩余10582728704 bytes。
- ECS 新 runtime 执行 `GONGZHI_PRODUCTION_ACCEPTANCE_URL=http://127.0.0.1:8080 node --test /checks/tests/integration/production-readonly.test.mjs` **5/5**：三层health、OAuth白名单/available=false、空真实board/Agent图、三页/D单一源skill、匿名401/admin404/demo409、回调完整到 `/zh`200。四个静态JS的HTTP字节与构建产物一致，MCP GET405；`pg_stat_ssl` 实测 app **TLSv1.3**。只拷入公开检查文件，无其他私有docs。云端日志 `ecs-load.log` / `ecs-deploy.log` / `ecs-readonly.log` 位于上述 f9a 临时目录。

## 尚未完成

2026-09-14 **16:53 UTC** 正常域名 `curl.exe --noproxy '*' --connect-timeout 5 --max-time 12 -I` 复查：HTTP **403 / Beaver**，HTTPS **exit35 / 握手失败**。正式入口仍为 **https://zhihu.davidwang.space/zh**，不能称公网可用，未通过IP/端口/代理/隧道绕过ICP。本机新版 `http://127.0.0.1:3079/zh/connect/#account` 仅为本机体验，不是服务器入口。

用户已补充官方 quickstart 认证段落；M 在 f9a 源码对用户给出的三份 HTTP200/code401 错误响应分别测 exchangeCode/readUser，**6/6 unauthorized、0 外部请求**，是上游响应 fixture。M 另独立 SSH 复验四服务健康、provider=zhihu/available=false及公网403/HTTPS35，与 I 一致。本报告不冒称 I 访问了需登录的原文页。**仍缺本项目 OAuth App ID/App Key、准确登记回调和本人官方授权**；Access Secret 不可替代，因此真实知乎登录未验证，站点诚实 available=false。真实平台模型、SMTP和公网回调未执行；保留旧 GoTrue 服务不等于新网页登录完成了真实第三方授权。
