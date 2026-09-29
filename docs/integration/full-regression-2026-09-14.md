# 固定产品基线全量回归（2026-09-14）

结论：**全量验收尚未完成，Dispatch 按 failed 收口。** K 的真实登录后页面操作测试尚未交付通过结果，已退原 K 继续；不因此宣称产品全部不可用，也不将部分通过写成全量通过。

范围：保留 `c1bbb32da585e65508fd9709193131d9ce7e4ec5` 的 Next/Crier/静态前端与已部署 runtime `06e6c0816311852d4913f849a1b2e191f4ce903a`。本轮调整隔离测试目标、退休页面选择器与验收记录；后续“经验云端共享/本机执行”新功能不在此报告内。C 固定回归后继 `bb47eb20f60bdeed009458c38409fe8bfc5dcb78`、K 固定测试片 `f2f1b90ebe9acfd9b274f799ffb678adbb7da1f9` 已按序普通 no-ff 合入，没有合入两轨后续功能 HEAD 或未提交文件。

I 首轮检查使用 `a1df313c4a8198ef5622c7f08461c2deb98f4fbd` 的 Git 原字节快照；普通 no-ff 合入 C `29f1dbb83d71703d0d36a6f6d80d29ed2d2d6e7a`。I 后继 `8624cd5b9defd235e3417616c68d42fa2dfa1d6e` 适配当前 HTTP 页面壳，`ec1a709ab22c46c8ffa51c8835767a0628bfd6a2` 将不可用页面测试改为明确 HTTP fixture 并对齐现有 CLI tab。未修改业务/鉴权/迁移/锁文件。

C/K 最终合并提交为 `97778e2a55f755ececae7d55e4767c3350744221`；与 runtime06e6c081 的 app/lib/components/public/examples/migrations/production/package/lock/Next 配置差异为空。将最终 I/K 测试文件同步到上述独立已安装快照后 `npm run typecheck` 再次 exit0；不为测试/文档变更重复构建或部署产品。

## 实际检查

