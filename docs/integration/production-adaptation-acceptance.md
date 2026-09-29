# 生产适配本地验收（2026-09-14）

结论：生产包在全新本地 Linux/Docker 资源上通过显式迁移、真实 TLS、代理与空库只读验收；**不是 ECS 部署或公网验收**。保留入口 <http://127.0.0.1:3059/zh>。既有 3039/3041/3043、其他预览与数据库未修改；本轮没有云端、DNS、安全组、Workbench 或 registry 配置变更。

## 源码与镜像

在 `integration/gongzhi-mvp` 从 `0919c70faad551808daafb164bb9ddd35b544364` 顺序执行普通 `git merge --no-ff`：Core `1f2101273b88b7dce298682eded980fa4c784639`，再 M `8d946fbe0761959511b7d606a3243a61b5390f2e`。合并源码 `38c0ff20580cdab5561001697b84b6a76b9d2472` 已先行 push；后续本验收提交仅新增 integration 测试和文档，运行镜像仍明确对应此源码。

| 镜像 | 本地 Image ID（SHA-256） |
| --- | --- |
| `gongzhi-production-i:runtime-38c0ff20580cdab5561001697b84b6a76b9d2472` | `c79c9f8a8c0e27322412c75c971d7b534a96f2191f5655b26654b6a9016a3002` |
| `gongzhi-production-i:migration-38c0ff20580cdab5561001697b84b6a76b9d2472` | `0a955dfaacda2b523221cdf24f6602b43486ca5cb6bfb5b81633daf31bcda268` |

两镜像均带 `org.opencontainers.image.revision=38c0ff20580cdab5561001697b84b6a76b9d2472`，分别以 `gongzhi` / `node` 非 root 用户运行。PG17 pgvector、GoTrue、Caddy 使用原 Compose 固定 digest，未更换镜像版本或依赖。构建在 Docker Desktop Linux 引擎 `29.5.3`、Compose `5.1.4` 上执行，来自 `git archive` 精确源码快照；构建中的 Node 为 `24.21.0`。

## 执行与结果

| 实际命令 / 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `GONGZHI_COMPOSE_TEST=true npm test` | 159 pass / 0 fail / 9 skip；包含生产默认/HTTPS overlay 的纯配置渲染，未启用 HTTPS 服务 |
| `docker build --target runtime --label org.opencontainers.image.revision=<上述源码> -t <上述runtime标签> <源码快照>` | 通过，内部执行 `npm run build`，没有迁移 |
| 同一命令替换为 `--target migration` 和上述 migration 标签 | 通过，没有迁移 |
| 原 `generate-config.sh` 与 `generate-env.mjs` | 仅在 Git 外脚本副本替换 `/etc/gongzhi` 为隔离目录；其余生成逻辑原样执行，随机凭据不回显 |
| `dc config --quiet`；`dc up -d --wait --wait-timeout 120 db` | 通过；新库启动后 public/auth 表数均为 0，bootstrap 只建立角色/schema/extensions |
| `dc run --rm -T --no-deps migrate` | 退出非零，明确拒绝缺少生产目标确认 |
| `dc run --rm -T --no-deps auth gotrue migrate` | 官方 Auth 迁移通过；未创建用户 |
| `dc run --rm -T --no-deps -e GONGZHI_PRODUCTION_MIGRATION=zhihu.davidwang.space migrate node scripts/migrate.mjs --production-target=zhihu.davidwang.space` | 12/12 业务迁移成功；重复完全相同命令报告 all 12 already recorded |
| `dc up -d --wait --wait-timeout 150 auth app proxy` | 四个服务 running/healthy；Auth 原命令为 `gotrue serve` |
| `GONGZHI_PRODUCTION_ACCEPTANCE_URL=http://127.0.0.1:3059 node --test tests/integration/production-readonly.test.mjs` | 5/5，通过三层 health、公共配置白名单、真实空公告/Agent 图、三页与单一源 skill、Auth admin/示例逃逸拒绝；全部 GET |

