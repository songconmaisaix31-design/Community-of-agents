# 北京共治服务迁移到韩国：完整所有权交接

## 用户目标与工作方式

用户要求使用阿里云 CLI 将现有服务器服务迁移到韩国，说明两台服务器分别在国内北京和国外，最后明确要求交给 OpenCode 的 DeepSeekV。本机可用模型为 `deepseek/deepseek-v4-pro`，本终端以此启动。你接管本任务；发送者交接后停止操作服务器，不监督等待你的最终结果。

任务按已经查明的部署范围继续：北京正在运行的共治应用、Auth、PostgreSQL、Caddy 及配置/数据迁到已有韩国服务器，验证后切换原域名。不要仅报告找到了服务器。保留北京原机与回滚能力，不擅自释放实例、清库、升级业务代码、切换身份供应商或新增模型/基础设施费用。用户未明确停机时长要求；先完成可审阅的预迁移和验证，有真实无法推断的阻塞再问。

一个 Agent 持续完成迁移、验证与文档。先做一页计划。write_paths 为本工作树 `HANDOFF.md`、`docs/migration/**`、`ops/migration/**`；其他已有开发工作树只读，不能覆盖。允许在明确的两台用户服务器上完成本迁移必要操作；配置、备份、私钥仅保留于服务器 root 私有路径，不写 Git、云命令输出或对话。适用检查通过后 commit + push；不 force push。最终只汇报完成内容、分支/SHA、验证命令结果、真实限制和未执行操作。

## Git 与现有代码

- 本工作树：`C:/Users/DW/orca/workspaces/Community-of-agents/gongzhi-korea-migration-deepseek`
- 本分支：`songconmaisaix31-design/gongzhi-korea-migration-deepseek`
- 从 origin/main 初始提交 `5a8c2405f8e5a2b1ccd78aca7406d8fa04f6a866` 独立创建。因此这里原先只有 LICENSE，不能把它误当已部署源码。
- 原主目录 `C:/Users/DW/orca/Community-of-agents` 有大量未跟踪的旧静态站点文件，完整保留，不添加/删除/覆盖。
- 真实开发集成工作树只读参考：`C:/Users/DW/orca/workspaces/Community-of-agents/gongzhi-integration`，分支 `integration/gongzhi-mvp`，本次观察 HEAD `c744404a0ac73b72deaf4408a1ce3668b5a099b9`。
- 先读其中 `AGENTS.md`、`docs/core/production-deployment.md`、`docs/integration/ecs-deployment-acceptance.md`、`docs/integration/domain-https-acceptance.md`、`docs/integration/ssh-access.md`、`tests/integration/production-readonly.test.mjs`。旧仅本地/不部署限制被用户本轮显式迁移授权覆盖；领域文件所有权与秘密保护继续遵守。
- 不能直接把集成 HEAD 部署上去，当前线上运行镜像比历史基础部署有后续覆盖，迁移需保持实际镜像/数据，不夹带升级。

## 访问工具与实例（均经真实接口核对）

PowerShell 下阿里 CLI：`C:/Users/DW/aliyun-cli/aliyun.exe`，版本 3.4.11；现有 default profile、AK 模式，默认地域 cn-hangzhou，STS 返回账号尾号 9449、Account 身份。继续使用现有配置，不输出凭据。显式同时指定业务地域与 CLI endpoint 地域。

| 角色 | 产品 | 地域 | 实例 ID | 公网 IP |
| --- | --- | --- | --- | --- |
| 源 | ECS | cn-beijing | i-2ze2nztd89vevmw21wif | 47.93.118.110 |
| 目标 | 轻量应用服务器 | ap-northeast-2 | fce939c46da24e5a889fbfe785114325 | 43.108.17.236 |

两台 Running，Ubuntu 24.04，4 CPU / 8 GB。北京根盘20 GB，约9.9 GB可用；韩国根盘69 GB，初查约63 GB可用，安装Docker和拉取镜像后需重查。韩国名称 Ubuntu-mhgc。

**查询陷阱纠正**：ECS `DescribeInstances --MaxResults 100` 曾返回 `TotalCount:0` 但 `Instances.Instance` 内有北京实例。不能用 TotalCount 判断无实例；检查实际数组和 NextToken。此前“32地域均无ECS”的报告错误，已向用户纠正。北京精确查询同时指定 `--RegionId cn-beijing --region cn-beijing` 得到实例。

轻量API原内置元数据缺失，已成功安装官方 `aliyun-cli-swas-open 0.9.1` 插件，不需重复安装。命令改用 kebab-case：

```powershell
& 'C:/Users/DW/aliyun-cli/aliyun.exe' swas-open list-instances --biz-region-id ap-northeast-2 --region ap-northeast-2 --page-size 100
& 'C:/Users/DW/aliyun-cli/aliyun.exe' swas-open run-command --help
& 'C:/Users/DW/aliyun-cli/aliyun.exe' swas-open describe-invocation-result --help
```

