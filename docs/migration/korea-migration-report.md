# 北京 → 韩国共治服务迁移报告（2026-09-15）

本报告记录将运行中的共治应用（app / Auth / PostgreSQL / Caddy）从北京 ECS 迁移到韩国轻量应用服务器、并切换原域名 `zhihu.davidwang.space` 的完整过程与证据。迁移由单一 Agent 持续完成，沿原部署栈，未升级业务、未清库、未释放源机、未切换身份供应商、未新增模型/基础设施费用。

## 参与实例

| 角色 | 产品 | 地域 | 实例 ID | 公网 IP |
| --- | --- | --- | --- | --- |
| 源 | ECS | cn-beijing | i-2ze2nztd89vevmw21wif | 47.93.118.110 |
| 目标 | 轻量应用服务器 | ap-northeast-2 | fce939c46da24e5a889fbfe785114325 | 43.108.17.236 |

两机均为 Ubuntu 24.04 / 4 CPU / 8 GB，迁移全程 Running。Docker 29.1.3、Compose 2.40.3。

## 迁移前核对（两端实时状态）

- 北京四容器 healthy：`gongzhi-production-app-1`、`proxy-1`、`auth-1`、`db-1`。
- 源 app 镜像 `gongzhi:evolution-frontend-ed9fec9`，Image ID `sha256:f7adb3245d2f4439369dc220d1256a507adefe88d59ebb880460ea7f6f0d4801`，大小 362 MB。
- app label：backend `f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4`，frontend `ed9fec9ff9f37139f2b1c1a5d0b4c9da2628b650`，frontend-owner `e4be82f12fdc2d8fed9e5bebfbbc26d210b842e1`。
- 部署基础目录 `/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production`，使用 `compose.yaml` + `compose.https.yaml`。
- release-images.env：`GONGZHI_APP_IMAGE=gongzhi:evolution-frontend-ed9fec9`、`GONGZHI_MIGRATION_IMAGE=gongzhi:oauth-migration-f9a0b33`。
- 韩国已装 Docker/Compose，已拉三个固定基础镜像（pgvector 0.8.6-pg17-bookworm、gotrue v2.196.0、caddy 2.10.2-alpine），无业务容器/卷。
- 韩国已生成专用 ed25519 传输密钥 `transfer_key`（root mode0700 目录内，无口令）。
- 北京私有备份齐全：`app-image.tar.gz`（88 747 202 bytes，SHA256 `265f69af9b64d53b1df27172bb5037da993bf0e8285c379249b33dc1c1991055`）、`deployment.tar.gz`（54 262 bytes，SHA256 `2d05f4d466faeede434c66680be1803ac1d31096c90909c6c6a50499353c7621`）。

## 传输（加密 SSH，严格校验）

北京安全组 `sg-2zeedkqp6urfm9c29ghm` 入站含 TCP22（0.0.0.0/0），韩国可直连北京 22/80/443。

1. 北京云助手为韩国 `transfer_key.pub` 追加一行限时 `restrict` + `command=` 强制只读导出两文件的授权：仅允许 `scp -f` 读 `app-image.tar.gz` 与 `deployment.tar.gz`，其余命令拒绝；`expiry-time="20260915060000Z"`。原始 authorized_keys 先备份为 `authorized_keys.orig.bak`（SHA256 `f19c7260936aee3cc016b99b02604b82e94a471ba50a3750e08793bf3bebca74`，1 行）。
2. 韩国严格 host key pin（北京主机公钥 `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL/KR8GU57vGrX+l3dO3pMoGnsd+rfljHmWWvTVhgIqf`），`scp -O` 拉取两文件。
3. 校验：`deployment.tar.gz` 与 `app-image.tar.gz` 落地 SHA256 与源完全一致。
4. 撤销：北京从备份恢复 authorized_keys 原文件（回读 1 行、SHA256 与原始一致），删除强制命令脚本；韩国删除临时 `transfer_key`、`transfer_key.pub`、`known_hosts_bj`。临时授权无遗留。

## 韩国恢复

- `docker load` app 镜像，Image ID `sha256:f7adb3245d2f4439369dc220d1256a507adefe88d59ebb880460ea7f6f0d4801`，与源一致。
- 解包 `deployment.tar.gz`，恢复：
  - 私有配置 `/etc/gongzhi/production`（mode0700，env 文件 0600；`db-tls/server.key` 0600 且 UID/GID 999；CA/证书 644）。
  - 部署文件 `/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production`。
  - `release-images.env`（与源相同的两个非秘密镜像标签）。
  - Caddy data 卷（`gongzhi-production_caddy-data`）：含 ACME 账号与 `zhihu.davidwang.space` 的 Let's Encrypt 证书（CN=zhihu.davidwang.space，issuer YE2，有效期 2026-09-14 07:04 UTC 至 2026-12-13 07:03:59 UTC）。

## 空库恢复（角色 → 数据，保留迁移记录）

