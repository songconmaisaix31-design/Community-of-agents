# 经验离线借用集成验收（2026-09-14）

本轮沿 Next/Crier、官方 GoTrue/PG、静态页面与 Agent-only 图继续集成；不替代上一轮未完成的全量回归结论。

- 普通 no-ff 合入 Core `09fd1faf42a26082cb036bcff542ab85b43c2759`、Connect `a833303e229131b970e4a75d50a25cc980408705`、Frontend `b7978d9c10ffb7843ffbadb96749e0bc8d07c76e` → `345f909a2d060b57ceff5c43b89681a17fa2d677` → `ed23295517683b54930bb8ae1f8df82a938df174` → `c9b95de268fc5d62ea041a57fad5a4b4f2d2d6b6` → `6a138f64bce6471de094222ff02eb924d688aab8`。
- I 在 `bc8ed1071ae162ca3305c08102952219523b5842` 为旧 HTTP 经验发布测试补准确内容批准，并保留未批准拒绝断言。
- 完整构建源 `88e7e6a1d4fe98bea47ff764e98263cf8be2206d`：Git archive 独立快照，`npm ci --no-audit --no-fund`、`npm run typecheck`、`npm test` 成功（243 pass / 0 fail / 19 skip）；显式 `GONGZHI_COMPOSE_TEST=true node --import tsx --test tests/core/production-package.test.ts` 2/2。默认跳过的真实数据库、登录、浏览器及生产空库门控不算通过。
- `docker build --pull=false --target runtime --label org.opencontainers.image.revision=88e7e6a1d4fe98bea47ff764e98263cf8be2206d -t gongzhi:integration-experience-88e7e6a .` 成功，实际执行 `npm run build`；manifest `sha256:4e570ecfba530a72b073ee0abb6cd7a7a7fd88bf44bf9a6b8af31c6396d11516`。构建不执行迁移。
- 后继源码 `43af491af6b13b7da2d481045334dd7579f83e3d` 仅增加 F 的 `experience.js` 五行退出清稿修复及测试/文档；Git 外 Dockerfile 在上述已编译镜像上 COPY 此精确静态文件，保留非 root 用户并标明两层源码，manifest `sha256:361ba99b3d72ffb37bb3c159b950e87af65885ba6482ab4d1a034e4e91819f75`。没有将静态替换称为再次完整 Next 编译。
- 完整报告/测试快照 `5068c2d89da9f4103081775901c54e1b0ba6f782` 再次 `npm run typecheck` 成功，复用同锁隔离依赖；随后普通合入 M `09a9588057d42fd3dc6a36fc8a998cfc13b6be21`，只新增协调说明。最终产品文件对43af无差异。

## 真实环境与当前边界

经 F 确认无在途写请求后，严格核对 `127.0.0.1:56640/gongzhi` 与 `gongzhi-fulltest-c-20260914`，使用现有管理员配置显式 `node scripts/migrate.mjs`：仅应用 `0014-run-budget.sql`，再次执行 all 14 recorded / no-op。旧记录和全部 PG/Auth 卷保留；只替换本轮 3079 app，旧 app 容器保留供回滚。

3079 当前实际运行上述 43af 静态后继：health/config/经验摘要搜索 200，匿名 agents/me 401；app healthy、用户 gongzhi，启动命令/健康检查保持，HTTP 下载的 experience.js 与固定源逐字一致。

| 实际检查 | 结果与证据边界 |
| --- | --- |
| 43af `npm run typecheck`；Chrome `evomap-account / evomap-experience / evomap-connect / evomap` | typecheck 成功；42/42，包含取消/unknown/预算、准确批准竞态、退出清稿、图镜头/无 WebGL、移动界面；HTTP fixtures，不是模型执行 |
| 修改后的 `GONGZHI_TEST_HTTP_DATABASE_ENV=<已核对 http-test.env> node --import tsx --test tests/integration/live-http.test.mjs` | 8/8；真实 Next/PG，Auth HTTP stub；独立 `56640/gongzhi_core_test`，精确批准、版本/采纳/撤销、持久化重启、助手 unavailable。未用 3079 主库或旧 3069 造数 |
| F 最终 `GONGZHI_BROWSER_LIVE=true ... evomap-live.spec.ts`（测试 `e74314010926047ce93f082ad6da3a0435edfaf1`） | 43af 实际托管 4/4 / 17.4 秒；官方登录、双账号分享/撤销后下载/反馈、390px、跨标签退出清稿；无页面覆盖。I 已读原始日志和桌面/手机截图，程序创建的测试记录不冒充 Agent 独立工作 |
| I 独立 Chrome 1440/390 实际 `/zh/board/` 搜索 A 的新经验 | 均找到，0 横溢出 / pageerror / 第三方请求；匿名上下文，无密码/key/trace |

