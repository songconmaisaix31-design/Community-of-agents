# 主站星图与共享进化页验收（2026-09-15）

主站前端已更新，原域名 `https://zhihu.davidwang.space/zh#agents` 外部仍为 HTTP403 Beaver、HTTPS exit35；源站成功与公网限制分别记录。可公开体验的共享理论页：<https://demo.zhihu.davidwang.space/community/zh/evolution/index.html>，演示星图仍在 <https://demo.zhihu.davidwang.space/zh/?demo=atlas#agents>。没有录像或配音。

- 从 `6832746160e57d0fb2df847294ef8f471c63c838` 普通 no-ff 合入 F 首片 `7c6758a9c50327949e44501fc7ee58a4922cdd19`、M `4ab259a8b77d581741f3ccc15d58e071407a011d` 和 F 最终 `e4be82f12fdc2d8fed9e5bebfbbc26d210b842e1`。**发布前端源码 `ed9fec9ff9f37139f2b1c1a5d0b4c9da2628b650`**，前端及前端测试树与 F 最终一致；I 后继 `803d0b75ffa7aed8691d2b1f2a3ee958be86fe3b` 仅补测试导航同步。
- 主站默认100能力参考是独立初始视图，不由 API 失败触发；`graph=registered`/`live` 的实际空列表或错误不补参考角色。沿 Cosmos 保留镜头、圆盘初始点云、一角色一点，只有真实记录用于已接入视图。理论页共用现有静态路径，不增加 Next 路由；六步、版本比较、来源和批准边界均为理论说明，不是执行回执。
- 后端、Auth/API/MCP、迁移、根配置/依赖/锁和生成客户端相对本轮基线零差异。没有安装依赖、完整后端重建、迁移、账户/业务写入、模型/知乎/SMTP请求，旧预览和 O 私有资料未动。

| I 实际执行 | 结果与证据边界 |
| --- | --- |
| `npm run typecheck` | 通过；固定快照复用已有锁定 node_modules |
| F 理论/能力图/Atlas 三文件 Chrome 回归 | **24/24，56.8秒**；1440/390、六步/版本/导航、真实空间空/错与晚到响应的 HTTP fixture、点选/镜头、WebGL 列表、Atlas 版本/反馈均通过；不是云端真实 Agent 执行 |
| I Pages 本地产物三项 | **3/3，19.7秒**；三旧入口强制演示、退出说明、Atlas、理论往返、无横溢；无真实接口/跨源请求、404或运行时异常 |
| ECS 新镜像与源站只读检查 | 镜像12/12文件及 UID1001；生产5项+静态/模式/MCP3项 **8/8**，实际PG空board/graph、匿名401、管理404、demo409、健康/公开配置均保持 |
| 公开 HTTPS 浏览器 | 原 Atlas/入口 **2/2**；理论首次1失败，修 I 同步后只重跑理论 **1/1，15.4秒**；补 console.error 观察后 Atlas/理论2项通过，入口发现一次资源404，修发布胶水后入口 **1/1，10.7秒**。最终三项分别通过，无真实接口/跨源请求、404、运行时或控制台错误 |
| 公开文件与独立复核 | I 理论HTML/JS/CSS、capabilities.js、graph bundle **5/5 HTTP200且等于准确Git blob**；M独立五资源相同，源站页面/图代码/空真实图另已复核 |

公网初次失败证据保留：点击导航后的 URL/HTML 已出现，但 `evolution.js` 的 defer 请求尚未完成，step1 点击时无监听器。独立诊断复现 readyState=interactive，脚本7338ms完成、DOMContentLoaded7339ms发生；I 只增加 `waitForLoadState('domcontentloaded')`，未去断言、增加业务后门或再次部署。工作目录中的 CRLF 与公开 Git LF 不能混称逐字一致：ECS12/12准确比较的是构建context；另逐一证明12文件相对Git**仅CRLF差异**，Pages公开字节则等于Git原文，无其他差异。

随后为显式“控制台无错误”要求补充 console.error 捕获，三项中入口出现一次无URL的资源404，Atlas/理论两项通过。定向携带 console location 诊断未再次复现；独立 GET 确认 `/favicon.ico`404，I根入口和/about没有声明图标，因此仅这两个发布HTML增加准确 `/community/icon.svg` 引用，并增加说明页图标断言；没有忽略console错误、伪造404成功或改业务资源。

## 两处部署

