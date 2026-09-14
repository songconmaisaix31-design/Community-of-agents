# EvoMap 静态前端共治适配说明（2026-09-14）

## Atlas：100 位知乎专业 Fixture Agent（2026-09-15，当前）

普通合入已验收集成 `e4305e540b0eab4f196f2971bb2cd6be6b400657`，保留原 EvoMap 衍生页面、公告/线程、固定版本借用与 Cosmos 点图。“体验Fixture Agent”进入 `/zh/?demo=atlas`，持续显示“演示角色，非知乎官方认证或真实专家在线”；主页、公告、经验库、接入说明保留参数，退出回到真实 `/zh/`。100 个唯一专业与 Skill 参考，统一命名“知乎 XX 专家 Agent”；可搜索、选点或列表查看同一身份及来源，列表限制高度，移动端可找专业与查看参考。图始终保留 100 个 Agent 点，方法/任务/人物不成为节点。

A 为“知乎 需求共创 专家 Agent”（brainstorming），B 为“知乎 实施规划 专家 Agent”（writing-plans），与活动条件变化的合成示例一致：手动分享固定 v1 后 A 显示演示离线，B 搜索并下载带 Fixture 标识的 SKILL.md/完整引用，在 6 人室内 60 分钟 → 12 人户外 30 分钟的变化条件下点击模拟检查，回执明确“未真实执行”。不发反馈不会增加公告；只有审阅勾选后确认本地反馈才增加准确绑定 B/原 v1 的演示记录及一条模拟连线，能回读原文、联动筛选与重置。其余 98 位不自动生成任何交流、任务或回执，更新复用图实例和镜头，WebGL 失败保留列表。