A 为原 Core Agent，独立整理已提交公开契约的 SKILL；I 完整审核准确 JSON/public 后签单次批准，A 用自身有限 key 上传 `gtvzeqZs` revision1。I 核对批准回执、正文、来源及 speaker `73950fdd-dd45-465a-b322-9164f762c6e0` / human owner `1d6e28b4-adde-4ebd-9c40-2c0968b3ac71`，14:58:11.737 UTC 撤销本次 grant；A 本人最后 status 返回 revoked 并退出网络参与，公开固定版本仍保留。见[原 A 的实际记录](../core/experience-agent-a-2026-09-14.md)。

B 为原 Connect Agent，另属 human owner `f3a8f983-e050-4763-9522-2833bda56c63`，Agent `607d07d5-7b0a-40ea-8b29-f32bd5e56c5a`，仅 read/discuss。B 本人经官方 MCP 读摘要/固定版本后，实际做 8 项 CLI 检查（2 成功、6 正确拒绝），另将 unknown 等未触发事项明确写成静态审查；I 完整核对八份命令/退出码、输出未覆盖证据、报告和反馈草稿，签准确 public 批准后，B 本人一次上传反馈 `oZZ29tnv`，15:13:04.584 UTC 批准消费并绑定该真实记录。I 回读正文/usage/outcome 与获准草稿一致；B 结束网络检查后，I 于15:15:33.911 UTC 仅撤销本次 B grant，公开记录保留。见[B 实际借用报告](../connect/experience-borrower-live-2026-09-14.md)（普通合入 `939b673471688f809b5667531e2f9803b662becd`）；A/F 后继报告分别普通合入 `622d466b74edde537d35447afeeadf63a02b98f9` / `12ae529aec1042f8881a8b1f20c1ce9518993a36`。A/B 测试审核不等于两位公众自然人亲自确认，也未调用本平台收费模型。

I 新增 `experience-offline-readback.test.mjs`，以 `GONGZHI_EXPERIENCE_READBACK_URL=http://127.0.0.1:3079`、`GONGZHI_EXPERIENCE_READBACK_ID=gtvzeqZs`、`GONGZHI_EXPERIENCE_READBACK_FEEDBACK=oZZ29tnv` 运行 `node --test`：**1/1**，包括撤销后的公开固定版本、REST/官方 MCP/board/thread 完整记录一致、不同 owner/speaker、错误版本拒绝、匿名私有入口401、反馈不制造在线作者边。首次误在旧工作树运行因缺 SDK 未发请求；转用上述同锁 `npm ci` 的隔离依赖后通过，原失败日志保留。B grant 撤销后同测试仍通过；I 实际 Chrome 1440/390 打开这条真实线程，两份完整正文均在可滚动正文内，无异常/第三方请求。

Git 外日志根：`%TEMP%/gongzhi-experience-i-88e7e6a/`（完整构建/Node）、`%TEMP%/gongzhi-experience-i-43af491/`（最终类型/42 fixtures/8 HTTP/镜像及 `browser-public/`）。F 原始日志 `gongzhi-f-live-final-20260914-225639.log`、截图 `gongzhi-evomap-live-F-1789397801133/` 同在 TEMP；人类凭据不在这些日志或 Git。

## ECS 实际应用更新

正式入口仍为 <https://zhihu.davidwang.space/zh>；本机隔离体验为 <http://127.0.0.1:3079/zh/board/>，两者数据分开。使用已授权 `ssh -o BatchMode=yes -o PasswordAuthentication=no gongzhi-ecs` / `scp`，严格原主机密钥、无新密钥/权限/隧道。runtime 与 migration 两镜像 `docker image save` 共459037696 bytes，归档 SHA256 `728e34d739e7b83a2779f63a6b3c00113e3446a96a28babccc9eb861624e6238`，单次 SFTP 到 `/opt/gongzhi/transfer/experience-43af491/experience-images.tar` 后核对并 `docker load -i` 成功；远端 image ID 与本机一致。

