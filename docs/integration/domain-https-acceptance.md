# 域名 HTTPS 配置验收（2026-09-14）

15:18 UTC 本轮经验共享应用已更新到 ECS 43af 源码（88e7编译基底），四服务 healthy、云端只读验收通过；正常域名仍 HTTP403 / Beaver、HTTPS curl exit35，未恢复公网可用。新增迁移与数据/配置保留证据见[经验共享集成验收](experience-sharing-acceptance.md)。

**以下成功结果属于 08:03–08:05 UTC 的历史检查，当前不能宣称公网可用。** 2026-09-14 16:21 CST 总控复验遇到 HTTP403 / Beaver / Non-compliance ICP Filing 与 HTTPS 握手重置；本轮 I 使用正常域名、标准端口、`curl.exe --noproxy '*'` 再验，仍为 HTTP403 / Beaver 与 TLS 握手失败。ECS 自身 09:15 UTC 正常域名检查得到 308/200，仅代表该请求来源，不能推翻外部拦截事实。DNS、TCP80/443 和原 HTTPS overlay 保留；未使用备用公网端口、IP/主机名、代理或隧道绕过备案控制。

原用户授权正常 DNS、网站 TCP80/443 与原 HTTPS overlay，覆盖此前暂缓公网的记录。ECS 为 `cn-beijing / i-2ze2nztd89vevmw21wif / 47.93.118.110`；本轮更新状态见 [Agent 接入集成验收](onboarding-acceptance.md)，历史证据如下。

## 变更及来源

分支 `integration/gongzhi-mvp` 从 `074d1d07ecea76d3e8ef506a4e5640045db4c052` 开始，普通 `git merge --no-ff edf9cb5efe0c04a7b2c43328408159b23eb115cf` 得到 `0eb7ade243a709ec35c06d6543f5cf2407398b99`。I 只新增本报告；未改生产包或业务源码。运行仍复用 [ECS 部署报告](ecs-deployment-acceptance.md)中的源码 `38c0ff20580cdab5561001697b84b6a76b9d2472`、原 runtime/PG/Auth/Caddy 镜像、凭据与数据卷。

- DNS：先用 `alidns DescribeDomainRecords --DomainName davidwang.space --RRKeyWord zhihu --PageSize 500` 查询全部记录类型，结果 0；Root 的精确子域查询也为 0。权威 NS 为 `dns15.hichina.com`、`dns16.hichina.com`，变更前权威查询为 NXDOMAIN，未替换未知记录。
- 执行 `alidns AddDomainRecord --DomainName davidwang.space --RR zhihu --Type A --Value 47.93.118.110 --TTL 600 --Line default`，记录 ID `2099408084300262400`；回读为唯一 ENABLE A，两个权威 NS 均回答 `47.93.118.110`，Root 公共 DoH 独立核对一致。
- 安全组 `sg-2zeedkqp6urfm9c29ghm` 原为 TCP22、TCP3389、ICMP 入站。本轮仅补 `AuthorizeSecurityGroup --IpProtocol tcp --PortRange 80/80` 与 `443/443`，两者均 `--SourceCidrIp 0.0.0.0/0 --Policy Accept --Priority 100 --NicType intranet`；规则 ID 分别 `sgr-2zeivenvp67mo49ti7n5`、`sgr-2zeedkqp6urfncsq3pg8`。旧规则未修改，没有放行 DB/Auth/app 或 UDP443。
- 首次使用 CLI 帮助列出的 Permissions 数组参数被 API 以 `Illegal parameter serialization format. Flat format is required` 拒绝；回读确认无规则变化后，改用帮助中支持的上述单规则参数分别成功。没有盲重试或重复规则。

## 原包验证与启用

所有 Aliyun 调用使用现有 default profile，并明确 `--RegionId cn-beijing --retry-count 0 --connect-timeout 5 --read-timeout 15 --auto-plugin-install false`。云助手 RunCommand 为 Base64、KeepCommand=false、唯一 ClientToken、有界 timeout，并轮询原 InvokeId；不输出秘密或展开后的 Compose 环境。