公开参考来自 M 指定的公开索引，从中按协作、运维、数据库、后端、前端、设计、写作、产品、数据及研究测试挑选 100 个不同用途条目。全部原始 SKILL.md 已在固定提交 `5ed4ad9f815c192ad4aac0a6e6b11640d2ec2a8f` 实际只读读取：100/100 HTTP 200、frontmatter 名称与目录 title 全部相同，最大并发 4。验证脚本 `tests/frontend/evomap-atlas-fixture-sources.mjs --verify-remote` 只读取公开文本，未安装或执行；`--verify-report` 复核已有报告，避免重复外部请求。产品仅保留自写简短中文用途、原 Skill ID、固定原文链接及许可链接，不复制技能正文或脚本，不冒称原始作者，也不把 GitHub 技能当作知乎经验帖。内容许可链接指向固定版本的 [LICENSE-CONTENT](https://github.com/sickn33/agentic-awesome-skills/blob/5ed4ad9f815c192ad4aac0a6e6b11640d2ec2a8f/LICENSE-CONTENT)，第三方条目仍以[归属与单独许可](https://github.com/sickn33/agentic-awesome-skills/blob/5ed4ad9f815c192ad4aac0a6e6b11640d2ec2a8f/docs/sources/sources.md)为准；这两个原文路径另行读取均为 200。

隔离由显式 URL 选择决定，不能因 Fixture 脚本或目录加载失败而初始化真实客户/身份；失败显示演示加载错误并保留退出入口。没有覆盖全局 fetch、服务端身份或真实失败路径。仅 sessionStorage 的 `gongzhi.demo.atlas.v1` 保存四个进度布尔值，不读取或复制凭据；反馈用 C 生成客户端已有 `ExperienceFeedbackPayloadSchema` 校验但不发 API 请求。没有读 O 私有方法、未审核真实知乎资料，也没有模型、真实 Agent 账户、数据库或部署操作，原 test-results 保留。

验证：100 个来源已在线验证并从保存报告准确复核，新增浏览器专测 10/10 通过，`npm run typecheck`、六个修改 JS 的 `node --check` 与 `git diff --check` 通过。最终原前端与增量合并回归 **64/64 通过（1.8 分钟）**，`npm run build:backend` 完整通过（编译、类型、静态页与构建追踪完成）；构建跳过 build:client，构建后确认 C 生成客户端零差异。首片已推送 `bd92b208ab1dd213f5e5800774db131b412d722d`，100 角色为其后续增量。

复现命令：

```sh
node tests/frontend/evomap-atlas-fixture-sources.mjs --verify-remote
node tests/frontend/evomap-atlas-fixture-sources.mjs --verify-report
npx playwright test --config tests/frontend/evomap.config.ts tests/frontend/evomap.spec.ts tests/frontend/evomap-account.spec.ts tests/frontend/evomap-connect.spec.ts tests/frontend/evomap-experience.spec.ts tests/frontend/evomap-oauth.spec.ts tests/frontend/evomap-atlas-fixture.spec.ts
npm run typecheck
npm run build:backend
git diff --check
```

截图与公开源校验报告位于 `%TEMP%/gongzhi-atlas-fixture-f/`：`fixture-borrow-board.png`、`fixture-100-agent-graph.png`、`fixture-mobile.png`、`public-skill-verification.json`。这些是浏览器演练与公开参考可读性证据，**Mock 不等于真实执行**；真实 OAuth、Agent/模型任务和服务器发布均不在本轮 F 验证范围，集成与部署仍由 I 完成。

## OAuth 页面内会话查询返修（2026-09-15，覆盖下方首次返修的查询方式）

读取 I 集成 `836e7801171d6e4da7d261c7efec8ac4b870bb05` 的 `%TEMP%/gongzhi-oauth-i-836e780/oauth-browser.log`：第 1 流程通过（44.6 秒），第 2 流程在授权 UI 已落定后由 `page.context().request.get` 查询返回 401，后两项未跑；不能把浏览器正常会话等同于 Node APIRequestContext 在 HTTP 回环地址上的 Secure Cookie 行为。

本次仅把该单次只读 GET 移入当前 `page.evaluate`，使用相对路径 `fetch('/api/gongzhi/authorizations')`、`credentials: 'same-origin'` 和 `AbortSignal.timeout(15000)`，返回 HTTP status 与 JSON；由浏览器发送当前会话，不读取或复制 Cookie、不改 Secure 或浏览器安全设置。HTTP 200、ok/live、列表形状、完整 UI/服务端授权 ID 集合一致、本次 A grant 非空且在 B 两份列表均不可见的断言全部保留，当前唯一反馈弹窗的 usage/准确版本断言也保持不变。

本地 `npm run typecheck`、`git diff --check` 均通过，交付沿原分支普通 commit/push；没有业务代码、SDK、后端或配置变更，原 `test-results/` 保留。本轨不运行完整 54 项或 PG/真实浏览器回归，不操作数据库、3079 或云；Root 收到 SHA 后交 I 独占重跑真实四项，本次不宣称该复验已通过。

## OAuth 托管测试返修（2026-09-15）

读取 I 在集成产品 `f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4` 的两份真实日志 `%TEMP%/gongzhi-oauth-i-f9a0b33/oauth-browser-2.log` 与 `oauth-browser-3.log`，以及 I 的 `tests/integration/oauth-browser.spec.ts` 登录驱动，确认两处均为测试观察问题：第 2 条在登录前启动授权 GET 的 15 秒等待，计时包含 OAuth 往返、导航和绑定，先超时形成未处理拒绝；第 4 条页面背景历史反馈与正确的当前反馈弹窗都匹配 `.ex-feedback`，形成 strict mode violation，并非打开了错误产品记录。保留日志中的事实：第二次记录是 1 pass/1 fail/2 未跑，第三次是 3 pass/1 fail，均不记为四项通过。

本次仅修改 `tests/frontend/evomap-oauth-flows.ts` 与本说明。第 2 条先完成真实登录/绑定并等待授权 UI 落定，再用 `page.context().request.get` 共享浏览器 Cookie 单次只读查询（仍为 15 秒）；校验 HTTP 200、live、ok、列表形状、本次 A grant 非空且不在 B 列表，并轮询 DOM 核对 UI 授权 ID 集合与该会话服务端列表完全一致。第 4 条严格限定唯一 `.cm-dialog .ex-feedback`，继续核对本次 usage 和该面板中的准确版本返回按钮，没有使用 first 或允许历史内容。审阅其余响应/下载等待，均紧邻触发点击，未发现另一处跨 OAuth 导航或绑定的提前计时；没有提高全局超时或重试写入。

本地 `npm run typecheck`、`git diff --check` 通过；此任务没有修改 JS/页面/SDK/后端，没有启动浏览器 PG 套件、连接数据库、操作 3079 或云。当前测试文件与指定 f9a0b33 的修复前内容一致，无需为这两处修改额外合入集成历史，原 `test-results/` 保留。真实四项回归由 Root 转交 I 在其独占测试窗口合入后执行；本次 F **未宣称真实回归通过**。

## 知乎 OAuth 前端轮（当前，覆盖下方旧邮箱登录验收）

**最终开发交接（2026-09-15）**：已普通合入 C 最终 `ee269f4d58f6e58109188df5e8e0aa22802d4dc2`，并适配其退出失败先撤下身份的安全行为。实际复现原提示随账户重绘丢失（新 SDK 组合 18/19），窄修为跨重绘保留“退出结果尚未确认”，先收起写入控件、禁用新登录，再以共享 `auth.initialize()` 重新确认服务器会话；确认仍有效后可由人再次退出，成功后恢复登录入口。没有回退 SDK 的安全处理。中间回归另发现旧隐藏错误节点使测试选择器不唯一，移除该废弃节点。

最终同下方完整五文件 Playwright 命令 **54/54，1.2 分钟**，包含新 SDK 12 项、准确批准 7 项及原账户/导航/图全部回归；`npm run typecheck` 与 `node --check public/community/assets/account.js` 通过。最新安全截图 `%TEMP%/gongzhi-oauth-fixture-F-1789401907069/`。M 已明确开发验证后交 I：真实托管未配置 4 项、上游 fixture + 真 PG 的登录后 4 项和完整集成构建由 I 统一执行，F 无需等待该窗口；上述托管测试在 F **未执行**。真实知乎授权仍需用户项目配置与本人授权，未以任何 fixture、旧邮箱身份或打开授权页宣称成功。以下为保留的阶段记录。

从指定 `72dfd46f8c7b99d9a8c659ad95f50e3f206e18ea` 普通合并，消费 C 首片 `7cca7d54bd2d33097800220e7b5a318b690f8186` 的唯一 BrowserAuth / WebSession 契约，保留原分支与 `test-results/`。首片将邮箱/密码表单替换为使用知乎登录按钮和基础资料授权说明；不接收第三方凭据。startSignIn 只启动官方页面导航，返回 query 仅用于一次性提示，清除后仅按 initialize/onChange 的可信站内用户显示登录成功；错误、取消、过期、缺配置均显示实际失败。返回固定 `/zh?auth=…`（C 已订正文档首片中的旧路径）。

登录后显示会话姓名/安全头像，公开发言称呼独立展示；有限 Agent 授权、准确内容 public 审核、换人/退出清稿和迟到响应隔离保留。同身份会话刷新不重建输入。前端不复制客户端、Cookie 或身份框架，生成浏览器客户端由 C 交付。

首片阶段：页面 `node --check public/community/assets/account.js` 通过，账户组 15/15 为明确 BrowserAuth/HTTP 测试替身；当时服务端/SDK 尚待 C 交付。缺本项目 App ID/App Key/登记 callback 与用户本人官方授权，**未验证真实知乎 OAuth**；下方历史官方 GoTrue 邮箱 4/4 不代表新登录通过。

第二片已普通合入 C `87e38d60de153e1e1ba7ed00377ab54ada2b1387`（包含 D 官方适配器），首片 F 为已推送 `7701f1db160b9533aa6f3c122fbd3b1274437e27`。三个现有页面页头增加登录/账户链接，手机菜单和原 Agent 接入入口保留；从官方页面返回的 BFCache 恢复登录按钮，身份仍由 SDK 重新确认。实际 Core 生成客户端的 `evomap-oauth.spec.ts` **12/12**，经验组改用同源 session HTTP fixture，**7/7**；typecheck 与 JS 语法检查通过。新 OAuth 检查覆盖未配置、503、六类返回提示、伪造 success 标记、真实可信姓名头像、只存无秘密刷新信号、限定官方授权域名、导航不等于登录、退出失败、跨标签清稿、会话到期、同身份刷新保稿与失联撤下写入权限。全部是隔离 HTTP fixture，不调用知乎。

首次实际 SDK 组合执行为 14 pass/2 fail：测试错误地禁止了 SDK 的无秘密刷新信号，并使用错误授权端点；按 C/D 固定契约修正 fixture 后 OAuth 12/12，保留“错误域名必须拒绝”单独用例，没有放宽客户端守卫。安全截图 `%TEMP%/gongzhi-oauth-fixture-F-1789401465469/login-desktop-fixture.png` 与 `login-mobile-fixture.png`，390px 实际渲染可读、无溢出。

托管验收明确分层：`evomap-live.spec.ts` 现在只在 `GONGZHI_BROWSER_LIVE=true` 且 I 托管窗口中访问固定 3079，严格要求 zhihu/provider 与 available=false，验实际未配置、匿名 session/401/start503、无效回调和本地草稿零上传；没有资源覆盖、凭据文件读取或写库测试。原四项邮箱用例的业务流程迁至 `evomap-oauth-flows.ts` 导出的 `defineOAuthBrowserFlows({base,evidence,login})`：I 在独立测试文件内注册它，login 接受 Page 与 A/B，必须走实际 start、同一浏览器 Cookie、authorization_code/state callback、session，不能 addCookies 伪造身份；上游仅经 C handleWebAuth 函数参数注入 fixture。仍验证精确新 grant 撤销、两身份隔离、公开求助回复、缺模型如实失败、准确批准/版本下载/独立反馈/跨标签退出。I 需提供独立受控 runner/真实 PG；本文件不连接数据库或修改生产 runtime，尚未执行该新托管四项流程。

2026-09-15 最终本地全量命令：`node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts evomap-account.spec.ts evomap-experience.spec.ts evomap-connect.spec.ts evomap.spec.ts evomap-oauth.spec.ts` → **54/54，1.1 分钟**；`npm run typecheck`、`node --check public/community/assets/account.js`、`git diff --check` 通过。全量首跑 53/54，失败因测试要求刷新信号必定存在；SDK 的 pageshow/initialize 可以合并回读而不写信号，改为严格只允许空存储或精确信号格式，任何身份/凭据仍拒绝，随后完整 54/54。最终安全截图目录 `%TEMP%/gongzhi-oauth-fixture-F-1789401642701/`。F 未重跑全 Next 构建，由 I 合入最终服务后统一构建；未执行 Docker、数据库/Auth 迁移、生产部署、第三方授权或收费调用。

## Codex F 接管：经验分享首片

### 最终验收（2026-09-14，本节优先于下方阶段状态）

前端业务终片 `6a138f64bce6471de094222ff02eb924d688aab8`、真实测试固定片 `e74314010926047ce93f082ad6da3a0435edfaf1`，均已普通 push 原 `songconmaisaix31-design/gongzhi-kimi-adaptation`。I 最终实际托管 `43af491af6b13b7da2d481045334dd7579f83e3d` 于3079：在已编译88e7后端基础上装入最后5行静态修复，模型仍未配置。F 实际访问该原站，**不覆盖 HTML、JS、CSS，不改变浏览器安全策略**。

| 验证命令 / 环境 | 实际结果 |
| --- | --- |
| `node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts evomap-account.spec.ts evomap-experience.spec.ts evomap-connect.spec.ts evomap.spec.ts` | ed232955 全量 41/41；覆盖桌面/390px/键盘、真实生成客户端、API错误、无WebGL、canvas镜头、准确批准与首次请求取消。均为明确 HTTP fixture，非真实模型。 |
| 同配置 `evomap-experience.spec.ts` | 新增直接人类发布最终 public 确认后 7/7；最后退出清稿修复再单独 `-g '身份退出'` 1/1。总计42个不同 fixture 用例，未把增量复跑说成另一轮全量42。 |
| `npm run build:backend` | ed232955 完整 Next 生产构建通过，未重写生成客户端、未隐式迁移；最后静态5行 `node --check public/community/assets/experience.js` 通过，并由I实际托管验证。 |
| `npm run typecheck` | e743140 最新代码与测试通过，退出0。 |
| `GONGZHI_BROWSER_LIVE=true GONGZHI_FRONTEND_SOURCE_OVERLAY=false` 后运行 `node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts evomap-live.spec.ts` | 最终43af实际托管、官方GoTrue 56641与真实PG：**4/4，17.4秒**。中间88e7也4/4、26.7秒，明确单列，最终以43af为准。 |

四项真实流程：本人登录/已有身份/只签发撤销本次grant/发布求助/回复/助手缺配置失败/退出；第二账号只读前者公开内容且无所有者操作、能独立回复；错误密码真实拒绝；双账号准确内容批准分享、上传回执、A授权撤销后B仍下载固定版本、B独立批准反馈并按实际speaker回读和返回原经验，390px手机流程通过。最后以真实Supabase跨标签退出验证旧页未上传草稿清空。测试中的Agent由程序登记和上传，所有内容明确标注协议验收；这些结果不等于真实Agent思考或现实业务任务完成。

安全原始日志在 Git 外 `%TEMP%/gongzhi-f-live-final-20260914-225639.log`；截图目录 `%TEMP%/gongzhi-evomap-live-F-1789397801133/`，包括 `live-signed-out.png`、`live-other-account.png` 和390px视口 `live-experience-feedback.png`。日志没有令牌/密码；只在令牌收起后手动截图，自动trace/screenshot/video关闭，测试结束关闭页面避免自动错误上下文留登录值。每次新证据目录独立，原 `test-results/` 保留，历史授权与记录保留，仅按本次服务返回的精确ID撤销测试grant。

真实剩余限制：平台助手的首次运行取消、预算与unknown状态已有HTTP fixture，缺本项目模型配置/单次及每日预算时未发起收费模型调用，因此没有真实模型取消或费用账单验收。Kernel为可选本机工具，其当前仅start/status/stop/result的版本限制见D技术文档，不宣称多Agent拆分。第一版分享仅public，无私有群组ACL；脱敏为辅助，仍须人审核。未读其他账号/私密记忆，不代替D/I实际Agent互助验收，不执行Docker、数据库迁移、云部署或公网切换。

下方是分阶段记录，包含当时失败和等待状态，保留以说明修复依据。

退出隔离后继：补测试实际复现“退出后同页重新打开草稿仍见上一身份正文”（1 fail），以账户代次变化清理本页草稿和批准操作键缓存，单项回归 1/1。同一身份正常刷新令牌仍保留草稿，不持久化原文。真实双账号流程将覆盖桌面分享及390px借用/反馈；当前仍等 I 切换恢复窗口，未擅自请求3079。

当前本地验收：`node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts evomap-account.spec.ts evomap-experience.spec.ts evomap-connect.spec.ts evomap.spec.ts` 为 41/41；随后补人类直接分享最终确认用例，经验组为 7/7（其余代码未变）。`npm run build:backend` 已通过完整 Next 生产构建，未重写 Core 生成客户端，未执行迁移。旧 `test-results/` 保留。新增真实双账号经验测试尚待 I 的3079窗口：A准确批准分享并撤销授权，B仍可下载固定版本、独立批准反馈；程序注册/上传明确只是 UI/HTTP 协议测试，不冒充实际 Agent 思考或业务执行。所有 live 测试显式门控，核对指定私有账号文件的实际路径与完整3079/56640/56641隔离配置；失败前后不截取凭据，测试结束关闭页面，避免自动错误上下文保留登录值和一次性授权。

第三片普通合入 Core `6bf6e3028d6e3ac3fd047a5b3c7f209c811fdd2b` 与 D `a833303e229131b970e4a75d50a25cc980408705`：按请求运行助手在同步 POST 尚未返回时，只按本人原 need_id / idempotency_key 有界读取 `lookupRun`，取得真实 ID 后可调用取消。自动查询最多 65 秒、单次读取最多 4 秒，关闭面板停止本地定时与在途读取；不会启动后台模型。断连无 ID、null、unknown 保留原键到同标签页 sessionStorage（仅运行参数/回执，无凭据），禁止据 null 重开。预算和费用只展示真实 `Run.budget` 快照；未知用量保留预留，旧回执费用未知。`evomap-account.spec.ts` 15/15，含首次挂起 POST 的真实取消按钮、迟到 running 不覆盖取消、断连原键查询、关闭停止自动查询。此为 HTTP fixture，未调用真实付费模型；实际部署与缺配置失败仍待 I 托管后检查。

第二片：批准预览增加简单编辑代次和身份代次守卫，异步列表/发送/回执都核对同一准确快照；规范化内容与下载草稿完全一致。正文、适用条件、版本、来源署名直接可读，完整 JSON/固定键放展开区；响应丢失冻结内容并保留批准操作键，查询与撤销也不跨会话显示回执。经验反馈公告可回到准确原版本、按实际 speaker 定位 Agent；旧成果引用改为固定版本，保留原图与镜头。人类直接分享增加最终 public 确认。

实际复现同账号会话刷新清空未提交称呼，窄修为同人刷新不重建表单、身份读取去重且有加载态；回归从 1 fail 到 1 pass。第二账号实际浏览器在身份恢复前打开线程时无回复入口，窄修为身份就绪后补齐当前线程操作，不靠重复点击。首轮完整 fixture 35 pass / 3 fail（新增选择器标签），修复明确可访问名称及错误容器类名后经验组 6/6。typecheck 通过。真实 3079 原页面第一流程通过，但整组仍待修复复验；HTML 源码覆盖触发浏览器 loopback 网络策略，已撤掉该方案，不改浏览器安全。JS/CSS 覆盖仅用于原页面定位，新页面最终以 I 实际托管3079后的结果为准。

保留 Kimi WIP `688a372cd3780cc72fd49ea2fdc3d1a6b5b8abab` 并普通 push，普通合入 C `502d46621db03befb01cf94f22c98fc0fb99d595` 与 D `e857fec9ecd803dad37b09aa82054430922c5de2`。既有 `test-results/` 原样保留。

公告页增加经验库与本地草稿工作区（`assets/experience.js/css`），复用 Core 唯一 schema/client。只读取明确选择的单份文本或 content JSON；预览、编辑、辅助脱敏、下载均不上传。准确内容预览后选择本人有相应权限的已登记 Agent，并明确勾选 public，才能生成 15 分钟单次批准 ID；下载准确草稿交既有 D upload-draft，批准 ID 不嵌入草稿，不接触人类 token。借用按摘要搜索到固定版本，可下载 SKILL.md / 完整引用 JSON，反馈生成独立本地草稿再批准。

首片 `node --check public/community/assets/experience.js` 通过，`node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts evomap-experience.spec.ts` 为 3/3（真实生成客户端与 HTTP fixture）：本地零上传、严格草稿格式、脱敏稳定键、390px 键盘、固定版本下载与反馈、404 明确失败。真实登录返修与完整验收仍在进行，不能视为已完成真实流程。新增 `evomap.config.ts` 沿用 Playwright/Chrome，输出到新的 Git 外临时目录，不覆盖旧失败证据。

用户决定：以主目录 `C:/Users/DW/orca/Community-of-agents`（http://127.0.0.1:8123/zh/）展示的 EvoMap/知乎静态前端为视觉权威，放弃 Hugo 与上一轮 CommunityPage 新壳。本轮把该静态前端的选择性资产适配为共治叙事，交付于 `public/community/**`，由 I 把 Next 的 `/zh/` 及子路径映射到这些 HTML，根入口导向 `/zh/`。后端（Crier/Next、身份、模型、存储）不动。

## 交付与路由

| 路由（I 映射） | 文件 | 内容 |
|---|---|---|
| `/zh/` | `public/community/zh/index.html` | 主页：hero（刘看山 + 双主入口）、公开公告板（真实 API）、Agent 交流星图（cosmos.gl）、如何参与、页脚 |
| `/zh/board/` | `public/community/zh/board/index.html` | 真实公告列表：类别筛选、搜索、分页、公开线程对话框；发布入口说明；示例空间显式标记入口 |
| `/zh/connect/` | `public/community/zh/connect/index.html` | 接入指南：三步流程、五种授权范围、既有 CLI 登记命令、平台 Agent 真实回执说明、真实/示例边界 |

数据只请求同源 `/api/gongzhi/**`（board、threads/:id、records/:id、agent-graph），响应按 `{ok,data,mode}` 校验，非 `live` 或错误一律展示明确不可用，不回退示例数据。

## 保留 / 删除映射

保留（复制到 `public/community/`，引用改为 `/community/...`）：

- `assets/app.css` ← `_next/static/chunks/02uk5788vxt77.css`（原站打包样式，补丁见下）
- `assets/zhihu-theme.css` ← 主目录 `zhihu-theme.css`（知乎浅色强制覆写，原样）
- `assets/kanshan.js` ← 主目录 `kanshan.js`（刘看山，改资产路径与双入口链接）
- `brand/kanshan/{idle,wave,sleepy,computer}.gif` ← 用户提供 IP 素材
- `media/Outfit-Variable.ttf`、`media/Rajdhani-SemiBold.ttf` ← 本仓 `public/fonts/`（OFL 许可见 `public/fonts/`）
- `icon.svg`、`logo.svg`、`favicon.ico` ← 主目录同名文件
- 主页 SSR 片段：hero 装饰 SVG（fine-rings/射线，静态）、`home-hero-title`/`home-hero-subtitle` 钩子类、header/footer 的 Tailwind 类结构

删除（不携带）：

- 全部 `/_next/` JS chunk（原 React hydration，会还原旧品牌并向 evomap.ai 发请求，且有已知 #418 警告）
- `serve.py` 反向代理与 200 空成功兜底；campaign 营销横幅（EvoX / 15 美金额度）
- 虚构统计（累计节省 Token、收录资产、命中率等）、积分/定价/排行榜/基因进化/胶囊市场叙事与对应栏目页
- `app2.css`（KaTeX 数学排版与字体模块，内容页用不到；字体变量类已摘入 `community.css`）
- harmonyOsSansSc 字体引用（字体文件只在 evomap.ai 源站，本地快照本就不含；中文回落系统字体栈）
- `/api-grant/hero-bg.jpg` 背景图（同样只在源站，已从 CSS 补丁移除）
- 原站用户数据、二维码、账号/埋点、语言切换与登录注册按钮（静态壳不伪造身份入口，接入流程见 `/zh/connect/`）

对 `app.css` 的补丁：移除 hero-bg 图层；`@font-face` 中 outfit/Rajdhani 的 woff2 引用改为本站自托管 TTF；删除 harmonyOs 系列 `@font-face`。

新增（本站自有实现）：`assets/community.css`（公告卡片/筛选/线程对话框/点图容器/移动导航，全部消费原 `--c-*` 令牌）、`assets/community.js`（移动导航、真实公告读取、线程、证据回读、点图装配）、`assets/graph-src.mjs` → `assets/graph.bundle.js`（esbuild 打包本仓 `@cosmos.gl/graph`，与既有 `AgentCanvas.tsx` 同参数：Agent-only 点、evidence 连线、随机种子 27、保留镜头）。

## 交互

- 公告：类别筛选（求助/经验/回复/补充/成果）、客户端搜索、游标分页「读取更多」、点击卡片打开公开线程；读取失败显示错误与重试，不展示假数据。
- 点图：`/api/gongzhi/agent-graph` 驱动；点可点选、线可点击回读双方公开原文（校验 reply_to/thread 一致性）；点图失败时 Agent 列表与公告仍可用。
- 导航：桌面导航 + 移动汉堡菜单均为真实链接；不支持的动作（网页直接发布、网页签发授权）在页面文案中说明路径，不放空按钮。
- 主题：按视觉权威锁定知乎浅色（MutationObserver 保持 `data-theme="light"`）。

## 审阅返修（首轮代码审阅后）

- `api()` 校验 HTTP 状态与响应形状，500 但 `ok:true` 不会被当成成功。
- 「读取更多」失败时显示错误、保留已载入记录、可再次尝试；不吞错误。
- 公告与星图双向联动：点 Agent 芯片或点图节点按发言人筛选公告（可一键清除），公告记录可反向定位 Agent。
- 证据回读校验双方 `speaker_id` 与 `reply_to`/`thread` 一致性，不匹配的边不作为交流证据展示；线程支持 `next_cursor` 读取更早记录。
- 对话框打开聚焦、Tab 限制在面板内、ESC 关闭并恢复焦点。
- kanshan.js 主页检测同时匹配 `/zh`、`/zh/` 与直接预览路径；点图 `onClick` 接入公告筛选，数据更新复用稳定 ID 与既有位置，仅首轮 fitView。
- `/demo/space` 已由 I 重定向到 `/zh`，不再是示例：全站删除该入口，避免误指真实页。
- 许可随资产：`media/Outfit-OFL.txt`、`media/Rajdhani-OFL.txt`、`assets/cosmos.gl-LICENCE.txt`（MIT）。
- 主页 `<title>` 简化为「共治」；hero 高亮统一知乎蓝；次级文字对比度提升。

二轮实测返修：

- `api()` 把 HTTP 状态守卫放在成功分支之前：500 即使带 `ok:true` 也按失败处理（回归测试覆盖）。
- 对话框打开即聚焦关闭按钮，焦点落在面板或外部时 Tab/Shift+Tab 都先收回面板内，首个 Shift+Tab 不再逃逸到页脚。
- 子页首节 `padding-top` 避开 80px 固定头（390/1440 实测 heading.top > header.bottom），锚点 `scroll-margin-top` 留偏移。
- 删除 9 字节文本占位 `favicon.ico`（HTML 只引用有效 `icon.svg`）。
- 说明：3029 固定首片快照上的 chip 筛选失效属旧版，返修版联动已在两种托管模式验证。

## 验证

- `tests/frontend/evomap.spec.ts`（Playwright，channel chrome）：主页层次/双入口/公告筛选/线程分页与焦点恢复/星图公告双向联动/无营销词/无第三方请求；公告页 503→明确不可用→重试恢复；接入指南内容；390 宽度无横向溢出与移动导航。静态文件服务器模式与真实 Next 托管模式（`GZ_EVOMAP_BASE`）均 6/6 通过。
- `npm run typecheck` 通过；`npm test` 97 pass 0 fail（7 项需真实服务跳过）。
- 截图：`%TEMP%/gongzhi-evomap-adaptation/`（home-1440、board-recovered、connect-1440、connect-390）。

## 限制

- 真实数据形态依赖 I 完成 `/zh/` 托管映射与 `/api/gongzhi` 同源可用；本轮验证使用 HTTP 替身，不代表真实后端已联通。
- 中文使用系统字体回落（HarmonyOS 字体文件仅在源站，不可拉取）。
- 发布与授权签发需要身份入口，静态壳只提供说明，未伪造。

## 三轮：真实写入接入（登录/授权/发布/决策/平台回执）

新增 `assets/account.js`（本域自有），只消费 C 交付的 `/community/assets/gongzhi-client.js`（`createGongzhiBrowserClient()` → `{config, auth, api}`，约定见 msg_91bc0aaa22d7）；客户端缺失或登录未配置时登录区明确"不可用"，公开公告读取不受影响。不复制认证框架，不另写类型。

- 接入页 `#account`：邮箱密码登录/退出（共享 Supabase adapter）；首次登录登记公开称呼绑定"人"身份（`POST /owners`，服务端幂等）。退出后敏感 UI 清理。
- 接入页 `#scopes`：勾选 5 种 scope + 有效期直接签发授权（`POST /authorizations`）；令牌仅首次显示一次，可复制、可手动收起，不写 localStorage；已有授权列表与撤销（`DELETE /authorizations/:id`）。
- 公告页：登录后出现发布条，可发求助（`POST /needs`）与经验（`POST /experiences`），发布前有公开提示。
- 线程对话框：登录后可回复/补充（`POST /discussions`）；求助线程顶部展示需求详情（版本/状态/有效期/限制/期望）、成果与来源（`GET /needs/:id`）。
- 所有者操作：对当前版本成果采纳/请补充/暂不采纳（`POST /needs/:id/decisions`，带 expected_revision）、关闭需求（`/close`）。
- 平台助手：仅本人需求可发起 `POST /runs`，等待并展示服务端真实回执（含用量与错误）；非终态可查询最新状态（`GET /runs/:id`）与取消（`DELETE`）。无过程动画，服务未配置时展示明确失败。
- 写操作一律保留草稿与同一幂等键（`web-<uuid>`），失败不自动重发为新动作；成功后才更换键。
- `community.js` 仅加钩子：线程对话框给需求详情槽位与 `window.GongzhiCommunity`（openDialog/refreshBoard/reopenThread 等），读取与图逻辑不变。

### 三轮验证

- `tests/frontend/evomap-account.spec.ts`（Playwright，channel chrome，HTTP fixture + 测试替身 gongzhi-client，仅验证页面行为与请求形状）：客户端缺失降级、登录失败/成功、授权签发 500→同一幂等键重试成功、令牌一次显示与收起、撤销、退出清理、发布求助草稿保留、线程回复/采纳/run 回执的请求形状核对。4/4 通过。
- 既有 `evomap.spec.ts` 6/6 回归通过；`npm run typecheck` 通过。
- 截图：`%TEMP%/gongzhi-k-live/`（account-unavailable、grant-flow、publish-need、need-detail-owner）。

### 三轮限制

- C 的 `gongzhi-client.js` 尚未合入本分支；本轮用约定接口的测试替身验证，接到真实文件后需回归（导出形状若有出入，适配点集中在 account.js 顶部初始化一处）。
- 真实 Auth/数据库/平台模型执行未验证（无配置）；fixture 不证明真实链路通过。

### 三轮返修（合入 C 客户端 7ded401 后）

已普通 merge C 首片 `7ded401`（真实 `public/community/assets/gongzhi-client.js` 与 `/api/gongzhi/config`），account.js 初始化一处即兼容，无导出出入。按主控早审修复 5 项真实链路缺陷并各配 UI 负例：

1. 线程回复带 `reply_to_id`（线程根记录，留下可回读交流依据），求助线程先 `readNeed` 取当前版本再带 `expected_revision`，不再用过期快照。
2. 采纳/关闭的请求键按"同一次意图"固定在渲染闭包内，失败重试不换键（此前每次点击换键）。
3. run 回执只在终态（succeeded/failed/cancelled/timed_out）换请求键；`unknown` 保留原键与原任务，提供"查询最新状态"入口并明确"不要直接重新请求"。
4. 退出失败可见（不再静默吞错）；登录/登记等非幂等请求的错误提示不再套用请求键文案。
5. 方法引用可打开对应经验（版本不一致明确标注"引用的是第 N 版"）；来源渲染作者与安全 http(s) 原文链接（noopener）。

另修：真实客户端返回 `auth.available:false` 时未触发重渲染，登录区卡在"正在确认"（真实文件接线冒烟测试抓出，替身测试未覆盖）。

### 三轮返修验证

- `evomap-account.spec.ts` 6/6：新增真实 `gongzhi-client.js`（非替身）+ 拦截 config 的接线冒烟；决策 500→同键重试；回复形状含 reply_to_id/expected_revision；方法引用打开与版本标注；unknown 回执保键与查询入口。
- 既有 `evomap.spec.ts` 6/6 回归、`npm run typecheck` 通过。

### 三轮返修 2（主控 follow-up）

- 回复解析线程根：公告卡可能是求助线程内的回复/成果，先 `readThread` 判根类型，根为求助再 `readNeed(thread_id)` 取当前版本带 `expected_revision`；`reply_to_id` 始终保留被点击记录，留下可回读交流依据。
- 签发/发布/回复全部冻结 payload 与请求键：首次提交后重试不采用编辑后的值、不静默换版本；明确的版本冲突或不可重试失败才解冻，由人决定作为新意图重发。版本解析本身失败不算已发出意图，允许重建。
- 换号清理：身份切换/退出递增身份代际并清理一次性令牌与待发敏感状态（同一人令牌刷新不算切换）；`listOwners` 迟到响应按代际丢弃，不写入过期身份。
- 平台回执沿用 D 说明：HTTP ok 不等于成功，UI 只按 `data.status` 展示（succeeded 才显示"已提交成果"），failed/cancelled/timed_out/unknown 原样保留。

### 三轮返修 2 验证

- `evomap-account.spec.ts` 8/8：新增回复卡在线程内（expected_revision + reply_to_id=被点击记录）、响应丢失后编辑再重试（payload/键不变）、换号回归（迟到响应丢弃、令牌不跨账号）；测试同步补齐替身客户端 readThread/readExperience，换号存根按调用次序返回对应身份。
- 既有 `evomap.spec.ts` 6/6、`npm run typecheck` 通过。

### 三轮返修 3（主控 follow-up 2/3/4 + I 交接）

- unknown 不再按 retryable:false 解冻：只有明确终态拒绝（invalid_request / idempotency_conflict / revision_conflict / immutable）解冻；unknown 保留原 payload 与键，错误提示引导对账（不修改直接重发或核对公开记录）。
- 线程根解析改用 `readRecord(thread_id)`（分页首屏可能不含根）；回复类型与正文在意图创建时捕获，异步读取返回后不再重读控件。
- 在途写回调全部按身份代际（sessionGen）守卫：签发成功不再把迟到令牌带给新会话，登记成功不再覆盖新会话身份；真实换号/退出时关闭属于旧身份的对话框，同一人令牌刷新不动草稿。
- 接入页 #cli 链接 I 托管的 `/agent-skill.md`（单一来源，不复制接入文档）。

### 三轮返修 3 验证

- `evomap-account.spec.ts` 9/9：新增线程首屏无根（readRecord 取根）、unknown(retryable:false) 冻结与对账提示（编辑不进重试）、换号强化（在途签发/登记的迟到响应均被守卫）。
- 既有 `evomap.spec.ts` 6/6、`npm run typecheck` 通过。
- 遗留非 K 域：Auth 跨域 OPTIONS 的 CORS 由 C 修复（I 在真实 Chrome 联调发现，与本页表单无关）。

### 三轮返修 4（换号隔离最后一段）

回复提交在 readRecord/readNeed 异步解析期间若身份变化，发送前校验 sessionGen：已变则终止发送并解冻，不用新人令牌发旧内容（对话框已随身份变化关闭）。测试：根读取延迟 1.5s 期间退出登录，`postReply` 零调用。

### 三轮返修 4 验证

- `evomap-account.spec.ts` 10/10（新增换号零发送用例）；`evomap.spec.ts` 6/6；`npm run typecheck` 通过。

### 三轮返修 5（I 跨标签复现）

`renderPublish` 在 `!signedIn` 时早退导致旧身份发布条残留：改为缓存匿名静态说明，退出/换号/未绑定时恢复，不残留旧 DOM。回归断言：退出后发布条消失、`#need`/`#experience` 静态说明恢复。验证：`evomap-account.spec.ts` 11/11、`evomap.spec.ts` 6/6、typecheck 通过。

## 四轮：知乎原生 Agent 互助定位（窄改，未动交互/后端）

按用户最新定义与主控校准改叙事与来源展示，视觉、看山、cosmos.gl 与全部既有操作/修复原样保留：

- 首页 hero/公告/星图/如何参与、接入页与公告页文案统一为：以知乎的问题、经验与讨论为重要信源，不同人的 Agent 围绕用户的真实任务相互求助，成果沉淀为可复用经验；明确知乎作者只是来源作者、不代表官方身份或已批量同步讨论（当前本项目适配为摘要级检索；官方新版资料的回答摘要/评论等能力由 D 独立适配，本页不承诺已上线）。
- 公告空状态改为友好引导（真实任务求助 + 借鉴知乎经验），不为真实服务填 fixture。
- 成果来源按现有 Source 字段结构化展示：类型（知乎/经验/链接/其他）、摘要/全文/参考、作者、检索时间、摘要 excerpt、安全 http(s) 原文链接（noopener）；字段缺失不虚构。经验引用仍可打开对应经验并标注版本差异。
- 平台 Agent 说明写明：知乎工具未配置时明确返回不可用。

### 四轮验证

- `evomap.spec.ts` 6/6 与 `evomap-account.spec.ts` 11/11 回归通过（含来源卡片新边界断言：知乎来源完整字段 + 缺字段来源不虚构作者/链接）；`npm run typecheck` 通过。未在 3039 或任何实际库创建数据；数据库清理属 Core 且待用户明确范围。

### 四轮早修校准（msg_02aa83e18d65 / msg_dd2e91ebb6a7）

- 任务来源不收窄：主流程与空状态统一为"围绕用户的真实任务求助，借鉴知乎经验与讨论"，不再写"围绕知乎上的真问题"。
- 机制不过度保证："每条成果标明来源"改为"查看成果时可核对实际来源与引用"（sources/method_refs 可为空）；"沉淀为可引用经验"改为"获授权 Agent 另存为可复用经验"，不暗示自动转化。
- `evomap.spec.ts` 6/6 回归通过。

### 四轮早修校准 2（msg_3b2259db5ccf）

- 平台 Agent 边界改为：模型未配置时无法运行；知乎检索未配置时会说明限制，不声称已检索知乎（executeAssistant 可复用站内经验，不缺知乎即整体不可用）。
- 成果来源区域标题简化为"引用来源"，不向用户暴露实现细节；来源卡片字段如实显示不变。

## 五轮：已有 Agent 接入 hero（MCP / curl / CLI）

- `/zh/connect` 重构为 EvoMap 式连接面板（沿用知乎浅色 + 深色终端块，不引入原站品牌/GEP/积分叙事）：顶部"给 Agent 的接入说明"卡（同源 `/agent-skill.md` 地址 + 建议提示语，均可复制）；MCP / curl / 客户端 CLI 三选项卡（roving tabindex + 方向键），内容取自 D 的公开片段（agent-skill.md 254f17c）：公开 curl 只读、MCP Streamable HTTP 通用描述与 JSON-RPC 初始化模板、既有 CLI 登记/读取命令；不含 grant/密钥，登记安全流程仍指向 `/agent-skill.md` 单一来源。
- `public/community/assets/connect.js`（新增）：ORIGIN 占位替换为 `location.origin`；复制按钮用 Clipboard API + execCommand 降级，aria-live 反馈；选项卡键盘操作；"公开读取检查"匿名只读 `/api/gongzhi/connect` + `/api/gongzhi/board?limit=5`（Promise.allSettled，单项失败如实显示另一项保留），结果明确标注"匿名公开读取，不代表已登记或在线"。已登记身份核验仅展示由 Agent 宿主执行的 `GET /api/gongzhi/agents/me` 片段，页面不接触 Agent 密钥。
- 首页新增 `#quick-connect` 快速接入带：同源说明地址 + 复制 + 进入接入页/公告板；主页与接入页均加载 connect.js（无 [data-cx] 时不动作）。
- 原独立 `#cli` 区块并入"客户端 CLI"选项卡（锚点 `#cli` 保留在选项卡栏，页脚链接不受影响）；`#account`/`#scopes`/`#platform`/`#honesty` 及 account.js 全部写路径未动。
- 依赖说明：C 的 `readConnect()/agentStatus()` 客户端方法（465f74ee）已经 Root 授权直接 merge 消费（merge 保留 provenance，不改 C 写域）。连接检查用共享 ESM 导出的 `createApiClient("live", {fetch: 有界 fetch})`（不传 accessToken、不经过 createGongzhiBrowserClient，匿名读取不依赖 /config 或人类 Auth）：`readConnect()`（仅能力描述，无数据库）+ `discoverBoard({limit:5})`（实际服务读取）并列展示；`data` 缺 `records` 数组或能力描述不完整不当作成功/0 条；import/初始化与请求均 15 秒有界超时（测试用 `__CX_CHECK_TIMEOUT_MS` 缩短），失败清理缓存可再点重试，按钮在所有路径恢复。
- D 最终片 202dee1 已同步：CLI 选项卡含 `connection`（匿名发现，identity_verified:false）、`register <稳定请求键>`、`status`（已登记身份核验）、`board/graph`；身份核验区不含任何 Bearer/Agent key 片段，只指向 CLI status / MCP agent_status 与 `/agent-skill.md` 单一来源，页面无粘贴密钥入口。

### 五轮验证

- `tests/frontend/evomap-connect.spec.ts`（新增）10/10：选项卡点击/方向键/面板互斥；ORIGIN 同源替换与真实剪贴板复制（含 curl 片段内容）；公开读取检查成功/失败两态与"不等于已登记"标注；公告 `data` 缺 records 不当作成功或 0 条；挂起请求有界超时（真实生成 ESM + abort）且按钮恢复；/config 失败不影响匿名检查（不经过 createGongzhiBrowserClient）；页面无 Agent 密钥片段/粘贴入口；390 宽度选项卡/复制可见且无横向溢出；首页快速接入带复制与跳转；全程无第三方请求。`evomap.spec.ts` 6/6（接入页断言随新结构更新）、`evomap-account.spec.ts` 11/11 回归通过；`npm run typecheck` 通过。fixture 只拦 HTTP，客户端为真实生成的 gongzhi-client.js，未触真实后端/数据库。
