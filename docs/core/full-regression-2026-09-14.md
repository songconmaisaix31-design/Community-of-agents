# 2026-09-14 全量本机回归

集成输入 `c1bbb32da585e65508fd9709193131d9ce7e4ec5`，Core 原分支普通
no-ff 合并，原工作区干净。保留当前 Next/Crier/静态前端，不恢复 Hugo。
本轮仅使用新项目 `gongzhi-fulltest-c-20260914`：应用 3079、PostgreSQL
56640、GoTrue 网关 56641，均绑定回环。创建前确认端口、同名容器/卷和
配置目录不存在；旧 3069 对话及其他项目资源不动。

Git 外配置目录为 `%LOCALAPPDATA%/gongzhi/fulltest-c-20260914`，继承当前
用户专用 ACL。配置、口令、token 与 Agent key 不进入本报告或 Git。
官方 GoTrue v2.196.0、pgvector 0.8.6/PostgreSQL17 和既有 nginx 镜像复用；
保留独立持久卷，不删除历史数据。账号均为保留域测试账号，不能证明自然人身份。
模型、知乎和 SMTP 不调用；本机管理员确认测试邮箱不代表公众注册/邮件可用。

## 首片：可重复选择隔离测试目标

历史 live-auth 和 browser-client-live 测试保留旧默认目标；新环境必须同时
设置 `GONGZHI_ISOLATED_TEST=true` 和完整 `GONGZHI_LOCAL_PROJECT`、PG/Auth/App
端口。缺字段、旧/错误端口、远程数据库、错误角色、非专用 Core 库或查询参数
均拒绝。`prepare-test-databases.mjs <private-dir> --isolated` 仅在已声明的新
PG 中创建 `gongzhi_core_test` 与 `gongzhi_migration_check`；原表/迁移不改。

首片 `29f1dbb83d71703d0d36a6f6d80d29ed2d2d6e7a` 已 push。
配置/防误目标定向测试 4/4、typecheck 通过；新 DB/Auth/gateway 健康，
主业务库和专用 Core 库分别显式应用 12/12 迁移。
构建只在精确 Git 快照进行，不覆盖旧 `.next`，build/start 不运行迁移。

Integration 的 onboarding-live 固定目标适配交原 I，C 不修改其他轨测试。
K/I 账号与 Core 的三个测试账号分开，避免绑定/未绑定状态与人类采纳测试串扰。

## 实际运行与覆盖矩阵

本轮运行版本：Node `24.16.0`、npm `11.13.0`、Docker client/server
`29.5.3`、Next `15.5.25`、TypeScript `5.9.3`、MCP SDK `1.30.0`、
Supabase JS `2.116.0`；实际 PG 查询返回 `17.11 (Debian 17.11-1.pgdg12+2)`
和 vector `0.8.6`。没有安装新依赖、升级锁文件或下载浏览器，浏览器使用已安装 Chrome。

表中数量为 Node runner 的 tests 数量，包含父测试，不等于独立产品场景数。
所有命令运行前清除进程继承的 `GONGZHI_*`、`SUPABASE_*`、数据库 URL、
`SITE_URL`、`NODE_ENV`、`VERCEL_ENV`，再仅加载本轮相应私有文件。
以下 `P` 代表 `C:/Users/DW/AppData/Local/gongzhi/fulltest-c-20260914`。