未运行原 `generate-config`（会覆盖身份秘密），未用旧 `/opt/gongzhi/dc`（旧 runtime 标签会导致降级）。顺序：

1. 以精确 pgvector 镜像启动临时空库容器（不挂 `init-db.sh`），仅生成 postgres 超级用户与 `gongzhi` 库。
2. 手动创建角色（与源 `init-db.sh` 一致，密码取自恢复的 `db.env`，不回显）：`supabase_auth_admin`（login/noinherit，search_path=auth,public）、`anon`、`authenticated`、`crier_app`；`revoke create on schema public from public`。
3. `pg_restore --exit-on-error -d gongzhi` 恢复 `gongzhi.dump`（自定义格式，含 auth 与 public 两个 schema、全部表、扩展、数据）。
4. 删除临时恢复容器，用 `compose.yaml + compose.https.yaml` 正式 `up -d --wait db auth app proxy`。

恢复后回读：`public.schema_migrations`=15、`auth.schema_migrations`=70；业务表（owners/needs/links/runs/authorizations/content_approvals/posts/publishers）全 0，`cron_state`=1 行；auth users/sessions、web 四表全 0；schema 所有权 `auth→supabase_auth_admin`、`public→pg_database_owner`；扩展 vector/pg_trgm/pgcrypto/unaccent。**与源实时精确计数逐项一致。**

## 验证（回环 + 真实公网）

回环（韩国 127.0.0.1:8080）：

- 四服务 healthy；`/healthz`=proxy alive；`/auth/v1/health`=GoTrue v2.196.0；`/api/gongzhi/health` 三层 `database_configured=true`、`live_verified=false`。
- `/api/gongzhi/config` 公共白名单；`/api/gongzhi/board` 与 `/api/gongzhi/agent-graph` 真实空集合；三页 `/zh`、`/zh/board`、`/zh/connect` 200 且含「共治」；`/agent-skill.md` 200。
- 拒绝路径：`/auth/v1/admin/users`=404、`/demo/api/__production_readonly_probe__`=409、`/api/gongzhi/runs/__production_readonly_probe__`=401、owners/authorizations/agents/me=401。
- `pg_stat_ssl` 采样确认 `crier_app` 实际 TLSv1.3 连接（app→db verify-full CA 生效）。

真实公网（DNS 切换后，普通解析、标准端口、证书校验）：

- DNS 记录 `zhihu`（RecordId `2099408084300262400`）A 值由 `47.93.118.110` 改为 `43.108.17.236`，TTL600，回读唯一 ENABLE；`demo.zhihu` CNAME 未动。权威 NS（dns15/dns16.hichina.com）与本地解析均回答 `43.108.17.236`。
- HTTPS `/zh`、`/zh/board`、`/zh/connect`、`/api/gongzhi/config`、`/healthz`、`/agent-skill.md` 均 200，`ssl_verify_result=0`；HTTP `/zh` 308 跳 HTTPS。证书为源同款 Let's Encrypt 证书。
- 拒绝路径在公网同样成立（admin 404 / demo 409 / runs 401 / owners 401）。
- 页面 HTML 完整含「共治」文案与 `/community` 资源引用，与源一致。

## 已知差异（非错误）

源**运行中**容器（启动于 19:51Z，早于 06:15 北京将 OAuth 密钥写入 app.env）仍报告 `auth.available=false`；韩国按**磁盘上当前 app.env**（已含 `ZHIHU_OAUTH_APP_ID/KEY/REDIRECT_URI`，非空）报告 `auth.available=true`。两者 app.env 键名完全一致，差异仅因源容器未重启加载新环境变量。迁移忠实复制磁盘配置，属预期行为；真实知乎登录仍未验证（OAuth App ID/Key 与本人官方授权未在本迁移范围确认）。

## 保留与回滚

- 北京原机**未停、未清、未释放**，四容器持续 healthy，作为回滚点。北京 `/root/gongzhi-migration-20260915` 备份（app 镜像归档、部署包、payload 含 dump/globals/CA/证书）与 `/etc/gongzhi/production` 原样保留。
- 回滚 = 将 DNS A 记录改回 `47.93.118.110`（TTL600），北京原栈即重新对外服务。
- 韩国 `/root/gongzhi-migration-20260915` 保留 `app-image.tar.gz`、`deployment.tar.gz` 与解包 payload 供审阅，临时传输密钥已删除。
- 韩国防火墙含 TCP80/443/22 与 ICMP，未新增规则。

## 未执行 / 限制

- 未运行新 schema 迁移、未种子数据、未生成配置覆盖身份秘密、未改 pg_hba/TLS 策略、未启用 signup/SMTP/模型、未发邮件/造账号/执行知乎调用。
- 真实知乎 OAuth 登录、备案、邮件/密码恢复、不同 owner Agent 互助、模型与知乎平台执行不在本次迁移验证范围（沿既有限制）。
- 北京 ICP 备案拦截限制随迁移脱离（韩国无需备案），本报告仅记录真实 DNS/TLS/页面/只读 API 可达，不等于上述未验证项完成。