`dc` 是 Git 外普通 Compose 命令缩写：`docker compose --env-file <私有目录>/production/compose.env --project-name gongzhi-prod-i-38c0ff2 -f <精确源码>/infra/production/compose.yaml -f <私有目录>/loopback.override.yaml`，显式设置两个镜像标签与 `GONGZHI_PRODUCTION_SECRETS`。override 仅将 proxy 发布端口改为 `127.0.0.1:3059:8080`，没有领域修补。9 个跳过项为未接入旧真实环境的 4 个 Core 套件及 5 个既有 HTTP/写入测试，本轮用上述新隔离环境验收，不重放旧开户/采纳/业务造数脚本。

## TLS、网络和空数据证据

- 原生成器产生真实 CA 和 `DNS:db` 证书；`openssl verify -CAfile ... -verify_hostname db ...` 通过。原生 Linux 私有目录 mode0700，env mode0600 root-owned，DB leaf key 为 UID/GID999、mode0600；PG 实际 postgres 用户 UID999，peer bootstrap 成功。
- 用另一张临时 CA 覆盖迁移容器同一 CA 挂载后，显式迁移因证书链验证失败而拒绝。相同错 CA 的独立 Next 临时容器请求真实 board 返回 HTTP500、`upstream_failed`、`mode=live` 且无 `data`；临时容器随后按精确名称停止并移除，正常应用不受影响。
- 实际 PG TCP `sslmode=disable` 被 HBA 以 no encryption 拒绝；`host=wrong.invalid hostaddr=127.0.0.1 sslmode=verify-full` 配正确 CA 时被证书主机名校验拒绝。
- 在实际空 board 和官方 GoTrue 内部 `/admin/users` 的有界 GET 期间采样 `pg_stat_ssl`，捕获 `crier_app`、`supabase_auth_admin` 均为 `ssl=true / TLSv1.3 / 256 bits`。内部管理员只读使用本次原生成器的 operator API key，未签造用户会话；该文件只短暂挂载 root 检查容器，未挂入正常 app/Auth。空闲连接快速回收，因此事后空采样不替代此请求期间证据。
- app、Auth 对 `https://example.com` 的普通 HTTPS 请求分别以 Node fetch HTTP200、wget Exit0 通过；未请求模型或知乎。DB 仅 internal backend，app/Auth 具 edge 出站；DB/Auth/app 均无 host port binding，只有 proxy 的 3059 绑定 127.0.0.1。
- 最后 SELECT-only 核对：Auth users/sessions、gongzhi owners/authorizations/needs/posts/links/runs 全为 0，业务 migration ledger 为 12。公告和 Agent 图真实空集合，不是 fixture；迁移自带的 cron 元数据不属于测试造数。

## 保留资源与限制

隔离资源为 WSL Ubuntu `/var/lib/gongzhi-integration-38c0ff2`，项目 `gongzhi-prod-i-38c0ff2`，容器后缀 `db-1`、`auth-1`、`app-1`、`proxy-1`；项目 pg-data/caddy-data/caddy-config 卷均独立。私有配置在该 root-only 目录的 `production` 下，迁移/负例日志经连接串与 token 脱敏后保留在目录中；测试 shell 命令在本机 TEMP 的 `gongzhi-i-*-38c0ff2.sh`，均不含凭据值。按总控要求保留健康栈供审阅，不执行 down、prune 或旧库清理。

测试接线曾将 GET 用于仅支持 POST 的 `/runs`，按真实路由改为 GET `/runs/<id>` 后验证未登录 401；TLS 采样辅助容器首次被 root-only operator 文件权限正确拒绝，之后仅以 root 运行检查容器，未放宽文件或正常服务权限。没有生产领域代码返修。

助手与遥测关闭。浏览器 Auth 公开配置仍指向未来 `https://zhihu.davidwang.space`，故本地页面可读取不代表该域登录可用；SMTP、邮件/找回密码、真实人类身份、不同 owner 的 Agent 互助、模型与知乎平台执行、公网 TLS/备案和 ECS 部署均未在本轮验收。后续公开启用仍需用户授权及对应配置；不以健康响应、空库或现有 fixture 替代这些证据。