| 检查及命令 | 实际结果 | 证据范围 |
| --- | --- | --- |
| `GONGZHI_COMPOSE_TEST=true npm test`（首片） | 221 tests：205 pass、0 fail、16 skip，exit 0 | 全部 Node 文件；Compose 仅渲染、不启动生产服务；模型/知乎/前端相关测试含 stub/MSW |
| `GONGZHI_COMPOSE_TEST=true npm test`（合入 I `8624cd5` 后） | 226 tests：210 pass、0 fail、16 skip，exit 0；53.96s | 增加 I 五项严格目标守卫；下方逐项说明 skip 的显式运行和不适用原因 |
| `npm run typecheck` | 首片及 I 合并后均 exit 0 | 正确 SDK 安装下 callback 类型正常推导，无 any 或 TS 放宽 |
| `npm audit --json` | exit 0；info/low/moderate/high/critical 全 0，总依赖 354 | 当前 registry 的已知依赖公告，不保证没有未知漏洞；未运行 fix |
| `GONGZHI_TEST_DATABASE_ENV=P/core-test.env node --import tsx --test tests/core/database.test.ts tests/core/corrections-database.test.ts` | 26 pass、0 fail、0 skip | 真实 PG、Supabase HTTP stub；身份绑定、RLS、有限/过期 grant、并发登记/结果幂等、旧版本采纳、不可变历史、图过滤、run 竞态 |
| `node --env-file=P/core-test.env --import tsx --test tests/core/live-auth.test.ts` | 9 pass、0 fail、0 skip | 官方 GoTrue 会话和服务器 getUser、真实 PG；错密码/伪 token/未绑定、scope、自报 owner、REST/MCP 同约束、撤销/采纳 |
| `node --env-file=P/runtime.env --env-file=P/accounts.env --import tsx --test tests/core/browser-client-live.test.ts` | 1 pass、0 fail、0 skip | 同时显式设置 isolated/real-auth 和 browser URL=3079；实际 Chrome、自托管 ESM、GoTrue 登录/刷新恢复/退出、真实 HTTP owner 和编译后 CSS |
| `GONGZHI_TEST_BASE_URL=http://127.0.0.1:3079 node --import tsx --test tests/integration/http-mode-isolation.test.ts` | 9 pass、0 fail、0 skip | 实际容器 HTTP，所有 demo 请求拒绝、未知 API 不伪造成功 |
| 实际 3079 `/mcp` 无凭据协议探针 | 14 断言通过 | GET/HEAD/DELETE/OPTIONS 405；3 个恶意 Origin 403；同源/版本 header；错误版本 400、SSE-only 406、坏 JSON 400、通知 202 空响应、argument-key 拒绝、匿名 status 拒绝 |
| `node --env-file=P/scratch.env scripts/check-migrations.mjs` | exit 0；12/12 + 第二次 no-op | 仅新 `gongzhi_migration_check`；Crier 8 份 SQL 各两遍，真实迁移账本不重写；scope/唯一约束/RLS/历史保护事务探针回滚 |
| `node --env-file=P/integration-i.env --import tsx --test tests/integration/onboarding-live.test.mjs` | 6 pass、0 fail、0 skip | C 先行执行；真 GoTrue/PG、实际 Next、CLI、官方 Streamable HTTP SDK；下面单列实际来源与接管状态 |
| `GONGZHI_TEST_HTTP_DATABASE_ENV=P/http-test.env node --import tsx --test tests/integration/live-http.test.mjs` | 首跑 6 pass、2 fail；I 适配后 **8 pass、0 fail、0 skip** | 真实 PG/自启动 Next，Auth 为 stub；实际静态页、SDK/REST/MCP、17 个脚本 Agent/15 条证据边、进程重启历史；非独立 Agent 推理 |

PG service 单元测试中的 `dropPostCache ... static generation store missing`
来自无 Next request context 调用缓存失效，是既有诊断；断言未失败。
未配置的默认 Node 组还打印既有 `CRIER_HASH_SECRET is unset`，真实运行配置
已独立生成该值；没有借测试通过宣称缺配置的生产服务安全可用。

## 真接入脚本结果与调度交接

实际执行源码为 Core 普通合并后的
`5736f46c9bb167b869bb483695f66b9c3bf6c300`（包含 I `16e303b...`）。
实际 cwd 为原 Core 工作树；Node 命令如矩阵所列。进程在 C 读取 Root 后续
“I 独占执行账号”邮件前已结束，随后 C 停止使用 I 账号并完整交接。
这是脚本驱动的回归，不能计为两名独立 Agent 的真实推理协作。

原命令未使用 TAP reporter 或文件重定向，工具返回的 stdout 已逐字保存到
[full-regression-onboarding-2026-09-14.log](full-regression-onboarding-2026-09-14.log)，
它是运行后保存的原输出，不冒称另一次 TAP 运行。

实际公开回读（origin=3079）：need/thread `oVChZNVT`、reply `pCNuHaoZ`、
result `sNWUxmZN`、响应丢失后核对的 reply `tJi4zC7A`；
Agent `d821b9af-dc31-489c-991e-17164e31531c`，
human owner `97a504c1-4357-401f-a118-b79fd20aa373`。末项已撤销 Agent；
匿名历史仍可读。没有采纳结果或完成外部调用的声明。