ECS 新镜像 `gongzhi:evolution-frontend-ed9fec9`，image ID **`sha256:f7adb3245d2f4439369dc220d1256a507adefe88d59ebb880460ea7f6f0d4801`**。FROM 实际核验的旧 `gongzhi:atlas-frontend-247beae`（`sha256:e9c8818b432c14254aeb3551a283e7bd766d9552c7ae169d4948cec32d736fd6`），仅 COPY 12 个公开文件、零删除，包868864字节；`docker build --network none --pull=false`。后台仍为 **`f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4`**，不是整个新分支后台部署。

新选择文件 `/opt/gongzhi/transfer/evolution-ed9fec9/release-images.env` 仅 APP 新镜像和原 `gongzhi:oauth-migration-f9a0b33` 两个非秘密变量；原选择文件 `/opt/gongzhi/transfer/atlas-247beae/release-images.env` 与旧镜像保留回滚。实际命令：

```sh
base=/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production
dc() { docker compose --env-file /etc/gongzhi/production/compose.env --env-file /opt/gongzhi/transfer/evolution-ed9fec9/release-images.env -f "$base/compose.yaml" -f "$base/compose.https.yaml" "$@"; }
dc config --quiet
dc up -d --no-deps --no-build --pull never --wait --wait-timeout 120 app
```

仅 app 变为 `96f528968e571fce3406be7314a8c1479bfd00e1b6043069f28160d74d381c0e`；四服务healthy，DB/Auth/proxy完整CID、镜像、挂载与端口全相同，所有服务用户/挂载/端口不变。只读测试在无监听端口的临时 Linux Node 容器访问服务器内部127.0.0.1:8080，挂载公开检查文件，设置 `GONGZHI_STATIC_EXPECTED_COUNT=12`；未触碰私有配置内容。

Pages 公开功能提交 **`4fd6fc2c1170108399187af325318a3ba1bd4c48`**，[build1215313566](https://api.github.com/repos/songconmaisaix31-design/Community-of-agents/pages/builds/1215313566)于19:53:42 UTC `built`；最终图标入口后继 **`bd97191cf8ae6af9114b8793c4904e98f6c44bd6`** 只追加两个HTML声明，[build1215325135](https://api.github.com/repos/songconmaisaix31-design/Community-of-agents/pages/builds/1215325135)于20:01:12 UTC `built`。CNAME、approved证书、https_enforced=true保持；31个无需主机入口适配的公开文件（含理论HTML）与源Git blob一致。三旧HTML保持已有强制Atlas/CSP/退出说明胶水，理论HTML不加脚本或横幅；没有发布docs、配置或私密日志。一次Git远端连接超时后，通过官方GitHub ref读取核对原SHA再普通推送，没有force或覆盖远端。

## 复现与留档

固定快照与原始记录：`%TEMP%/gongzhi-evolution-i/`；`frontend-browser.log`、`typecheck.log`、`pages-local.log`、`pages-public.log`（保留2pass/1fail）、`diagnose-theory.log`、`pages-public-theory-v2.log`、`pages-public-final.log`（含console404）、`pages-public-entry-diagnostic.log`、`pages-public-entry-final.log`、`public-bytes.json`、`ecs-build.log`、`ecs-deploy.log`、`ecs-readonly.log`、`ecs-before.json`/`ecs-after.json`、`domain-http.log`/`domain-https.log`。实际已查看截图：`evidence/gongzhi-evolution-f/capabilities-desktop.png`、`evolution-mobile.png`（固定资源+HTTP fixture），`evidence/pages-public/evolution-1440.png`、`evolution-390.png`、`pages-desktop.png`、`pages-mobile.png`（实际公开HTTPS）。

```sh
node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts tests/frontend/evomap-evolution.spec.ts tests/frontend/evomap-evolution-graph.spec.ts tests/frontend/evomap-atlas-fixture.spec.ts
node node_modules/playwright/cli.js test --config tests/integration/pages-fixture.config.ts
node node_modules/playwright/cli.js test --config tests/integration/pages-fixture.config.ts --grep 'shared theory'
node --test /checks/tests/integration/production-readonly.test.mjs /checks/tests/integration/atlas-production-readonly.test.mjs
git diff --check
```

浏览器复用安装的 Chrome 与 `%TEMP%/gongzhi-method-i-75f2d0d-build/source/node_modules`；公开目标设置 `GONGZHI_PAGES_TEST_URL=https://demo.zhihu.davidwang.space`，截图输出 `GONGZHI_PAGES_EVIDENCE`，不记录trace/video。公网主站浏览器因ICP不可验，不能用固定资源测试或源站HTTP替代该事实；没有绕过端口、域名、DNS、代理或隧道。真实OAuth配置和真实Agent/模型执行仍未完成，理论或合成检查不等于成功执行。
