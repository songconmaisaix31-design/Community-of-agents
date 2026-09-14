# ECS 实际部署验收（2026-09-14）

**已在指定 ECS 部署四个健康服务，入口仅为服务器本机 `http://127.0.0.1:8080/zh`。** 目标 `cn-beijing / i-2ze2nztd89vevmw21wif / 47.93.118.110`；不是本机 3059，也没有开放公网网站或浏览器隧道。本轮未改 DNS、安全组、IAM、sshd、防火墙或付费资源；旧本地预览与数据库保留。

## 来源和镜像

分支 `integration/gongzhi-mvp` 从 `83f2fd57a5063f42e744b63a6830f8d21a12393e` 继续，普通 `git merge --no-ff 3535b5c698f7f4268674cdf9f4e163fe5598a405` 得到管理合并 `aa96b4a0f7f46a36dfcedc56ca2196e7f5da59a4`。本轮 I 只新增本报告；不改生产包或业务代码。

运行与迁移镜像均复用已验收源码 `38c0ff20580cdab5561001697b84b6a76b9d2472`；标签分别为 `gongzhi-production-i:runtime-<完整源码SHA>` 和 `gongzhi-production-i:migration-<完整源码SHA>`，OCI revision 同此 SHA。ECS 六镜像均 linux/amd64，逐项比对导入前后 Image ID，四个官方 digest 引用均可本地解析，无重新拉取或替换版本。

| 镜像 | ECS Image ID，均为 sha256 |
| --- | --- |
| runtime（默认用户 gongzhi） | `c79c9f8a8c0e27322412c75c971d7b534a96f2191f5655b26654b6a9016a3002` |
| migration（默认用户 node） | `0a955dfaacda2b523221cdf24f6602b43486ca5cb6bfb5b81633daf31bcda268` |
| pgvector/pgvector:0.8.6-pg17-bookworm | `cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f` |
| supabase/gotrue:v2.196.0 | `c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232` |
| caddy:2.10.2-alpine | `4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` |
| node:24-alpine（24.21.0） | `50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81` |

GitHub codeload 固定源码解包在 `/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472`；源码归档 5296559 bytes，SHA256 `89cee8a2984a5a6ffcc7a2f719da9977beef6b13a239df1b27866042e4c1bdb9`。六镜像 `docker save ... | gzip -1` 归档 657246733 bytes，SHA256 `5922a40f8cdddab35f6feda2f13d68f512436fb5701b9807b6b9296aec2a494b`，在 ECS 重算一致后 `docker load` 成功。

## 传输与授权收回

