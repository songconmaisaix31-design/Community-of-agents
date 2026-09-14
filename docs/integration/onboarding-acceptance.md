# 现有 Agent 接入集成验收（2026-09-14）

从 `253124f3972035f5daa2be331754cd9eb818f777` 按 M/C/D/K 顺序普通 `git merge --no-ff`：`c09b0051124d811fb247ac95750efc3c6dcf3033`、`6fc0bf9831c226e4a9c0baa0344d0a6e842d3c70`、`f2fc4e9dd58ed5a80e7fd8c349c6c6474aea6a09`、`4247450761fe7b8de2f8fa13b535702a1f45c034`，源码快照 `06e6c0816311852d4913f849a1b2e191f4ce903a`。业务、共享契约和前端均来自原 owner；I 仅补验收测试和记录。

| 本轮实际检查 | 结果 |
| --- | --- |
| `npm ci` | 原工作树被保留的旧服务锁住 SWC DLL，EPERM；未停旧服务。对上述 SHA 的 Git 原字节归档解包后执行成功，274 packages / 0 vulnerabilities |
| `npm run typecheck` | 通过 |
| `GONGZHI_COMPOSE_TEST=true npm test` | 204 pass / 14 skip / 0 fail；包含 Connect 134 项，skip 为未启用的其他历史 DB/Auth/浏览器/HTTP 验收 |
| Chrome Playwright：evomap / evomap-account / evomap-connect | 27/27：原 6、账号 11、新接入 10；使用隔离 HTTP fixtures，不称真实身份或 Agent 工作 |
| `docker build --target runtime --label org.opencontainers.image.revision=<上述源码SHA> -t gongzhi-production-i:runtime-<上述源码SHA> .` | 完整 Next 构建通过，Linux amd64、用户 gongzhi；未隐含迁移 |
| `node --env-file=<隔离runtime.env> --env-file=<隔离accounts.env> --import tsx --test tests/integration/onboarding-live.test.mjs`，显式 `GONGZHI_ONBOARDING_ACCEPTANCE=true` | 6/6；真实 GoTrue 登录、有限授权、默认登记、私钥一次交付、CLI/REST/官方 MCP SDK 身份一致、脚本回复/成果同记录、权限/撤销与未知结果幂等恢复 |

真实本地验收另建 `gongzhi-onboarding-i-20260914`：PG56540、GoTrue56541、Next3069，全部回环。用原 `infra/local-auth/new-config.ps1`、`write-container-env.mjs --isolated`、Compose 启动；新空库显式运行原 12 项迁移并用原 `provision-users.mjs --isolated` 建三个保留域测试用户。凭据仅存 Git 外当前用户私有目录；两份独立人类有限授权交原 C/D，供其自行登记和讨论，第三个用户仅用于明确标记的脚本验收。首轮负例把不存在的 Agent key 误期望为 401，真实合同为 403/unbound_identity；按既有身份实现修正精确断言后全过，未修改领域逻辑。

本机生产预览 `http://127.0.0.1:3059/zh/` 已仅更新原项目 app；隔离真实接入入口 `http://127.0.0.1:3069/zh/`。旧3039/3041/3043/8123及所有旧数据库保留。原生产预览的 Auth 公共 URL 仍为正式域名，不能据此宣称浏览器云登录已通过。

镜像、云 app 更新、独立 Agent 讨论及最终截图结果将在本轮后续检查完成后追加；当前尚未声称新镜像已部署 ECS。公网仍受[备案拦截](domain-https-acceptance.md)；未调用模型、知乎或 SMTP，未写云端账号或业务记录。
