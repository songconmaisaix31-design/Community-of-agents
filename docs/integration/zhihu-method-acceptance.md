# 知乎方法草稿与有界采集验收（2026-09-15）

本轮仅集成本机 CLI、测试和文档，保留 Next/Crier、页面、身份、公告与 Agent 图。所有新增 I 检查均为合成输入；没有真实采集、批准、上传或 A/B 任务执行。

## 源码与合并

- 起点：`d50700442934154bc11b94a21bed211e61120d7e`。
- 普通 no-ff 合入 M `61cb80229193fa2a92e4607f9f887de6f222bb37`，再 O `3a051fe054d72c5bbfeec23206382bb5573cf124`（含 `d45ebf71dd7ae517559e202c51f22f08122b250d`）。
- 随后合入 O 修复 `c8c639a2e32f8e62d15ba83aa4d686ddc7db7a9a`：已有锁一律拒绝且不自动删除；恢复保留累计重复计数。
- **检查/构建精确源码：`75f2d0d5309ed4a3727532daf153824af47094d3`**，含 I 子进程测试。之后 M `c15cb9568282c2fd8635c92d7c8ffbf3c6bab047` 仅更新计划状态，后续本报告不改变已测代码。

## 独立执行

通过 `git archive` 提取上述固定快照到 `%TEMP%/gongzhi-method-i-75f2d0d/source`；复用先前 `npm ci` 的依赖目录，经对比锁文件 SHA256 均为 `776f04a89873cb57038734ab34654620fd8d26c11d8fef4a3fe33c1dce4f436e`。Windows Node `24.16.0`、npm `11.13.0`、tsx `4.23.13`、Next `15.5.25`；未修改锁文件或原预览构建目录。

| 实际命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/connect/zhihu-method.test.mjs tests/connect/zhihu-corpus.test.mjs tests/integration/zhihu-method-cli.test.mjs` | 39 pass / 0 fail / 2 Windows skip；其中 O 35、I 4 |
| `node --import tsx --test "tests/connect/*.test.mjs"` | 218 pass / 0 fail / 2 Windows skip |
| `npm run typecheck` | pass |
| `NEXT_TELEMETRY_DISABLED=1 npm run build:backend`（PowerShell 设置同名环境变量后执行） | pass；编译、类型、8/8 静态页面及 standalone tracing 完成，无迁移 |
| `git diff --check` | pass |

两个 Windows 文件符号链接跳过项均在现有 Linux 镜像补验 **2 pass / 0 fail / 0 skip**：

```powershell
$snap = "$env:TEMP/gongzhi-method-i-75f2d0d/source"
docker run --rm --network none --read-only --tmpfs /tmp --entrypoint node --mount "type=bind,source=$snap/tests,target=/app/tests,readonly" --mount "type=bind,source=$snap/examples,target=/app/examples,readonly" --mount "type=bind,source=$snap/lib,target=/app/lib,readonly" gongzhi:oauth-migration-f9a0b33 --import tsx --test --test-name-pattern 'symlinked (state file|replay page)' tests/connect/zhihu-corpus.test.mjs
```

该既有镜像 ID `sha256:fbbd5cbc0bc7cd530c1c58e15d976e615f5b735628556eb135745ca40b1113be`，运行用户 node/UID1000，Node `24.21.0`；内部锁文件与快照一致。只覆盖入口运行测试，**没有运行默认迁移命令**、安装、提权或构建新镜像。Windows 目录 junction 用例本身通过。

I 的真实子进程调用原 CLI：来源 JSON + 操作者合成方法 → `draft-zhihu-experience` → `check-draft`，验证 `CreateContentApprovalInput.content` 形状、原作者/URL/不透明 ID/summary 或 full_text 保留、拒绝预填批准字段与覆盖草稿；只有本地未批准草稿，零上传。测试专用 preload 完全替换 fetch、不转发网络，子进程不继承项目凭据；503 失败与显式恢复均 exit1、占原预算，提高计划上限不重置额度，完成后恢复不额外请求且重复计数保留。未改领域代码或生产入口。

原始测试日志在 `%TEMP%/gongzhi-method-i-75f2d0d/`：`targeted.log`、`connect.log`、`linux-symlinks.log`、`typecheck.log`。首次构建虽 exit0，但 tracing 重建依赖 junction 时出现 Windows symlink EPERM；因此另用同一 Git 快照与既有锁定依赖的实体副本，仅重跑构建，最终无此警告，产物及日志在 `%TEMP%/gongzhi-method-i-75f2d0d-build/source/.next/` 与其上级的 `build-backend.log`。没有安装或提权；O 报告过的中间运行 `state.json` rename EPERM 与此不同，本轮独立最终测试未复现，未加入重试掩盖问题。

## 未执行与真实边界

- I 本轮没有读取 `.env`/密钥、请求知乎/DeepSeek、创建账号/批准/业务记录，也未修改数据库、SSH、域名或任何预览。
- M 的历史预检只有 3 次 HTTP（2 quota、1 search），得到 10 条私有候选**摘要**；搜索 Total10/Used1/Remaining9，回答 Total10/Remaining10，与用户口述 5000 配额不同。I 仅记录交接事实，未再次调用；没有启动批采集，后续若获准批次仍最多 4997 且受实际官方额度约束。
- 真实 A 问题与获准资料、B 不同任务/电脑，以及人类公开发布和反馈确认仍缺失；fixture 不代表用户同意、真实执行或平台端到端完成。
- 不重跑无关 PG/Auth/浏览器回归、不部署本机 CLI 变更；既有部署源码仍为 `f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4`。OAuth App 凭据/回调缺失、公开域名 ICP403/HTTPS 失败沿用历史限制，本轮未复测，不声称公网成功。