源端运行：`ecs RunCommand --RegionId cn-beijing --region cn-beijing --InstanceId.1 i-2ze2nztd89vevmw21wif --Type RunShellScript --ContentEncoding PlainText --CommandContent <脚本字符串> --Timeout <秒> --Name <名称> --KeepCommand false --connect-timeout 10 --read-timeout 20 --retry-count 0`。可按帮助采用Base64与唯一ClientToken。不要重发已接受的异步命令；查询同一 InvokeId。

源端结果：`ecs DescribeInvocationResults --RegionId cn-beijing --region cn-beijing --InstanceId i-2ze2nztd89vevmw21wif --InvokeId <ID> --ContentEncoding PlainText`，读取 `Invocation.InvocationResults.InvocationResult` 中状态/ExitCode/Output。

目标运行：`swas-open run-command --biz-region-id ap-northeast-2 --region ap-northeast-2 --instance-id fce939c46da24e5a889fbfe785114325 --type RunShellScript --command-content <明文脚本字符串> --timeout <秒> --name <名称>`。

目标结果：`swas-open describe-invocation-result --biz-region-id ap-northeast-2 --region ap-northeast-2 --instance-id fce939c46da24e5a889fbfe785114325 --invoke-id <ID>`，`InvocationResult.Output` 是 Base64，用 `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(...))` 解码。结果可能大量日志，请筛选状态和首尾，勿输出秘密。

两端云助手可用，已经真实运行命令。使用正常云CLI、SSH与HTTPS，不绕过权限/认证/证书校验。PowerShell多行脚本用单引号here-string，避免本机展开远程 `$` 或命令替换。

## 北京线上实际状态

- 域名：`zhihu.davidwang.space`，Caddy HTTPS配置内明确此域名。
- 四容器：`gongzhi-production-app-1`、`gongzhi-production-proxy-1`、`gongzhi-production-auth-1`、`gongzhi-production-db-1`，查验均 healthy。
- 实际 app 镜像 `gongzhi:evolution-frontend-ed9fec9`，Image ID `sha256:f7adb3245d2f4439369dc220d1256a507adefe88d59ebb880460ea7f6f0d4801`，大小362 MB。
- app label：backend `f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4`，frontend `ed9fec9ff9f37139f2b1c1a5d0b4c9da2628b650`，frontend-owner `e4be82f12fdc2d8fed9e5bebfbbc26d210b842e1`。
- 部署基础目录 `/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production`，实际使用 compose.yaml + compose.https.yaml。
- app Compose env文件还包括 `/opt/gongzhi/transfer/evolution-ed9fec9/release-images.env`。`/opt/gongzhi/dc` 包含旧runtime标签，**不要直接用它重建app导致降级**。
- 私有配置在 `/etc/gongzhi/production`：app.env/auth.env/db.env/migration.env/operator.env/compose.env、db-tls、CA相关文件等；不能打印这些文件或 docker 环境/展开的Compose配置。
- 三命名卷 `gongzhi-production_pg-data`、`gongzhi-production_caddy-data`、`gongzhi-production_caddy-config`。DB/Auth/app 无宿主机发布端口；proxy 80/443公开、8080仅127.0.0.1。
- PostgreSQL数据库 gongzhi约11351731 bytes（约11 MB）；另有postgres系统库。实际 SELECT 元数据：业务迁移15、Auth迁移70、cron_state一行；用户、会话、业务表 n_live_tup 均0（这是估算统计，最终需精确count与一致性验证）。
- 数据库TLS必须保持，CA客户端verify-full，DB证书DNS:db；源 pg_hba 仅 postgres Unix socket peer、TLS SCRAM业务连接，拒绝明文和其他连接。不要改变这些策略。
- 原部署已启用公开HTTPS。历史文档记录北京公网有ICP拦截；本任务为正常迁移到韩国，不用隧道/备用端口伪装成公网验收。
- 历史域名记录ID `2099408084300262400`，A=47.93.118.110，TTL600（仅文档记录，尚未本轮回读；DNS切换前必须实时验证现值、唯一性和目标）。

## 已完成的实际变更（尚未迁移上线）

1. 本机安装了上述阿里轻量插件。
2. 韩国运行 `apt-get update -qq; apt-get install -y docker.io docker-compose-v2; systemctl enable --now docker` 成功：Docker29.1.3、Compose2.40.3。执行前确认 /etc/gongzhi/production、/opt/gongzhi 均不存在，未发现旧应用服务。
3. 韩国新建 root mode0700 `/root/gongzhi-migration-20260915`，生成仅用于本迁移的无口令ed25519密钥 `transfer_key` 与 `.pub`。私钥只在韩国，不读取/输出。公钥如下，**目前未添加至北京authorized_keys，不能假定SSH已可用**：

   `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO7kH/oaqmnF8RNdBuPNZQ8Oj6/BodJTi5UGgpaqcJwz gongzhi-korea-migration-20260915`

