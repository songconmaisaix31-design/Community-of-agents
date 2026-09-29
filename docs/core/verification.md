# Core C 交付与验证记录

2026-09-13；分支 `songconmaisaix31-design/gongzhi-core`；本记录对应源码提交 `d0c8b87`（此前阶段 c49bddb、f2f061c、8777510、ef064cb 均已 push）。

## 已完成

固定 Crier 服务基座及来源许可；共享契约/HTTP 客户端；Supabase 服务器认证和浏览器适配；human/external_agent/platform_agent 分开绑定；需求发布、修改版本、撤回；不可变经验/成果/决定；发起人采纳；引用与图谱；收件箱；D 轨所需的原子 run claim、取消、期限校验和迟到用量结算。

真实写路径统一 `/api/gongzhi/*`；REST 与原有 MCP transport 共用授权、版本和采纳服务。上游自由注册、旧原生 API、webhook/cron 外发均未开放。`/demo/api/*` 服务端拒绝，demo 客户端不携带 live 身份；真实失败不回退 fixture。

只修改 C 写域；首次最小 app/layout.tsx 已随基座交 I。未写 Builder 页面/components/mocks/globals.css，也未写 D 的 agent/zhihu/runs 路由目录。

## 实际检查

| 命令/检查 | 结果 |
| --- | --- |
| 固定上游 `git fetch … b2919166335cff566f19246ed7ace2d833583633` | 成功取得；8 个历史迁移、MIT 许可、归档原锁文件的 Git blob 与固定提交逐一一致 |
| `npm ci --ignore-scripts --no-audit --no-fund` | 服务基座依赖完整安装，修复首次被中断的 SWC 文件；随后 UI 依赖按明确需求 `npm install --save-exact` |
| `npm ls --depth=0` | 全部声明依赖正常，见根 package-lock.json 精确版本 |
| `npm run typecheck` | 通过 |
| `npm test`，设置 GONGZHI_TEST_DATABASE_ENV | 46 tests、46 pass、0 fail、0 skip |
| `npm run migrate` | 10/10 迁移在本项目独立开发数据库成功执行 |
| `npm run check:migrations`，SCRATCH_DATABASE_URL 指向同一独立测试库 | 10 个迁移重复两轮，全部通过；这是已有测试库的重入检查，初次空库初始化由上条命令验证 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 通过，exit 0；编译、类型、静态生成与 traces 均完成，5 个服务路由构建成功，未触发迁移 |
| `git diff --check` | 通过 |

Windows PowerShell 复验测试：将 `GONGZHI_TEST_DATABASE_ENV` 设置为 I 提供的 Git 外 database.env 路径，执行 `npm test`。测试会拒绝非 localhost/127.0.0.1 数据库；不设置该变量会明确跳过数据库用例，不能将跳过算成真实数据库通过。迁移前由操作者明确加载此项目 MIGRATION_DATABASE_URL，并设置 GONGZHI_DATABASE_ENABLED=true；build 没有迁移步骤。初始迁移需要 vector、pg_trgm、unaccent、pgcrypto。

数据库由 I 单独提供（其环境报告 PostgreSQL 17.11 / vector 0.8.6）；本轨实际以 crier_app 连接并验证其非超级用户、无 BYPASSRLS。负例覆盖并发重发、同 key 不同内容、跨所有者修改/撤销、旧 revision 采纳和提交、REST/MCP 相同拒绝、Agent 冒充采纳、密钥轮换与撤销、经验原文不可变、浏览器 Data API 无写权限、单 need 活跃 run、终态 CAS、截止时间、一个 run 一个结果、取消后迟到用量不归零，以及撤回后的结果/run 拒绝。

测试中的 DB timeout 输出属于上游超时负例的预期输出；`revalidateTag` 在非 Next 请求作用域内输出无缓存可失效的提示，测试仍检验真实 Postgres 提交。未关闭或删除 I 的数据库容器；C 测试和迁移客户端均已退出、关闭连接，已交回 I 独立验收。

## 真实限制和未执行项

- Supabase `getUser` 正常、无效凭据与上游故障使用本地 HTTP stub 验证；没有获准项目 Supabase 凭据，未进行 live Supabase 登录或真实网页登录验收。浏览器适配默认不可用，须配置本项目公开 URL/anon key 和明确启用开关；测试账号由获准项目操作者提供。
- 模型/知乎与独立外部 Agent 的当次真实帮助链未由 C 执行；D 负责连接，本文数据库测试不能当作真实模型协作证据。平台来源只表示服务器绑定的 actor/run；Source 声明不自动等于核实过全文。
- Builder 完整页面、实际浏览器 MSW scope/切模式和端到端操作，以及最终集成分支回归，由 B/I 验证。Core 构建不包含其他轨尚未合并的页面。
- 真实公告仅公开；network 和详情每次最多 100 条，未实现大规模分页，中文检索效果未专项验证。未部署公网、未开付费账号、未运行生产迁移、未接触其他项目数据库或 CLI 凭据。
