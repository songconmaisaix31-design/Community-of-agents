# 进化层 + 记忆层 集成与部署验收（2026-09-16）

## 合并基线

沿 `integration/gongzhi-mvp` 普通合并三轨固定 SHA（无 force，保留历史）：

| 轨 | 分支 | SHA | 内容 |
| --- | --- | --- | --- |
| C Core | songconmaisaix31-design/gongzhi-core | `ff9402f` | lineage 回填、`searchExperience` tag/游标、`based_on_feedback_ids`、审批固定快照、谱系显式边 |
| D Connect | songconmaisaix31-design/gongzhi-connect | `a106860` | CLI `run-experience` 本机加载运行回传 + 多 `based_on_feedback_ids` 支持 + docs |
| F Frontend | songconmaisaix31-design/gongzhi-kimi-adaptation | `bfdedee` | `/zh/library/` 经验库页 + 全站导航 + 候选改进闭环入口 + 前端测试 |

集成合并提交：`d4d6104`（core）、`b5644ba`（connect，含 `docs/connect/agent-skill.md` 冲突解决：保留 username-only 鉴权 + 新增 run-experience 段落）、`36f7b2e`（frontend）。

## 后续集成提交

- `3ce9719` `chore(core): regenerate browser client` —— `build:client` 重生成 `public/community/assets/gongzhi-client.js`，暴露 `readExperienceLineage`、`searchExperience` tag/cursor、`publishExperience` 的 `based_on_feedback_ids`。
- `e511614` `fix(integration): map /zh/library route` —— `next.config.ts` 新增 `rewrites` `/zh/library` → `/community/zh/library/index.html`。

## 本地验证（Windows，无 Docker）

- `npm run typecheck` 通过。
- `npm run build`（build:client + Next 生产构建）通过。
- 前端 Playwright：`evomap-library.spec.ts` 2/2、`evomap-evolution.spec.ts` 8/8、`evomap.spec.ts` 8/8（共 18/18）。
- C 已在 core 轨运行 `test:core`（80 pass / 0 fail / 10 skip）与 contract 测试 10/10。

## 真实 PG 闭环

C 新增 `tests/core/experience-evolution-live.test.ts`（反馈→批准→新版本→谱系）与回填的 lineage 用例已写好，但**本机 Docker 守护进程未运行，无法启动 GoTrue/PG 容器，真实 PG 验收未执行**，如实标「未验证」，不伪造通过。该验证需在有 Docker 的环境补跑。

## ECS 主站部署（韩国 43.108.17.236）

本轮含后端契约变更（`lib/gongzhi/*`、`app/api/*`），采用**完整 app 重建**而非前端 overlay：

- 服务器 git 检出 `/opt/gongzhi/releases/oauth-f7d6a7c` 重置到 `e511614`。
- `docker build --target runtime -t gongzhi:evolution-memory-e511614`（361 MB，label `org.opencontainers.image.revision=e511614`）。
- 无新迁移（C4 复用 digest，未改 `migrations/`），沿用 `gongzhi:oauth-migration-f7d6a7c`。
- 更新 `/opt/gongzhi/transfer/evolution-memory-3ce9719/release-images.env`（APP=`gongzhi:evolution-memory-e511614`，MIGRATION 不变）→ `docker compose up -d --no-deps --no-build --pull never --wait app`。
- 四服务 healthy；app 新 CID `e8fbb49d2eff`。

线上验证（真实公网 HTTPS）：

| 项 | 结果 |
| --- | --- |
| `/zh/library/` | 200，含经验库页面（`data-search-form`、标题「经验库」） |
| `/zh/`、`/zh/board/`、`/community/zh/evolution/index.html` | 200，导航含「经验库」入口 |
| `/api/gongzhi/experiences/search?q=test` | 200，返回含 `next_cursor`（新游标分页生效） |

## 回滚

- 上一 app 镜像 `gongzhi:evolution-memory-3ce9719`、`gongzhi:animation-frontend-deeca27`、`gongzhi:oauth-593a9ef` 均保留。
- 回滚 = 改 `release-images.env` 的 `GONGZHI_APP_IMAGE` 回上一镜像再 `up -d --no-deps app`（不动 DB/Auth/卷）。

## 2026-09-16 后续增量：真实 PG 闭环 + 从反馈发起改进 + 下线 fixture 演示

### 真实 PG 验收（已补跑，Docker Desktop 已启动）

复用本地配置目录 `C:\Users\DW\AppData\Local\gongzhi\fulltest-c-20260914`（GoTrue 56641 / PG 56640 / 项目 `gongzhi-fulltest-c-20260914`，容器 healthy），带 `GONGZHI_EXPERIENCE_SHARING_TEST=true` 运行：

- `tests/core/experience-evolution-live.test.ts` **5/5**（tag/cursor 搜索、based_on_feedback_ids 空/多/非法/缺父版本拒绝、审批快照绑定、重复请求单版本、谱系「反馈→新版本」显式边）。
- `tests/core/experience-sharing-live.test.ts` **8/8**（人类精确批准、并发单次消费、撤销/过期拒绝、离线固定版本、反馈证据、谱系版本链）。

合计 **13/13 真实 GoTrue/PG 通过**，无跳过。真实闭环（反馈→批准→新版本→显式谱系）已验收，不再标「未验证」。

### 从反馈发起改进入口（F，已上线）

- `evolution.js`：`needs_changes` 反馈节点显示「基于此反馈发起候选改进 →」，跳 `/zh/board/?improve=<exp>&revision=<n>&feedback=<fb_id>#library`。
- `experience.js`：读 `feedback` 参数，草稿预填 `previous_version_id` + `based_on_feedback_ids`。
- 前端 E2E：`evomap-evolution-improve.spec.ts` **2/2**（入口 href 正确 + 草稿预填 previous_version_id/based_on_feedback_ids）。
- 部署：`gongzhi:evolution-memory-30bf519`（前端 overlay，FROM evolution-memory-e511614），线上 evolution.js/experience.js 已含新入口、首页 atlas-entry 已移除。

### 下线 fixture 演示

- 删除阿里 DNS `demo.zhihu` CNAME 记录（RecordId `2099576891807303680`），`demo.zhihu.davidwang.space` 不再解析（权威已删，本地缓存随 TTL 到期）。
- 移除主站首页 `atlas-entry`（`/zh/?demo=atlas#atlas`）按钮，首页直接进入真实环境。
- gh-pages 分支保留（可逆）；真实环境入口不变（`zhihu.davidwang.space` → `/zh`）。

### 端到端验收结论

- 后端闭环：真实 PG live 13/13（含「反馈→新版本」显式谱系边）。
- 前端入口：E2E 2/2（从反馈发起改进 → 草稿带 previous_version_id + based_on_feedback_ids）。
- 两端合起来满足验收主线：固定版本被借用 → 使用记录与反馈 → 候选修改及检查依据 → 人类批准 → 新版本及显式谱系 → 接收方采纳 → 新任务使用/回退（真实 PG 已证明；真实浏览器全链路写入仍在真实账号/审批下由既有 live 测试覆盖）。

### 回滚

- 前端 overlay 回滚 = `release-images.env` 改回 `gongzhi:evolution-memory-e511614` 再 `up -d --no-deps app`。
- DNS 回滚 = 重新新增 `demo.zhihu CNAME songconmaisaix31-design.github.io`（原值已记录）。
