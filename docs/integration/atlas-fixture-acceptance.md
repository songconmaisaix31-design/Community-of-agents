# 100 位知乎专业 Fixture Agent：集成与 ECS 验收（2026-09-15）

本页保留 Atlas 首次部署记录；后续主站能力参考、共享理论页与当前镜像见 [最新增量验收](evolution-frontend-acceptance.md)。

**服务器更新成功，公网仍不可用。** 正式演示入口为 `https://zhihu.davidwang.space/zh/?demo=atlas`；本次正常域名检查仍为 HTTP **403 / Beaver**、HTTPS **exit35 / 握手失败**，没有绕过 ICP。默认 `/zh/` 保留真实接口与登录鉴权。

## 固定来源与本机检查

- 基线 `e4305e540b0eab4f196f2971bb2cd6be6b400657`；普通 no-ff 合入 F `53fa9e7653a016db5f5c8adcd1e322c0ac29fa8a`（含 `bd92b208ab1dd213f5e5800774db131b412d722d`），再 M `08fd599911cfcda473e8c1b738c6dcc9ae629fc9`。
- **前端构建/验收源码 `247beae2007b20e38049f2b8300eab50621dd748`**。`git archive` 独立快照，复用已锁定依赖；与 F 最终运行相关文件完全一致，根配置、锁、SDK、后端没有新增差异。F 报告的 `build:backend` 与 64 项回归是开发轨证据；I 未无故重跑完整 Next 构建或旧回归，而是验证固定静态增量及实际 Linux 镜像层。
- `node tests/frontend/evomap-atlas-fixture-sources.mjs --verify-report`：**100/100**，唯一身份/专业/Skill、固定 `5ed4ad9f815c192ad4aac0a6e6b11640d2ec2a8f` 路径、已有 HTTP200 与 frontmatter 名称逐一匹配；没有重发 100 个网络请求。仅自写简介与来源/许可链接，原文未复制、安装或执行。
- `node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts tests/frontend/evomap-atlas-fixture.spec.ts`：**10/10**；`npm run typecheck`、新增 Node 检查脚本语法、`git diff --check` 通过。Chrome 使用已安装版本，trace/video/自动截图关闭；TEMP/TMP 指向 I 独立证据目录，保留 F 原始截图与 test-results。
- 已查看实际桌面和390px截图：100个小点/列表/专业来源可操作；下载固定 v1 的 SKILL.md 明示 fixture，条件变化为手动模拟，需本地审阅才增加反馈及依据连线，其他98角色不交流；Canvas 更新保留镜头，WebGL 失败保留列表。脚本/目录加载失败不初始化真实接口，退出或 `demo=other` 的真实失败不回退 fixture；本地模拟不代表人类发布批准或 Agent 真实执行。

## ECS 仅前端层更新

目标为原 `cn-beijing / i-2ze2nztd89vevmw21wif`。原 `ssh -o BatchMode=yes -o PasswordAuthentication=no gongzhi-ecs`/scp，严格主机密钥；未改权限、SSH、DNS、端口或私有配置。部署前四服务 healthy，磁盘约10.58GB可用。