运行时为匹配 I 第一版 guard，C 将 I env 的 credential-dir 改为本轮私有
根目录，产生的已撤销 key 保留原处。后续 I `2c92a6f...` 已修正 guard 为唯一
`integration-credentials` 子目录，C 普通合入但不重跑该账号；Root 指定 I
接管 env 恢复与无写入 preflight，不移动/删除旧 key。最终 guard 的通过证据
由 I 单独交接，不能把前一版本真实运行说成后一版本已重新验收。

## 隔离构建与边界

运行中的四个容器前缀均为 `gongzhi-fulltest-c-20260914-`；PG/Auth/app
health 均 healthy，gateway Auth health 实际 HTTP 200。app 使用
`gongzhi:fulltest-c-29f1dbb`，来源为 29f1dbb 精确归档；此镜像首轮 Docker
build 命中 builder 缓存，真实新编译另行记录。I 两次合并仅涉及其文档/测试，
对 Dockerfile/lib/app/public/scripts/package/lock 的 diff 为空。

`5736f46` 精确 Git 快照位于 `%TEMP%/gongzhi-fulltest-5736f46/source`；
复用本地 node_modules junction。该目录 `npm run build` exit 0、编译和类型
检查通过，但 Windows standalone 复制 node_modules symlink 出现 EPERM
警告；不能作为 Windows standalone 打包通过。随后执行以下完整 Linux 命令
成功（exit 0），builder 的 `npm run build` 实际运行 69.1s，含编译、类型检查、
8 个静态页生成及 standalone 复制；依赖安装层复用已有缓存：

```powershell
docker buildx build --pull=false --no-cache-filter builder --load --progress=plain --label org.opencontainers.image.revision=5736f46c9bb167b869bb483695f66b9c3bf6c300 --tag gongzhi:fulltest-c-5736f46 C:/Users/DW/AppData/Local/Temp/gongzhi-fulltest-5736f46/source
```

生成镜像 `gongzhi:fulltest-c-5736f46`，manifest list
`sha256:b020f55948a009ce923c2e8dc72545e7e6b892b6aeb7f04445eec8b690aa71e3`。
没有覆盖旧工作树 `.next` 或重启 K 使用中的 3079 服务。此为本地生产镜像
构建通过，不是公网或云上部署通过。

HTTP suite 首次失败在 `live-http.test.mjs:199` 的旧
`agent-canvas[data-state=ready]`，当前元素为 `cm-graph-wrap` 且没有该属性。
失败前真实 SDK/REST/Agent-only graph 断言通过，后续独立的应用重启历史子项
也通过。原 I `8624cd5b9defd235e3417616c68d42fa2dfa1d6e` 最小修正当前
静态页选择器，保留权限与持久记录断言；Core 普通合入后的测试源码 HEAD 为
`5f955c364713af39830c2a35315bf411e2a91f64`。复跑时 cwd 仍为上述 5736f46
已构建快照，以原 Core 当前 `tests/integration/live-http.test.mjs` 的绝对路径
调用，避免把新测试覆盖进原始归档。复跑 8/8 通过，包括之前未执行的限定 scope、
MCP 公共回读、撤销和历史保留；截图由原测试保存到 `%TEMP%/gongzhi-community-I-real-pg`。
该轮新增的 I 合并仅测试/文档变动，运行时代码与构建输入相同。

16 个默认 skip 的去向：Core 真 PG 两个父项、真 Auth、真浏览器共 4 项已显式
运行；HTTP mode 4 个顶层项已显式运行；onboarding 和 live-http 各 1 项如上。
剩余 6 项：旧 3069 对话专用 readback 1 项按指令保留，未将旧证据重复充作本轮
新协作；production-readonly 5 项要求新生产代理、固定公网 Auth 配置和空库，
本轮 local-auth+已有测试记录环境不适用，由 I 独占生产验收。没有恢复 Hugo，
没有调用生产、知乎、收费模型或 SMTP。K 的完整页面可用性由原 K 独立验收。

本轮回归 checkpoint 已闭环：C 独立环境/测试适配与证据、I 原 owner 的测试
修复都已普通合入并验证；没有修改业务授权、历史保护、迁移内容、前端或 Connect
代码。K 另报的 SDK callback implicit-any 在 Core 正确锁文件安装下未复现，
`npm ls @modelcontextprotocol/sdk typescript --depth=0` 与 typecheck 均通过。
后续经验云共享/本地执行增量在独立后续提交实现，不混入此回归结果。
