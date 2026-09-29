# Windows 免密 SSH（2026-09-14）

这台电脑的当前 Windows 用户可直接执行：

```powershell
ssh gongzhi-ecs
```

登录既有 ECS `cn-beijing / i-2ze2nztd89vevmw21wif / 47.93.118.110` 的 **root** 账号，主机名 `iZ2ze2nztd89vevmw21wifZ`。**网站入口仍是 <https://zhihu.davidwang.space/zh>，网页继续要求原登录及有限授权。** SSH 是服务器管理入口，不能据此认为网站鉴权被取消或公网访问已恢复。

## 专用文件与信任

- 私钥仅在本机 `C:/Users/DW/.ssh/gongzhi_ecs_ed25519`，无口令，ACL 禁止继承且只有当前 Windows 用户 FullControl；未启用 SSH-agent 服务，私钥未进入 Git、云命令或服务器。
- 公钥：同路径加 `.pub`；指纹 `SHA256:r15VwPucwuvEskbsXN8hFqQzXMc4c+zbObZ3dBgHoZM`。
- 主机公钥经既有 Cloud Assistant 可信通道读取并核对原指纹 `SHA256:iU6USY2dVGhdFL2+vcICc78WU99MPTzeoEy936VqC74`，固定在 `C:/Users/DW/.ssh/known_hosts_gongzhi_ecs`；未改原 `known_hosts` 的任何字节。
- 新建的 `C:/Users/DW/.ssh/config` 只有 `Host gongzhi-ecs` 段：目标 IP/root/22、上述专用 IdentityFile 和 UserKnownHostsFile、IdentitiesOnly/StrictHostKeyChecking=yes、IdentityAgent=none、HostKeyAlgorithms=ssh-ed25519、UpdateHostKeys/ForwardAgent/ForwardX11/PasswordAuthentication/KbdInteractiveAuthentication=no、PreferredAuthentications=publickey；ConnectTimeout10、ConnectionAttempts1。无 ProxyCommand、ProxyJump 或隧道配置。
- 服务器仅在原 root `authorized_keys` 追加该公钥一行，选项 **`restrict,pty`**：允许 shell/命令、PTY 和 SFTP，禁止 SSH 端口、Agent、X11 转发及用户 rc。依据服务器 OpenSSH9.6p1 自带 man 与[官方说明](https://man.openbsd.org/sshd.8)核对；没有 forced-command 或临时到期限制。原文件为空，原字节与 root:root/0600 保留，未修改 sshd 全局策略、IAM、安全组或账号。

## 本轮实际验证

| 命令 / 操作 | 结果 |
| --- | --- |
| Cloud Assistant `sshd -V`、`sshd -T`、主机公钥及原 authorized_keys 预检 | `t-bj06x156vpxcqgw` Exit0；Ubuntu OpenSSH9.6p1，原 permitrootlogin/pubkeyauthentication/permittty=yes，原授权文件0 bytes/0600 |
| 追加唯一专用公钥；前后 `sshd -T` 和原字节/权限比较 | `t-bj06x15g08i3y80` Exit0；只有上述一行新增，有效全局策略完全相同 |
| `ssh -o BatchMode=yes -o PasswordAuthentication=no gongzhi-ecs 'id -un'`，另一次连接运行 `hostname` | 两次 Exit0，分别返回 root 与目标主机名，全程无密码提示 |
| `ssh -tt -o BatchMode=yes -o PasswordAuthentication=no gongzhi-ecs 'bash --noprofile --norc -i'`，stdin 仅发送 id/hostname/tty/exit | Exit0；交互终端 `/dev/pts/0`，受控退出 |
| `sftp -b - -o BatchMode=yes gongzhi-ecs`，stdin 仅 pwd/quit | Exit0，远端目录 `/root`；无文件写入 |
| 经新 alias 在 ECS 内部执行只读 HTTP 检查 | 匿名 agents/me 与 authorizations 均401/unauthenticated；公开config仍启用Auth并指向正式域名，接入页200且保留登录界面，未记录public key值 |
| 新 alias 只读检查 Docker 与原部署文件 | 四服务 healthy 且 CID 未变，app 源码label仍 `06e6c0816311852d4913f849a1b2e191f4ce903a`；原 Compose、HTTPS overlay、Caddyfile、routes 文件哈希均未变，DB/Auth/app 无 host 端口 |

Aliyun CLI 仍使用 default/cn-beijing、retry-count0、connect-timeout5、read-timeout15、auto-plugin-install=false；RunCommand 使用 Base64、KeepCommand=false、唯一 ClientToken，并查询原 InvokeId。本机首次以新 FileSecurity 调用 Set-Acl 遇到 SeSecurityPrivilege 错误；未提权，改用 icacls 仅收紧本次新私钥文件，最终当前用户单一 ACL 已回读核对。

2026-09-14 **10:06:59 UTC** 正常域名外部复查：HTTP403/Beaver/Non-compliance ICP Filing，HTTPS curl Exit35/握手失败。未使用 insecure TLS、备用公网端口、IP网页入口或代理绕过；网站正常公网可用性仍受备案限制。生产 app/image/DB/Auth/卷、登录/SMTP/模型配置均保留，没有重建、迁移、造数或外部服务调用；当前 runtime/image 详见[集成验收](onboarding-acceptance.md)。本轮仅系统 SSH 配置与文档变更，未重复产品构建和全套业务测试。