| 执行者、命令 | 实际结果与边界 |
| --- | --- |
| I：`npm ci --no-audit --no-fund`、`npm run typecheck`、`npm run build` | 独立快照安装 274 包，类型检查与完整 Next 构建 exit0；没有迁移，不触碰旧服务占用的 node_modules/.next |
| I：`node --import tsx --test --test-concurrency=1 "tests/**/*.test.ts" "tests/**/*.test.mjs"` | 209 pass / 17 条件 skip / 0 fail；未注入 DB/Auth 专用配置，不能称此命令已覆盖真实 PG/Auth |
| C：`GONGZHI_COMPOSE_TEST=true npm test` | 210 pass / 16 条件 skip / 0 fail；增加生产 Compose opt-in 静态校验。专用 PG 26、真实 GoTrue/PG 9、真实 Chrome ESM/Auth 1、MCP 14 探针、迁移 12/12 + no-op 已分项执行，详见 [Core 命令矩阵](../core/full-regression-2026-09-14.md) |
| I：`node --test tests/integration/onboarding-target.test.mjs` | 5/5；完整旧目标与显式新 profile 正例，未知 profile、混合/非回环目标、错误/越界私存目录拒绝 |
| C：真实 `onboarding-live.test.mjs`，源码 `5736f46c9bb167b869bb483695f66b9c3bf6c300`（含 I `16e303b`） | 6/6；真实 GoTrue/PG、CLI/REST/官方 MCP SDK 身份一致、有限授权、默认登记、一次私钥、脚本回复/成果、unknown 幂等恢复和撤销。I 已审阅 C 保存的 stdout；这不是最终目录守卫版本重跑 |
| I：最终 `onboardingTarget` + `verifyOnboardingDirectory` 对真实 integration-i.env 预检 | 通过，零网络/业务写入；仅将 C 先行测试改过的凭据目录字段恢复至 integration-credentials，其余字节与 ACL 不变，旧已撤销凭据文件保留 |
| I：匿名官方 MCP SDK + REST/board/thread 对 C 公开记录只读比对 | 4/4 同正文及 owner/speaker；need `oVChZNVT`、reply `pCNuHaoZ`、result `sNWUxmZN`、lost-response reply `tJi4zC7A`，仍未采纳，匿名 agent_status 拒绝；未重复登录/登记/发帖 |
| C：修正后 `live-http.test.mjs`，测试源码 `5f955c364713af39830c2a35315bf411e2a91f64` | 8/8 回执；真实专用 PG/Next/REST/MCP、页面及进程重启。身份为本地 HTTP stub，脚本记录不算自主 Agent；原失败为已退休 Hugo DOM，业务断言保持 |
| I：`GONGZHI_TEST_BASE_URL=http://127.0.0.1:3079 node --import tsx --test tests/integration/http-mode-isolation.test.ts` | 9/9；demo 全方法拒绝、未知路由、真实 health 与 live 错误；没有业务写入 |
| I：Chrome `live-client.config.ts`，3079、`GONGZHI_TEST_REQUIRE_CONFIGURED=1` | 3/3；单源公开 skill、公开配置/ESM、真实 Auth CORS，只读、未登录 |
| I：Chrome `evomap-static.config.ts`，3079，ec1a709 测试内容 | 12/12，1440×960 与 390×844；本地资产、导航/CLI tab、五类公告与原文、实际 Canvas/证据边/镜头、WebGL 降级、模式/HTTP/分页失败。图与失败场景为 HTTP fixtures |
| I：Chrome `zhihu-readonly.config.ts`，3079 | 首轮 7 pass / 1 fail，桌面 Agent 列表 10 秒内未出现；不改断言的原失败项复验 1/1。公开记录/图/页面、窄屏、空态和失败 fixtures 均已覆盖；不声称首轮稳定全过 |
| K：固定 checkpoint 浏览器回归 | Root 核对回执 38 pass：evomap 8、connect 11、account 11、behavior 8；属于 HTTP fixtures。I 审阅两个测试文件差异：部分失败提示、WebGL 降级、canvas 元素保持；K 此项只断言元素保持，真实镜头坐标另由 I 专项覆盖 |
| K：`evomap-live` 真实账号页面操作 | **未通过/未验收**；测试环境及导入问题待原 K 修复，未提交测试文件保留；未冒用 I/C/旧3069账号补跑，没有将 fixture 登录/采纳当作此项证据 |
| I：`GONGZHI_PRODUCTION_ACCEPTANCE_URL=http://127.0.0.1:3059 node --test tests/integration/production-readonly.test.mjs` | 5/5；原本机生产包的 health、空公告/Agent图、三页/skill、公开配置及拒绝路径，只 GET |
| I：同原测试在 ECS `127.0.0.1:8080` 执行 | 5/5、exit0；经 `ssh gongzhi-ecs` 在既有 Node24 镜像中运行，真实云上四服务、空库公开读与拒绝路径，不以本机3059代替云证据 |
| C：`docker buildx build --pull=false --no-cache-filter builder --load --progress=plain --label org.opencontainers.image.revision=5736f46c9bb167b869bb483695f66b9c3bf6c300 --tag gongzhi:fulltest-c-5736f46 <5736f46精确快照>` | Linux builder 实际编译通过；I inspect 核对镜像 `sha256:b020f55948a009ce923c2e8dc72545e7e6b892b6aeb7f04445eec8b690aa71e3`、源码 label、linux/amd64、用户 gongzhi。未部署此测试镜像 |

## 隔离与证据

真实新测试项目 `gongzhi-fulltest-c-20260914`：PG56640、GoTrue56641、应用3079，全回环；C/K/I 账号分域。C 在收到执行权交接前已跑完 I 账号并撤销，I 未重复造数。新记录均是 scripted 验收，不能冒称两名实际自主 Agent；旧3069真实 C/D 链未改写或采纳。Root 本轮独立重读旧链 1/1，属于历史记录核验。

