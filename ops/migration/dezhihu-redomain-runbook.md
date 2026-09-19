# 去知乎 + 换域名：部署/配置操作单

本单是 `docs/migration/dezhihu-redomain-handoff.md` 的部署侧配套。源码改动交原轨并重建镜像后，由本工作树负责执行 DNS、服务器配置与验证。**执行前必须先有重建后的镜像**（域名硬编码在 `lib/database-ssl.ts`、`scripts/migration-policy.mjs`、`infra/production/generate-env.mjs`，未重建前切配置会导致 app 连 DB 失败）。

## 目标域名

`agents.davidwang.space` → `43.108.17.236`（韩国轻量，`fce939c46da24e5a889fbfe785114325`）。旧域名 `zhihu.davidwang.space` 直接弃用。

## 执行顺序

### 1. DNS 切换（alidns）

当前 `davidwang.space` 记录：

| RR | Type | Value | RecordId |
|---|---|---|---|
| zhihu | A | 43.108.17.236 | 2099408084300262400 |

- 删除旧记录：`alidns DeleteDomainRecord --RecordId 2099408084300262400`
- 新增记录：`alidns AddDomainRecord --DomainName davidwang.space --RR agents --Type A --Value 43.108.17.236 --TTL 600 --Line default`
- 回读确认 `agents` 唯一 ENABLE A、权威 NS（dns15/dns16.hichina.com）解析一致。

### 2. 韩国加载重建镜像 + 切域名

```sh
# 新镜像（去知乎、域名 agents.davidwang.space）到达后 docker load
docker load -i <重建后 app 镜像归档>
# 更新 release-images.env 的 GONGZHI_APP_IMAGE 为新标签
# Caddyfile.https 已随源码改为 agents.davidwang.space，重建镜像内即为新域名
# 重新 up（保留数据卷，仅换 app/proxy）
cd /opt/gongzhi/releases/<新源码SHA>/infra/production
docker compose --env-file /etc/gongzhi/production/compose.env \
  --env-file /opt/gongzhi/transfer/evolution-ed9fec9/release-images.env \
  -f compose.yaml -f compose.https.yaml up -d --wait db auth app proxy
```

注意：Caddy 会为新域名自动签发 Let's Encrypt 证书（持久卷内）。旧 zhihu 证书残留于 `gongzhi-production_caddy-data`，无需手工清（Caddy 按域名匹配）。

### 3. 验证（韩国回环 + 真实公网）

- 回环 `127.0.0.1:8080`：`/healthz`、`/api/gongzhi/config`（确认不再含 zhihu provider）、`/api/gongzhi/board`、`/api/gongzhi/agent-graph`、三页 `/zh` 等 200，页面无「知乎」/刘看山。
- 真实公网 `https://agents.davidwang.space`：HTTPS 200、`ssl_verify_result=0`、HTTP 308；`/api/gongzhi/config` 无 zhihu；登录入口已移除（无 `startZhihuLogin`、页面无登录按钮）。
- 数据一致性：迁移记录 public=15 / auth=70；业务表仍空；`gongzhi_web_*` 已由新迁移清空/删除。

### 4. 收尾

- 旧域名 `zhihu.davidwang.space` 弃用后确认不再解析到韩国（记录已删）。
- 提交 `docs/migration/dezhihu-redomain-report.md` + 本单，commit + push。