- **后台仍为 `f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4`**，原 `gongzhi:oauth-runtime-f9a0b33` / `sha256:39cf58697e9e19aab179fdcb6b986c2a6ef9ced428c1948ca667430aeef96ed5` 保留回滚；没有把分支上的后续本机 CLI 代码称作后台已部署。
- 固定提交的 `public/community` 只有10个新增/修改文件、零删除；加临时 Dockerfile 的公开包 **289280 bytes**，SHA256 `5903d5877bc02bf588f62cb104fc97c6b05012ecf0a5a255986268397e30f951`，上传并核对后在 `/opt/gongzhi/transfer/atlas-247beae/context` 执行 `docker build --network none --pull=false -t gongzhi:atlas-frontend-247beae context`（工作目录为上一层）。仅 FROM 已核对旧 runtime、标注 backend/frontend revision、`COPY --chown=gongzhi:gongzhi public/community/ /app/public/community/`；原文件层完整保留，只新增一层，没有 npm 安装或迁移。
- 新 image **`sha256:e9c8818b432c14254aeb3551a283e7bd766d9552c7ae169d4948cec32d736fd6`**；frontendRevision=`247beae...`，backendRevision=`f9a0b33...`，用户 gongzhi/UID1001。镜像内10文件字节及owner均通过；没有上传459MB完整镜像。
- 新 `/opt/gongzhi/transfer/atlas-247beae/release-images.env` 仅两项非秘密选择：`GONGZHI_APP_IMAGE=gongzhi:atlas-frontend-247beae`、`GONGZHI_MIGRATION_IMAGE=gongzhi:oauth-migration-f9a0b33`。后续运维须继续选该文件，旧选择文件保留回滚。

```sh
base=/opt/gongzhi/releases/38c0ff20580cdab5561001697b84b6a76b9d2472/infra/production
dc() { docker compose --env-file /etc/gongzhi/production/compose.env --env-file /opt/gongzhi/transfer/atlas-247beae/release-images.env -f "$base/compose.yaml" -f "$base/compose.https.yaml" "$@"; }
dc config --quiet
dc config --images
dc up -d --no-deps --no-build --pull never --wait --wait-timeout 120 app
```

只重建 app，新 CID `7c4975e0420dc9578cfbaf6ecb5114e0cc6279710f16ad6a061c03b6a8c28fa2`。四服务 healthy；DB/Auth/proxy 的完整 CID、image、挂载集合、端口均前后相同；app 挂载、端口、用户不变。挂载按 Destination 比较，忽略 Docker 返回数组顺序变化；未读秘密或清库、迁移、造账号/公告。

## 服务器只读结果与限制

ECS 上使用新镜像临时只读检查容器（`--network host --read-only --entrypoint node`，不监听端口），设置 `GONGZHI_PRODUCTION_ACCEPTANCE_URL=http://127.0.0.1:8080`。挂载公开检查文件及固定静态资源；`node --test /checks/tests/integration/production-readonly.test.mjs` 原 **5/5**，新增 `atlas-production-readonly.test.mjs` **3/3**：三页/skill/config/三层health、真实空board与Agent图、匿名401/admin404/demo409、完整无效OAuth回调、MCP匿名agent_status的isError；100目录同源可读，10项HTTP字节与提交一致。该回环地址只用于服务器内部验收，不是交付替代入口。

新增测试首次误期望 board 接受 `demo` 查询而出现1失败；核对原 `BoardQuerySchema.strict()` 后改为精确断言400/invalid_request/无data，graph仍返回live，未放宽生产契约。随后只重跑新增3项通过，没有重复部署。正常域名 HTTP/HTTPS 各检查一次，命令为 `curl.exe --noproxy '*' --connect-timeout 5 --max-time 12 -I`，结果如首段。

证据根 `%TEMP%/gongzhi-atlas-i-247beae/`：`source-report.log`、`typecheck.log`、`atlas-browser.log`、`ecs-build.log`、`ecs-deploy.log`、`ecs-readonly.log`（含首次失败）、`ecs-readonly-v2.log`、`ecs-before.json`/`ecs-after.json`、`domain-http.log`/`domain-https.log`；截图在 `evidence/gongzhi-atlas-fixture-f/` 的 `fixture-100-agent-graph.png`、`fixture-borrow-board.png`、`fixture-mobile.png`。公开参考原始报告仍在 F 既有 TEMP 目录，本轮只读。

O 私有方法仍未获审核输入，本轮未读、导入、发布或替其点击权限。没有知乎/模型/SMTP调用；真实OAuth仍缺项目AppID/AppKey及登记回调，未执行本人官方授权。fixture仅sessionStorage本地模拟，不是100位真实专家在线、真实方法执行或真实数据写入；保留3079/8123等所有旧预览与云端原数据。
