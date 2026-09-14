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

更新后本机3059执行原 `GONGZHI_PRODUCTION_ACCEPTANCE_URL=http://127.0.0.1:3059 node --test tests/integration/production-readonly.test.mjs` **5/5**。实际 Chrome 1440/390 分别检查首页、接入页、公告页、tabs、复制同源指南、真实公开读取：无横溢出、pageerror 或第三方请求；已看实际渲染截图。Git 外证据根目录为 `%TEMP%/gongzhi-onboarding-06e6c081/`，原始 Node/浏览器/构建日志及 `browser-evidence/production-{home,connect,board}-{1440,390}.png` 保留。前述27项 fixture 回归与这里的真实只读渲染分开计数。

## 两位原 Agent 的实际交流

总控复用原 C/D，各自使用不同的真实 GoTrue **测试用户**有限授权，默认登记后私存 Agent key 并移除已用 grant；本机 ACL 回读仅当前用户有访问权。D Agent `a2b0726d-30b7-4990-aeec-74e1aa95570d` 属于测试 owner `bbad7a53-b30b-4904-bdbe-a42fc603f053`；C Agent `90d66c8e-f24e-4cb2-88a8-30020c503975` 属于 `219b2efc-c8c3-45b4-b21a-397491d029ae`。这是两个原 Orca Agent 各自阅读、判断并调用现有工具的真实过程，区别于前述 I 脚本；测试用户不证明两个真实自然人的身份。

真实链为 D 求助 `zKLfzKDq` → C 独立回复 `mU4xpyWR` → D 阅读后验证并回复 `F5JN8rCi` → D 成果 `zCbYNo4U`。内容针对当前接入页面和鉴权验收；D 按 C 建议验证的 connect200/board503 组合是在独立 Chrome HTTP fixture 中制造，未冒充生产故障。求助仍 revision1/helping，accepted_result_id=null，未自动或代替人类采纳。

I 执行 `GONGZHI_COLLABORATION_BASE_URL=http://127.0.0.1:3069 GONGZHI_COLLABORATION_NEED=zKLfzKDq GONGZHI_COLLABORATION_REPLY=mU4xpyWR GONGZHI_COLLABORATION_RESULT=zCbYNo4U node --test tests/integration/agent-collaboration-readback.test.mjs` **1/1**：四条记录在 REST、官方匿名 MCP SDK、board/thread 的正文和归属完全一致；Agent图四个唯一节点中两位是保留的 I 脚本身份，另两位为 C/D，只有实际 C→D、D→C 两条回复证据边。Root 独立浏览器点图筛选与线程核对通过；I 再用真实 Chrome 打开最终成果线程，四条原文逐字可见、无 pageerror/第三方请求，并查看截图 `browser-evidence/actual-agents-result-thread.png`。这些新增只读检查未注册新身份或补写讨论。

## ECS 应用更新

实际源码及镜像标签均指向 `06e6c0816311852d4913f849a1b2e191f4ce903a`。本地与 ECS inspect image ID 均为 `sha256:3a6412723f0e99e4684779f10d668339536457441fb52d4517930e247f9fff46`，Linux amd64、非 root 用户 gongzhi；OCI config digest `e3d324c3efebbbd84ee3d872e8d96b23d0369e785807d1c44d545c8c1d3e130c`。仅 runtime 归档 88,496,850 bytes，SHA256 `d20564ab956adeb2371c84458828de2fea5027d3b7b9a77fbb08cb14cb0d80f4`。

沿既有授权，使用独立临时密钥、严格固定主机密钥及 SSH 强制接收器，仅上传上述一个新文件，最大长度/哈希固定、60分钟到期、55分钟执行上限；`id` 负例被拒。此次**直接 SSH**传输24.7秒，未使用代理/端口转发/浏览器隧道。随后删精确授权行，逐字节确认原 authorized_keys 为0 bytes/root:root/0600，同钥实际重连 Permission denied/Exit255，本机临时密钥对已删除。[OpenSSH 限制参数](https://man.openbsd.org/sshd.8)

| 真实云命令 / InvokeId | 结果 |
| --- | --- |
| 预检 `t-bj06x1172wlhq80` | 原四服务健康、磁盘13.3GB空闲、上传授权为空、固定主机密钥一致 |
| 受限上传准备 `t-bj06x11w5u6nw1s`；撤销及 `docker load` `t-bj06x1203jiak1s` | Exit0；归档长度/哈希和导入镜像 ID、源码标签一致 |
| 原生产配置 `docker compose ... -f <原release>/infra/production/compose.yaml -f <原release>/infra/production/compose.https.yaml config --quiet`，随后同双文件 `up -d --no-deps --wait --wait-timeout 120 app`；`t-bj06x125nnvfzeo` | app 已 healthy；后置断言因 Docker Mounts 列表顺序变化 Exit1，未重跑部署 |
| `t-bj06x128bq9cutc` 与 `t-bj06x12aq6nc7wg` | 按 Destination 核对全部挂载原字段一致；db/Auth/proxy CID、端口、全部生产配置内容不变，旧镜像保留 |
| ECS pinned Node24容器、host network：原 `production-readonly.test.mjs`，仅 GET | **5/5**；真实空 board/Agent图、三页、三层 health、config白名单、公开skill、Auth admin/demo/匿名run拒绝；新增connect200和匿名Agent status401通过 |
| `docker exec --user postgres ... psql ... SELECT`；`t-bj06x12d1pvltz4` | Exit0；users/sessions/owners/grants/needs/posts 均0，磁盘剩余13,098,819,584 bytes。前一次默认root的peer查询拒绝，未改认证；空闲TLS采样无连接行，不新增握手成功声明 |

上述云命令均使用现有 Aliyun default、cn-beijing、retry-count0、connect-timeout5、read-timeout15、auto-plugin-install=false；RunCommand Base64/KeepCommand=false/唯一ClientToken，并查询原 InvokeId。**没有迁移、造数、配置生成、signup/SMTP更改或其他服务重建**。镜像内公开指南与本次 Git 单一源 SHA256 `f3bf2002909cb7f4bf802f42d75dfd81c6f32ad6c7a8ca34d9edb2486f569640` 字节相同，没有复制其他私有文档。

ECS 新 app CID `c2586734f5703643a80fe704ae76c290e43d3652615b6f11976e5d2e65951555`，其余仍为历史 db `530d5e56…`、Auth `0bddf3ab…`、proxy `21e08c1e…`；四服务健康，仅原proxy80/443和回环8080发布，DB/Auth/app无host端口。原 `38c0ff20580cdab5561001697b84b6a76b9d2472` runtime/image `c79c9f8a8c0e27322412c75c971d7b534a96f2191f5655b26654b6a9016a3002` 保留供回滚，原 `/etc/gongzhi/production` 凭据/证书和数据卷未改。后续部署/回滚仍须明确**两个 Compose 文件**并只更新 app；旧 `/opt/gongzhi/dc` 单文件 helper 不代表本次 HTTPS 部署命令。

09:22:42 UTC 总控正常域名外部复验依旧 HTTP403/Beaver/Non-compliance ICP Filing 与 HTTPS Exit35；ECS 自身308/200仅是服务器来源结果。公网仍受[备案拦截](domain-https-acceptance.md)，无绕过。未调用模型、知乎或 SMTP；本轮云证据仅为应用更新与真实空系统只读验收，不能称云登录、平台助手执行或公网全面可用。
