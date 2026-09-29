# ECS 主机准备记录（2026-09-14）

源码基线 `b5ac1cd5677e97f331066a96d8ffcf5ef9289be7`，分支 `integration/gongzhi-mvp`；本次仅新增本记录，没有合入 C 的待交付生产配置。目标为 `cn-beijing / i-2ze2nztd89vevmw21wif / 47.93.118.110`，Ubuntu 24.04.4 x86_64。用户最新要求“先不做备案，先做适配”：未启用 `zhihu.davidwang.space` 公共服务，未修改 DNS、安全组、SSH 或无关防火墙规则。

## 已完成与受限项

| 检查 | 实际结果 |
| --- | --- |
| Docker / Compose / Buildx | client/server `29.1.3`；Compose `2.40.3+ds1-0ubuntu1~24.04.1`；Buildx `0.30.1` |
| 安装来源 | 原镜像配置的 Aliyun Ubuntu 镜像站所提供的 Ubuntu 签名发行版包；`docker.io 29.1.3-0ubuntu3~24.04.2`，没有关闭签名或 TLS 校验 |
| 服务与资源 | Docker/containerd 均 active，overlayfs、cgroup v2；最终 0 containers / 0 images，根盘可用 `16484093952` bytes |
| 监听 | 安装后原 SSH 22、回环 DNS 53 保留，containerd 新增回环监听；没有应用、Web 或数据库服务对外监听 |
| Compose 兼容 | `docker compose ... config --format json` 校验 `!override` 后只保留指定回环端口，通过；纯配置渲染未创建资源 |
| 固定源码传输 | GitHub codeload 实际 GET 成功，归档 `5280893` bytes、gzip 校验通过、337 个条目；未解包或执行 |
| Docker Hub | registry/auth 端点连接超时；一次固定 Node 镜像 pull 在 45 秒后退出 `124`，没有成功拉取镜像 |
| 其他官方端点 | `public.ecr.aws/v2/` HEAD 为 HTTP 401，说明端点可达；`mirror.gcr.io/v2/` 连接超时；均未证明所需固定镜像可获取 |

原主机 `/opt`、`/srv` 为空且没有 Docker/Web/DB 服务。正常 Docker bridge/NAT 已获总控明确授权；未扩容、升级整个发行版或开通付费资源。Docker 安装引入 containerd `2.2.1-0ubuntu1~24.04.3` 与 runc `1.3.4-0ubuntu1~24.04.1`，没有启动项目容器。

## 实际命令与终态

使用现有 Aliyun CLI `3.4.11`，先读取 `ecs RunCommand` / `ecs DescribeInvocationResults` 官方 CLI help。每次均显式使用 `--profile default --RegionId cn-beijing --retry-count 0 --connect-timeout 5 --read-timeout 15 --auto-plugin-install false`；UTF-8 LF 脚本以 Base64 传入，`--KeepCommand false --EnableParameter false`，每条实际命令使用唯一 ClientToken，始终轮询原 InvokeId，没有因超时重复安装。没有读取原始 CLI 配置或项目私有环境文件，CommandContent 不含秘密。

| InvokeId | 操作 / 超时上限 | 终态 |
| --- | --- | --- |
| `t-bj06x0o0lmdvny8` | 主机、apt 源及官方端点检查 / 150s | Exit 0；Docker Hub 两端点 curl 28 |
| `t-bj06x0o6xgigu0w` | Docker 官方 apt 源准备及安装 / 600s | Exit 100；apt TLS handshake 失败，Docker CE 无候选包 |
| `t-bj06x0o8m5c5uyo` | 固定 SHA 源码下载与校验 / 90s | Exit 0 |
| `t-bj06x0od19sszcw` | 官方签名索引下载 / 900s | Exit 35；curl connection reset，未进入包下载/安装 |
| `t-bj06x0ok00tuxhc` | 经批准安装 Ubuntu 发行版 Docker / 600s | Exit 0；06:54:06–06:54:13 UTC |
| `t-bj06x0onwnq1udc` | Compose 渲染、一次 Node pull、缓存端点 HEAD / 90s | 整体 Exit 0；内部 Node pull Exit 124，不能记为镜像通过 |

成功安装与确认命令：

```sh
apt-cache policy docker.io docker-compose-v2 docker-buildx
DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get -y --no-install-recommends -o Acquire::Retries=0 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15 install docker.io docker-compose-v2 docker-buildx
systemctl start docker
systemctl is-active docker containerd
docker version
docker compose version
docker buildx version
docker info
df -B1 --output=avail /
```

[Docker 官方 Ubuntu 安装说明](https://docs.docker.com/engine/install/ubuntu/)对应的 vendor 路径发生上述网络失败后，才经总控批准改用现有 Ubuntu 签名包源。已创建的 `/etc/apt/keyrings/docker.asc` 与 `/etc/apt/sources.list.d/docker.sources` 按交接要求保留；Docker 公钥主指纹已核对为 `9DC858229FC7DD38854AE2D88D81803C0EBFCD88`。临时安装启动策略 `/usr/sbin/policy-rc.d` 已移除并确认不存在。保留的主机安装日志为 `/tmp/gongzhi-I-docker-install-20260914-0649.log`、`/tmp/gongzhi-I-ubuntu-docker-install-20260914-0654.log`；失败的索引尝试目录 `/tmp/gongzhi-I-docker-debs-20260914-0651` 未删除。

源码下载地址为 `https://codeload.github.com/songconmaisaix31-design/Community-of-agents/tar.gz/b5ac1cd5677e97f331066a96d8ffcf5ef9289be7`，ECS 保留文件 `/tmp/gongzhi-source-b5ac1cd5677e97f331066a96d8ffcf5ef9289be7.tar.gz`，SHA-256 `23d2536838224c49f6f8095f53ac099d04d0a728408d6d614e16862cc579fbe6`。实际检查采用有界、无重试的 curl 下载、`gzip -t`、`sha256sum` 和 `tar -tzf` 查看归档。

镜像实测为 `timeout --signal=TERM --kill-after=5s 45s docker pull node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81`；输出留于 `/tmp/gongzhi-I-node-pull-20260914-0655.log`。既有 `pgvector/pgvector:0.8.6-pg17-bookworm` 与 `supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232` 尚未在此主机拉取；未变更这些引用，也未将其他 registry 的可达性当作镜像替代验证。

## 下一步与未执行项

按总控最新指示，结束本轮有界传输检查，后续接收 C 已提交的生产包，在独立后续任务中集成并做本地 Linux Docker 验证；镜像传输限制不阻塞代码适配。Workbench 仅只读官方说明和安装脚本文本，未下载/安装二进制、认证、连接或上传，暂不继续。未执行应用构建、部署、数据库迁移、账号/授权/Agent/业务数据写入、模型或知乎请求；未接触本机原容器、数据库及预览。源码下载与主机 Docker 可用仅是准备证据，不代表平台端到端或公网部署成功。
