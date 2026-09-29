# Agent A：准确分享与回执恢复经验验收

本次为原 Core C 的实际 Orca Agent A，配合不同测试 owner 的隔离验收；不代表公众自然人或生产服务。未自行修改业务代码、数据库结构或服务设置，只执行本角色获准的 API 动作。

资料仅限 M 指定的 `docs/core/experience-sharing.md`（09fd1faf42a26082cb036bcff542ab85b43c2759）及其共享类型/CLI契约；普通合入 D 固定 a833303e229131b970e4a75d50a25cc980408705，保留原分支历史。没有扫描个人记忆、日志或凭据来补内容。

独立整理的 SKILL 主题是准确公开批准、固定版本借用与未知回执恢复，并提供由借用者自行选择的本机 CLI 审查点；没有预写 B 的执行结果或反馈。原稿和 JSON 草稿仅在 M/I 指定的本角色仓库外私有目录，未提交 Git。

本地执行现有 CLI：`draft-experience SKILL.md share-review.json experience-a-20260914-share-review-v1`、`check-draft share-review.json` 均 exit0；正文3397字符，redactions=0、review_required=true、uploaded=false。宿主清除了本进程旧 GONGZHI/SUPABASE 变量，没有地址或身份也完成这两步。正文与 SKILL 经共享 schema 的 trim 规范化后相同（末尾换行被移除），没有内容替换。

Windows 首次 `--import` 使用裸绝对路径被 Node 拒绝，未启动 CLI；改用明确的 `file:///.../node_modules/tsx/dist/loader.mjs` 与绝对 CLI 路径成功。格式通过不是完整隐私审核或批准；已将准确 JSON 路径交 I 审阅，批准前不上传。

I通知3079已更新88e7e6a且healthy后，宿主仅加载本角色新grant，使用D CLI默认 `register` 一次并 `status` 核验，两命令均exit0；本部署Agent凭据已由CLI私存，正文和终端未接触秘密值。

- Agent ID：`73950fdd-dd45-465a-b322-9164f762c6e0`。
- human_owner_id：`1d6e28b4-adde-4ebd-9c40-2c0968b3ac71`。
- scopes：仅 `publish_experience`、`read`；credential_state=issued、credential_saved=true、mode=live。

I完整审阅原JSON的正文、来源、public与稳定键后，以对应隔离测试human签发批准 `c023fc43-d83d-4aa5-9290-854828ed9d5d`，并明确通知可以上传；A不接触human会话，也未自批或改动草稿。I同时通知3079已完成43af静态修复，后端同88e7。

| 本人实际动作 | 结果 |
| --- | --- |
| 原D CLI `upload-draft`，原文件/原键/准确approval | 一次调用，exit0，record_id=`gtvzeqZs`，mode=live |
| `record gtvzeqZs` | exit0，thread_id同ID，speaker与上述Agent一致、owner与上述human一致，正文匹配 |
| `download-experience gtvzeqZs 1` | exit0，固定revision=1，正文与sources匹配获准payload，skill_md保留原正文 |
| 下载回执 | execution=caller_local、author_presence_required=false、executed=false；不代表B已执行任务 |

真实上传与回读已交M/I。I于14:58:11.737UTC撤销本次grant `294f2661-d744-4383-90c1-6c42fa86ff37`，并独立回读公开版本与原正文/来源一致；A没有自行撤销或切换身份。

A随后仅用本人凭据执行一次 `status`：实际exit1、code=revoked、retryable=false，确认预期拒绝后退出本站网络操作。授权撤销用来模拟作者离线，不是停止Orca宿主进程；A不再读取或参与B任务、解释或代写B反馈。上传未发生unknown，没有重试；本轮不声称实测了丢失响应恢复。凭据、草稿、下载文件和原始收据均留在指定私有目录，没有提交Git或打印秘密。

未调用本站付费模型、知乎或 SMTP；A的本轮网络步骤是既有CLI/REST，MCP借用、B的独立本机检查及反馈留B/I实际完成，不在A说明中预先宣称成功。

本片仅新增本说明并保留授权的普通merge；验证以以上实际CLI结果、正文/来源/身份逐项回读和文档diff检查为准，没有新增业务实现或把旧构建当作本片新运行结果。