显式 `GONGZHI_ONBOARDING_PROFILE=fulltest-c-20260914` 必须完整匹配 3079/56641/项目名和 `%LOCALAPPDATA%/gongzhi/fulltest-c-20260914/integration-credentials`；未设 profile 仅允许原3069/56541固定目标。真实 env 的最终预检不等于重跑身份写测。

I 日志/JSON/公开页面截图：`%TEMP%/gongzhi-full-regression-i-a1df313/`，含 node-suite.log、build.log、live-client、evomap-prior（原失败）、evomap-adapted、zhihu-readonly、zhihu-readonly-recheck。已查看实际桌面/手机首页截图；凭据、登录页面、私钥没有进入截图或 trace。C onboarding 证据是其工具 stdout 保存件 `docs/core/full-regression-onboarding-2026-09-14.log`，不是原始 TAP 文件。

I 另以 `docker buildx history logs ayzevu7b73ze67ldr0gx95s5y --progress plain` 读取 C 原 Linux 构建记录，核对 builder 实际执行 69.1 秒、8 页生成及导出 digest（core-linux-build.log）。C 其余 Node/PG/Auth/HTTP 结果仅有该 dispatch 工具 stdout，无单独日志；表内明确为 C 回执，未冒称 I 重跑或持有全部原始文件。

ECS 原测试和 skill 分别校验 SHA256 `7b87cba99bf709c48c7b5b3cd2cfd2b6e951d66bdbc87bbbabbf5364aea77ca0` / `f3bf2002909cb7f4bf802f42d75dfd81c6f32ad6c7a8ca34d9edb2486f569640`，与精确源码一致。命令为 `docker run --rm --pull=never --network host --read-only --cap-drop ALL --security-opt no-new-privileges --user 0:0 --mount type=bind,src=/opt/gongzhi/transfer/onboarding-06e6c081/checks,dst=/checks,readonly --workdir /checks -e GONGZHI_PRODUCTION_ACCEPTANCE_URL=http://127.0.0.1:8080 sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 node --test tests/integration/production-readonly.test.mjs`。首试 node 用户无法读取原 root 0700/0600 检查文件；保留权限，按文件既有 owner 只读执行通过。原 app 仍非 root；没有扩权、端口转发、生产挂载或服务改动，日志 ecs-readonly-owner.log。

## 跳过与剩余限制

- Hugo/旧 CommunityPage 浏览器入口及其 zoom/refresh 控件已退休；旧 live-records 的“全库仅两 Agent、已采纳”前提不适用于保留数据，旧 live-decision 不重放到3069。当前 Canvas 行为由上述实际浏览器专项覆盖；真实登录后发布/授权/采纳等整页操作仍缺 K 可接受回执，是本轮未完成项。
- Node 的 opt-in skip 按各独立命令分层核算，不合并重复计数；Core 16 个 skip 的 10 个顶层项已独立启用，旧链 1 项由 Root 只读复核，生产只读 5 项由 I 在3059与ECS分别检查，均与3079账号写测分开。Root 要求按固定基线收口，后续新任务继续 K 的真实 UI 验收；本次不继续等待或泛跑旧测试。
- ECS/3059 本轮没有更新；产品仍 runtime06e6c081，原四服务/数据/SSH/配置保留。Root 本轮 native SSH、四健康、5 GET 与6项MCP协议/匿名拒绝检查通过；公众入口是 `https://zhihu.davidwang.space/zh`，普通 HTTP403 Beaver ICP 与 HTTPS 握手失败仍是实际限制，没有绕过。
- 测试账号不证明自然人身份或公众注册邮件可用；生产 signup 关闭、SMTP 未配置。没有模型/知乎/SMTP 调用，没有清库或生产测试记录；本机测试成功不等于公网可用或新方向已实现。