Docker Hub 普通连接超时；独立解析后 `curl --resolve` 保留证书校验仍 TLS reset，未改 DNS/TLS。官方 `ali-instance-cli 1.1.0.86` 实际返回 `session manager is disabled`，未擅自开启；[官方端口转发说明](https://help.aliyun.com/zh/ecs/user-guide/perform-port-forwarding-by-using-ali-instance-cli)仅为方案依据。

经总控明确批准，使用现有 SSH 22 进行限时单文件上传：唯一公钥设置 `restrict`、60 分钟 UTC expiry、强制接收命令；接收器限定新文件、大小、SHA256 和 55 分钟超时，拒绝其他命令。通过云助手独立取得主机公钥后严格校验，SSH 经既有系统 HTTP CONNECT 代理传输，未更改代理或 sshd。[OpenSSH 约束依据](https://man.openbsd.org/sshd.8)

上传实耗 182.8 秒。成功后立即删除唯一授权行，逐字节核对原 authorized_keys，恢复原 root:root/mode0600/0 bytes；同钥实际再连返回 Permission denied/Exit255，本机专用私钥与公钥已删除。没有通用 SSH 会话或转发遗留。

## ECS 实际命令与结果

云助手均用现有 default profile、`--RegionId cn-beijing --retry-count 0 --connect-timeout 5 --read-timeout 15 --auto-plugin-install false`。RunCommand 使用 Base64、KeepCommand=false、唯一 ClientToken、有界 timeout，并以原 InvokeId 查询；命令和输出不含秘密。下列 `dc` 为服务器 `/opt/gongzhi/dc` 的普通 Compose 缩写，读取 `/etc/gongzhi/production/compose.env`、原 `infra/production/compose.yaml` 与上表两个应用镜像标签。

| 实际操作 | 结果 / InvokeId |
| --- | --- |
| 主机、网络、固定源码、原 SSH 元数据与受限接收器检查 | `t-bj06x0qpqayeqkg`、`t-bj06x0quqiu6ps0`、`t-bj06x0qxpyjyjgg`、`t-bj06x0r3gb6hr7k`、`t-bj06x0rutu5akn4`、`t-bj06x0s1018n400`；网络失败如上，原部署路径/镜像/容器均为空 |
| 授权撤销、归档重算、docker load | `t-bj06x0srjqp2j28`；全部完成，后续 inspect 的可选 User 字段格式错误导致整体 Exit1，未重传或重复导入 |
| 六镜像/四 digest 与源码核对 | `t-bj06x0syvho40lc`；镜像全一致，Dockerfile 校验因误用 Windows CRLF hash 停止；改用 `git show <源码>:Dockerfile` 原始 Buffer 的 SHA256 `5cc64cbc81e18117f025edefc35cbd1725bcb97e9a3fa5a233ef151608813188` 后通过，服务器文件未修改 |
| 原 `sh infra/production/generate-config.sh`；`dc config --quiet`；`dc up -d --wait --wait-timeout 120 db` | `t-bj06x0tak8xvocg` Exit0；服务器首次生成随机配置，public/auth 初始表数均 0，CA 与 DNS:db 证书验证通过 |
| `dc run --rm -T --no-deps migrate node scripts/migrate.mjs` | `t-bj06x0tcoz63h8g` 中明确拒绝缺少生产目标，Exit1 |
| `dc run --rm -T --no-deps auth gotrue migrate` | 同一 InvokeId，官方 Auth 显式迁移 Exit0 |
| `dc run --rm -T --no-deps -e GONGZHI_PRODUCTION_MIGRATION=zhihu.davidwang.space migrate node scripts/migrate.mjs --production-target=zhihu.davidwang.space`，随后原命令再执行一次 | 同一 InvokeId，12/12 成功；重复报告 all 12 already recorded |
| `dc up -d --wait --wait-timeout 150 auth app proxy` | 同一 InvokeId 最终 Exit0；四服务 healthy，Auth 使用 gotrue serve |
| `GONGZHI_PRODUCTION_ACCEPTANCE_URL=http://127.0.0.1:8080 node --test /checks/tests/integration/production-readonly.test.mjs`（ECS pinned Node 容器、host 网络） | `t-bj06x0tnjd3bfuo` 中 **5 pass / 0 fail / 0 skip**；三层 health、config 白名单、真实空 board/Agent graph、三页/skill、admin/demo/未登录拒绝，全为 GET |
| 实际 app board / GoTrue 内部 admin/users 有界 GET 期间采样 pg_stat_ssl | `t-bj06x0tp76z998g` Exit0；crier_app 与 supabase_auth_admin 均 ssl=true/TLSv1.3/256 bits，用户与记录仍为 0 |
| 错 CA 迁移、PG 明文 TCP、正确 CA 配错误 hostname；独立错 CA Next 请求 board；最终 SQL/权限/端口检查 | `t-bj06x0ts5j0nfgg` Exit0；证书链、no encryption、hostname 均拒绝，错 CA Next 为 HTTP500/upstream_failed/live 且无 data；临时 Next 容器已按创建 ID 移除 |
| Root 独立只读复验 | `t-bj06x0tifko9k3k` Exit0；四服务、镜像、回环端口、页面/API/拒绝、迁移计数、Auth 空集合与 SSH 授权恢复一致 |

检查接线的失败均留痕：`t-bj06x0tha6ju9s0` 因只读父挂载内缺少文件挂载点未启动测试；补空挂载点后 `t-bj06x0tjxmgobuo` 为 4/5，发现公开指南换行差异。最终保持测试代码不变，验证 HTTP 与镜像内部指南**字节一致**，另完整核对其 CRLF 转 LF 后与 Git 源一致：镜像 15641 bytes、Git 15516 bytes，仅 125 个换行差异。`t-bj06x0tnjd3bfuo` 后续负例原因断言只认可另一种证书链错误码而 Exit1；实际错误为 UNABLE_TO_VERIFY_LEAF_SIGNATURE，后续核对原日志并确认真实 TLS 拒绝，没有修改 TLS 策略或领域代码。

## 保留状态与限制

07:52:42 UTC 核对：Docker29.1.3、Compose2.40.3，Docker active/enabled；项目 `gongzhi-production` 的 db/auth/app/proxy 四服务 healthy，仅 proxy 发布 `127.0.0.1:8080`，其余无 host ports。磁盘剩余 13330022400 bytes。Auth users/sessions、owners、authorizations、needs、posts、links、runs 共八项计数全部 0，业务迁移 ledger=12；未复制旧数据或制造用户/会话/Agent/讨论。

凭据由原生成器只在 ECS `/etc/gongzhi/production` 创建：目录0700、env0600/root、DB key0600/UID:GID999；CA 私钥与 operator 文件不挂入正常服务。TLS 检查仅在短时 root 检查容器读取新生成 operator API key 发内部只读 GET，不生成用户会话。源包、镜像包及脱敏检查日志留在服务器 root-only `/opt/gongzhi/transfer`；项目 pg-data/caddy-data/caddy-config 卷与四服务保持运行。无凭据进入 Git、云命令内容或回执。

本轮复用[上一轮本地构建与适用套件结果](production-adaptation-acceptance.md)，未重复 typecheck/npm test/build，也不把历史结果计作新的云测试。实际云端入口已由云助手验证；官方会话通道因账号未启用而不可用，未扩大授权创建浏览器隧道。用户电脑上的 127.0.0.1:8080 不代表该 ECS，原本机 3059 继续独立保留。

公网 HTTPS/备案/域名访问尚未启用；浏览器 Auth 公共配置仍指向未来域名，因此不宣称真实人类登录可用。SMTP、邮件/找回密码、不同 owner 的 Agent 互助、模型与知乎平台执行均未做；助手与遥测关闭，没有模型/知乎/SMTP 请求。本轮完成的是实际 ECS 回环部署及空系统服务验收，不是公网产品端到端上线。