4. 韩国拉取三个与北京一致的固定官方镜像成功（无业务容器/卷启动）：
   - `pgvector/pgvector:0.8.6-pg17-bookworm@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f`
   - `supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232`
   - `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`
5. 北京新建 root mode0700 `/root/gongzhi-migration-20260915`，umask077，生成：
   - `app-image-id.txt` 当前真实镜像ID；制作前已断言与上面ID相同。
   - `app-image.tar.gz` = `docker save gongzhi:evolution-frontend-ed9fec9 | gzip -1`，88747202 bytes，SHA256 `265f69af9b64d53b1df27172bb5037da993bf0e8285c379249b33dc1c1991055`。
   - `payload/infra` = 当前基础部署infra/production原文件。
   - `payload/private-config` = `cp -a /etc/gongzhi/production`，含秘密，严格私有。
   - `payload/gongzhi.dump` = `docker exec -u postgres gongzhi-production-db-1 pg_dump -Fc -d gongzhi`，在线一致性逻辑备份。
   - `payload/globals.sql` = `pg_dumpall --globals-only`，含角色密码hash，严格私有。
   - `payload/caddy-data.tar.gz` = 源Caddy data卷备份，含证书私钥，严格私有。
   - `deployment.tar.gz` 打包整个payload，54262 bytes，SHA256 `2d05f4d466faeede434c66680be1803ac1d31096c90909c6c6a50499353c7621`。后续新备份不要悄悄覆盖此初始证据，明确时间与新文件即可。

北京主机公钥经阿里云助手可信通道读取，供严格SSH host key pin，不使用StrictHostKeyChecking=no：

`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL/KR8GU57vGrX+l3dO3pMoGnsd+rfljHmWWvTVhgIqf root@iZ2ze2nztd89vevmw21wifZ`

以上备份、安装、拉镜像均完成并以结果Exit0确认，无待运行的原agent后台云命令。**尚未传输文件、在韩国恢复数据或启动共治、改DNS/防火墙、修改北京SSH授权或停止北京服务。**

## 证据 InvokeId

- 北京初始只读探针 `t-bj06x3c0cweecqo`，韩国 `t-kor6x3c0i8kwydc`。
- 北京部署布局 `t-bj06x3c2sofxslc`，部署文档 `t-bj06x3c4wuwgv7k`。
- 北京数据库/当前镜像 `t-bj06x3c87cn2ccg`，韩国准备前检查 `t-kor6x3c8cwirocg`。
- 韩国安装Docker及生成传输密钥 `t-kor6x3cbeoq43r4`：Success/Exit0。
- 北京打包备份 `t-bj06x3cdsh2qnls`：Finished/Exit0。
- 韩国三个镜像拉取 `t-kor6x3cei7mwr9c`：Success/Exit0，交接前已回读确认。

## 下一步建议（尚未执行，需你设计并验证）

1. 重新核对两端现状/源app镜像和数据，防止另一开发轨在交接期间更新；不要清理不认识的文件、卷或authorized_keys条目。
2. 使用加密且严格验证对端的传输，把88.7 MB app镜像及54 KB私有部署包送韩国。韩国已有专用key，可通过云助手为北京追加限时、restrict、强制只读导出特定迁移文件的唯一公钥行；传输后撤销自己新增的行并验证旧授权保留。该方案尚未实现。北京带宽1 Mbps可能需要十几分钟，不能把仍在复制判成成功；不要公开HTTP下载含秘密的包。
3. 恢复目标私有配置/CA、部署文件和Caddy证书，保持权限/UID。用精确app image与固定三基础镜像；不要调用原generate-config覆盖身份秘密，不用旧dc降级。
4. 设计目标空库恢复：源dump含Auth与业务schema，原init-db仅创建角色/schema/extensions；pg_dumpall globals含已存在postgres/业务角色，直接执行会冲突，不能忽略任意SQL错误当成功。先明确目标空库、角色与所有权恢复顺序，保留15/70迁移记录，不运行新schema迁移、不自动种子数据。禁止把生产备份恢复到源库。
5. 在韩国回环验证四服务、数据库精确计数/关键数据一致、实际TLS连接、原页面/API/鉴权拒绝与镜像身份。复用原production-readonly测试，注意其新空库和OAuth可用性前提，不能用fixture宣称上线。
6. 切换前处理源后续写入与最终备份的一致性，明确停机/回滚步骤；必要时短暂停止源业务写入口，保留源DB/机器。核对真实DNS记录、韩国仅正常80/443需要的防火墙，然后切换原域名并验证真实公网TLS/域名/页面/API。未验证不得宣称完成；不要为验证发邮件/造账号/执行模型或知乎调用。
7. 清理仅本迁移临时SSH授权/私钥，保留私有备份和旧主机用于回滚。记录最终真实状态、分支commit/push与限制。

不要因这是一份交接就只回复计划；继续把授权迁移工作做完，遇到真实阻塞才报告。
