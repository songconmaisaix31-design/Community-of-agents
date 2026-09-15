# 迁移运维命令参考（北京 → 韩国）

本文记录本次迁移在 PowerShell 下使用的阿里 CLI 调用与云端命令模式，供审阅与后续运维复现。凭据、私钥、env 值均不在此；具体 InvokeId 见报告正文与服务器留存日志。

## 阿里 CLI

```powershell
$ALI = 'C:/Users/DW/aliyun-cli/aliyun.exe'
```

通用参数：`--region <业务地域>`、`--connect-timeout 10 --read-timeout 25 --retry-count 0`；北京 ECS 追加 `--auto-plugin-install false`。

### 实例核对

```powershell
# 北京（注意：不能以 TotalCount 判断，查 Instances.Instance 数组）
& $ALI ecs DescribeInstances --RegionId cn-beijing --region cn-beijing --InstanceIds '["i-2ze2nztd89vevmw21wif"]'

# 韩国（swas-open 插件 0.9.1，kebab-case）
& $ALI swas-open list-instances --biz-region-id ap-northeast-2 --region ap-northeast-2 --page-size 100
```

### 云助手执行

北京（Base64 内容，唯一 ClientToken，查原 InvokeId）：

```powershell
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
& $ALI ecs RunCommand --RegionId cn-beijing --region cn-beijing --InstanceId.1 i-2ze2nztd89vevmw21wif `
  --Type RunShellScript --ContentEncoding Base64 --CommandContent $b64 --Timeout <秒> `
  --Name <名> --KeepCommand false --ClientToken <唯一值> `
  --connect-timeout 10 --read-timeout 25 --retry-count 0 --auto-plugin-install false

& $ALI ecs DescribeInvocationResults --RegionId cn-beijing --region cn-beijing `
  --InstanceId i-2ze2nztd89vevmw21wif --InvokeId <ID> --ContentEncoding PlainText `
  --cli-query "Invocation.InvocationResults.InvocationResult[0].{Status:InvocationStatus,ExitCode:ExitCode,Output:Output}"
```

韩国（明文脚本即可，结果 Output 为 Base64，需解码）：

```powershell
& $ALI swas-open run-command --biz-region-id ap-northeast-2 --region ap-northeast-2 `
  --instance-id fce939c46da24e5a889fbfe785114325 --type RunShellScript `
  --command-content $script --timeout <秒> --name <名>

& $ALI swas-open describe-invocation-result --biz-region-id ap-northeast-2 --region ap-northeast-2 `
  --instance-id fce939c46da24e5a889fbfe785114325 --invoke-id <ID>
# Output 解码：
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($output))
```

### DNS

```powershell
& $ALI alidns DescribeDomainRecords --DomainName davidwang.space --RRKeyWord zhihu --PageSize 500
& $ALI alidns UpdateDomainRecord --RecordId 2099408084300262400 --RR zhihu --Type A --Value 43.108.17.236 --TTL 600 --Line default
```

### 韩国防火墙

```powershell
& $ALI swas-open list-firewall-rules --biz-region-id ap-northeast-2 --region ap-northeast-2 --instance-id fce939c46da24e5a889fbfe785114325 --page-size 100
```

## 韩国服务栈

部署目录：`/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production`
私有配置：`/etc/gongzhi/production`（mode0700，勿打印）
镜像标签：`/opt/gongzhi/transfer/evolution-ed9fec9/release-images.env`

```sh
cd /opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production
docker compose \
  --env-file /etc/gongzhi/production/compose.env \
  --env-file /opt/gongzhi/transfer/evolution-ed9fec9/release-images.env \
  -f compose.yaml -f compose.https.yaml \
  up -d --wait --wait-timeout 180 db auth app proxy
```

- db/auth/app 无 host 端口；proxy 发布 127.0.0.1:8080 与 80/443。
- db 命令显式 `ssl=on` + `hba_file=/etc/gongzhi/pg_hba.conf`（hostssl scram，拒明文），app/auth 经 `db-tls/ca.crt` verify-full 连接。
- 勿使用旧 `/opt/gongzhi/dc`（含旧 runtime 标签）重建 app，会导致降级。
- 回滚 = DNS A 记录改回 `47.93.118.110`；或对 app 选上一镜像 `up -d --no-deps app`（不动 DB/Auth/卷）。

## 临时传输授权（已完成并撤销）

北京追加的限时行已按 `authorized_keys.orig.bak` 恢复，回读 1 行、SHA256 `f19c7260936aee3cc016b99b02604b82e94a471ba50a3750e08793bf3bebca74`。韩国临时 `transfer_key`/`known_hosts_bj` 已删除。无需再操作；如需再次传输，须重新生成密钥并走同一限时 restrict+command 流程。