- runtime image ID：`sha256:361ba99b3d72ffb37bb3c159b950e87af65885ba6482ab4d1a034e4e91819f75`；migration image ID：`sha256:15ff718bf6da0ed236385ff12a1209077b4c4902e1139636525279909704ce51`，后者为原 Dockerfile `--target migration` 构建、用户 node。两者源码标签43af，runtime另标明已编译基底88e7。
- 使用原 `base=/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production`、`--env-file /etc/gongzhi/production/compose.env -f "$base/compose.yaml" -f "$base/compose.https.yaml"`；仅进程内指定新 `GONGZHI_APP_IMAGE=gongzhi:integration-experience-43af491` 和 `GONGZHI_MIGRATION_IMAGE=gongzhi:integration-migration-43af491`，原配置文件未改。
- 后续运维的这两项非秘密镜像选择已独占新建并保存在 `/opt/gongzhi/transfer/experience-43af491/release-images.env`，避免默认选回旧镜像。使用原 compose.env 后再加载此 release env，实际 `config --quiet` 和 `config --images` 均验证选择上述新 runtime/migration；未再次 up 或更改 Auth/密钥。下次只更新 app 可复用（`base` 取上项完整路径）：`docker compose --env-file /etc/gongzhi/production/compose.env --env-file /opt/gongzhi/transfer/experience-43af491/release-images.env -f "$base/compose.yaml" -f "$base/compose.https.yaml" up -d --no-deps --wait --wait-timeout 120 app`。
- `docker compose` 上述双文件 `--profile maintenance config --quiet` 成功；随后 `--profile maintenance run -T --rm --no-deps -e GONGZHI_PRODUCTION_MIGRATION=zhihu.davidwang.space migrate node scripts/migrate.mjs --production-target=zhihu.davidwang.space` 严格 CA/hostname 生产路径显式应用13/14，再次执行 all14/no-op；最后仅 `up -d --no-deps --wait --wait-timeout 120 app`。没有隐式迁移、Auth 迁移或种数据。
- 新 app CID `59e87ea1460b15856473745bcd6e3c96f1c6ae88b4c57def5b45ebc3c7b24af0`，四服务 healthy、用户 gongzhi。首个文本挂载比较因列表顺序变化令后检查 exit1；未重复部署，按 Destination 规范化后字段完全一致、exit0。DB/Auth/proxy CID、端口、挂载、全部原 env/域名配置均不变，users/posts/owners/grants 前后仍 `0/0/0/0`；保留旧06e6回滚镜像 `sha256:3a6412723f0e99e4684779f10d668339536457441fb52d4517930e247f9fff46`，磁盘剩余11168526336 bytes。
- 在 **ECS** 通过新 runtime 的 Node、host network 对 `127.0.0.1:8080` 跑 `GONGZHI_PRODUCTION_ACCEPTANCE_URL=... node --test /checks/tests/integration/production-readonly.test.mjs` **5/5**：三层health、正式Auth配置白名单、空board/Agent图、三页、D单一源公开skill、Auth admin/demo拒绝。附加实际新经验 REST/MCP 搜索均live空集，本机 `gtvzeqZs` 在云端404，审批/Agent身份/原键lookup匿名401，最终静态修复存在；未复制本机记录/私有docs。`pg_stat_ssl` 空闲采样无行，本轮不新增 Auth 实际握手证明或真实云登录结论。

2026-09-14 **15:18 UTC** 正常域名复查：HTTP403 / Beaver，HTTPS curl exit35 / 握手失败；保留正常DNS/HTTPS配置，没有绕过ICP。云端服务更新成功不等于公网可用。未调用模型、知乎或 SMTP，signup/邮件配置未变，缺项目模型价格与预算，不将 fixture 用量、合成回复或上传回执称真实推理。旧预览、旧3069对话及生产数据保留。Git外云命令/检查日志在上述43af目录的 `ecs-deploy.log`、`ecs-postcheck.log`、`ecs-readonly.log`、`domain-*.log`；最终真实线程截图为 `browser-public/actual-feedback-{1440,390}.png`。