| 实际命令 / 检查 | 结果 |
| --- | --- |
| 原 Compose + `compose.https.yaml` 的 `docker compose ... config --quiet`；进程内解析合并 JSON 仅输出端口和 Auth 命令 | `t-bj06x0uh62lbb40` Exit0；仅 proxy TCP80/443 加原 `127.0.0.1:8080`，其他服务无 host ports，Auth 仍 gotrue serve |
| 固定 Caddy 镜像 `docker run --rm --network none -v <原Caddyfile.https>:/etc/caddy/Caddyfile:ro -v <原routes.caddy>:/etc/caddy/routes.caddy:ro ... caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` | 同一 InvokeId，Valid configuration；原 compose/overlay/Caddyfile/routes 四文件与 Git 原字节 SHA256 一致 |
| `docker compose --env-file /etc/gongzhi/production/compose.env -f <源码>/infra/production/compose.yaml -f <源码>/infra/production/compose.https.yaml up -d --no-deps --wait --wait-timeout 90 proxy`，镜像变量沿用原完整源码标签 | `t-bj06x0uncgtv8xs` Exit0；只重建 proxy，新 CID `21e08c1e636f446ece7beb34980d771e1c43b11a3a56aa0c547c54754d3a8019`，原 caddy-data/caddy-config 卷复用；db/Auth/app CID 完全未变且健康，回环 `/healthz` 正常 |
| Caddy 签发状态、ECS 标准 `ssl.create_default_context()` 公共域 TLS/HTTP 检查 | `t-bj06x0usb3hgsn4` Exit0；证书获取成功，真实 DNS 为目标 IP，TLSv1.3、系统信任链及 hostname 验证通过 |
| ECS 无代理 Python urllib、标准证书校验、15 次有界只读 GET | `t-bj06x0uy15zek1s` Exit0，下面全部通过 |

正式证书 CN/SAN 均为 `zhihu.davidwang.space`，issuer 为 **Let's Encrypt / YE2**，有效期 **2026-09-14 07:04:00 UTC 至 2026-12-13 07:03:59 UTC**；原 Caddy 自动证书管理已启用并使用既有持久卷，未采用自签公网证书或 insecure 标志。[Caddy 自动 HTTPS 说明](https://caddyserver.com/docs/automatic-https)

## 实际公开结果与限制

08:03–08:05 UTC：HTTP `/zh` 为 308 且 Location 为同域 HTTPS；HTTPS `/zh`、`/zh/board`、`/zh/connect` 均 200 并含共治页面文本；`/agent-skill.md` 完整正文与既有 Git 单一源一致，仅沿用镜像 CRLF 换行差异。proxy/Auth/Next 三层 health 均 200；config 仅公共字段、Auth URL 为正式域名且 public key 角色 anon，未记录实际 key；board/agent-graph 为真实 live、记录/节点/边均 0。

公开拒绝路径：`/auth/v1/admin/users` 404，`/demo/api/__public_readonly_probe__` 409/mode_mismatch 且无 data，未知真实 API 404，未登录 `/api/gongzhi/runs/__public_readonly_probe__` 401。未制造账号、会话、Agent、授权或业务数据；未执行构建、迁移、全套旧测试，未改变 signup、模型、SMTP 或凭据。

本机 `curl.exe --noproxy '*' --resolve zhihu.davidwang.space:443:47.93.118.110 --connect-timeout 5 --max-time 12 -I https://zhihu.davidwang.space/zh` 正常验证 TLS 后 200；80 同样检查得到 308。此 DNS pin 仅排除本机既有假 IP 解析路径，保持真实 Host/SNI、标准端口与证书验证，没有绕过服务商控制。Root 另以正常域名、UseProxy=false、标准信任的 .NET HttpClient 独立验证页面/API/拒绝路径，及 curl ssl_verify_result=0；没有使用第三方代理、隧道或备用入口。

**备案未完成。** 阿里云官方明确 DNS 可先配置，但中国大陆未备案网站可能无法访问；本次未观察到拦截，不改变这一限制，也未尝试绕过。[阿里云 DNS 与备案说明](https://www.alibabacloud.com/help/en/dns/icp-and-dns) 当前结果仅证明本轮真实 DNS/TLS/页面与只读 API 可达，不代表备案、邮件/密码恢复、真实人类登录、不同 owner Agent 互助、模型或知乎执行已经完成；这些服务配置与验收仍沿此前限制。原本地预览、云端 DB/Auth/app 和回环8080继续保留，无新付费资源、IAM/SSH/防火墙变更。
